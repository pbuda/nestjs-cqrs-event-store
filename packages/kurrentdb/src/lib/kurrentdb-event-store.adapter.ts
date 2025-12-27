import { Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  KurrentDBClient,
  jsonEvent,
  START,
  END,
  FORWARDS,
  BACKWARDS,
  streamNameFilter,
  eventTypeFilter,
  type ResolvedEvent,
  type AllStreamResolvedEvent,
  type Position,
  type StreamSubscription,
  type AllStreamSubscription,
  type Filter,
} from '@kurrent/kurrentdb-client';
import {
  IEventStoreAdapter,
  EventEnvelope,
  RecordedEventEnvelope,
  ResolvedEventEnvelope,
  AppendResult,
  ReadStreamOptions,
  Subscription,
  SubscribeToStreamOptions,
  SubscribeToAllOptions,
} from '@pbuda/nestjs-event-store';

/**
 * KurrentDB implementation of IEventStoreAdapter.
 *
 * Connects to KurrentDB (EventStoreDB) for persistent event storage.
 * Supports event appending, reading, and catch-up subscriptions.
 */
@Injectable()
export class KurrentDbEventStoreAdapter
  implements IEventStoreAdapter, OnModuleDestroy
{
  private readonly client: KurrentDBClient;

  /**
   * Create a new KurrentDB adapter.
   *
   * @param connectionString - KurrentDB connection string
   *   Examples:
   *   - "kurrentdb://localhost:2113?tls=false" (single node, insecure)
   *   - "kurrentdb+discover://admin:changeit@cluster.example.com" (cluster with discovery)
   */
  constructor(connectionString: string) {
    this.client = KurrentDBClient.connectionString(connectionString);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.dispose();
  }

  async appendToStream(
    streamId: string,
    events: EventEnvelope[],
    expectedRevision?: bigint
  ): Promise<AppendResult> {
    const kurrentEvents = events.map((event) =>
      jsonEvent({
        id: event.id,
        type: event.type,
        data: event.data as Record<string, unknown>,
        metadata: event.metadata as unknown as Record<string, unknown>,
      })
    );

    const result = await this.client.appendToStream(streamId, kurrentEvents, {
      streamState: expectedRevision,
    });

    return {
      nextExpectedRevision: result.nextExpectedRevision,
    };
  }

  async *readStream(
    streamId: string,
    options?: ReadStreamOptions
  ): AsyncIterable<RecordedEventEnvelope> {
    const direction = options?.direction === 'backwards' ? BACKWARDS : FORWARDS;
    const fromRevision = this.mapFromRevision(options?.fromRevision);

    const events = this.client.readStream(streamId, {
      direction,
      fromRevision,
      maxCount: options?.maxCount ? BigInt(options.maxCount) : undefined,
    });

    for await (const resolved of events) {
      const recorded = this.mapResolvedEventToRecorded(resolved);
      if (recorded) {
        yield recorded;
      }
    }
  }

  subscribeToStream(
    streamId: string,
    options?: SubscribeToStreamOptions
  ): Subscription {
    const fromRevision = this.mapFromRevision(options?.fromRevision);

    const kurrentSubscription = this.client.subscribeToStream(streamId, {
      fromRevision,
    });

    return this.wrapSubscription(kurrentSubscription);
  }

  subscribeToAll(options?: SubscribeToAllOptions): Subscription {
    const fromPosition = this.mapFromPosition(options?.fromPosition);
    const filter = this.buildFilter(options);

    const kurrentSubscription = this.client.subscribeToAll({
      fromPosition,
      filter,
    });

    return this.wrapAllStreamSubscription(kurrentSubscription);
  }

  private mapFromRevision(
    revision: bigint | 'start' | 'end' | undefined
  ): typeof START | typeof END | bigint {
    if (revision === undefined || revision === 'start') {
      return START;
    }
    if (revision === 'end') {
      return END;
    }
    return revision;
  }

  private mapFromPosition(
    position:
      | { commit: bigint; prepare: bigint }
      | 'start'
      | 'end'
      | undefined
  ): typeof START | typeof END | Position {
    if (position === undefined || position === 'start') {
      return START;
    }
    if (position === 'end') {
      return END;
    }
    return position;
  }

  private buildFilter(options?: SubscribeToAllOptions): Filter | undefined {
    if (!options) {
      return undefined;
    }

    const { filterByEventType, filterByStreamName } = options;

    // Event type filter takes precedence
    if (filterByEventType && filterByEventType.length > 0) {
      return eventTypeFilter({
        prefixes: filterByEventType,
      });
    }

    if (filterByStreamName && filterByStreamName.length > 0) {
      return streamNameFilter({
        prefixes: filterByStreamName,
      });
    }

    return undefined;
  }

  private mapResolvedEventToRecorded(
    resolved: ResolvedEvent
  ): RecordedEventEnvelope | null {
    const event = resolved.event;
    if (!event) {
      return null;
    }

    return {
      streamId: event.streamId,
      id: event.id,
      revision: event.revision,
      type: event.type,
      created: event.created,
      data: event.data,
      metadata: event.metadata as {
        correlationId: string;
        causationId?: string;
        actor?: string;
      },
      position: event.position,
    };
  }

  private mapAllStreamResolvedEventToEnvelope(
    resolved: AllStreamResolvedEvent
  ): ResolvedEventEnvelope | null {
    const event = resolved.event;
    if (!event) {
      return null;
    }

    return {
      event: {
        streamId: event.streamId,
        id: event.id,
        revision: event.revision,
        type: event.type,
        created: event.created,
        data: event.data,
        metadata: event.metadata as {
          correlationId: string;
          causationId?: string;
          actor?: string;
        },
        position: event.position,
      },
      link: resolved.link
        ? {
            streamId: resolved.link.streamId,
            id: resolved.link.id,
            revision: resolved.link.revision,
            type: resolved.link.type,
            created: resolved.link.created,
            data: resolved.link.data,
            metadata: resolved.link.metadata as {
              correlationId: string;
              causationId?: string;
              actor?: string;
            },
            position: resolved.link.position,
          }
        : undefined,
      commitPosition: resolved.commitPosition,
    };
  }

  private wrapSubscription(
    kurrentSubscription: StreamSubscription
  ): Subscription {
    const generateEvents = async function* (
      subscription: StreamSubscription
    ): AsyncIterable<ResolvedEventEnvelope> {
      for await (const resolved of subscription) {
        const event = resolved.event;
        if (event) {
          yield {
            event: {
              streamId: event.streamId,
              id: event.id,
              revision: event.revision,
              type: event.type,
              created: event.created,
              data: event.data,
              metadata: event.metadata as {
                correlationId: string;
                causationId?: string;
                actor?: string;
              },
              position: event.position,
            },
            commitPosition: event.position?.commit,
          };
        }
      }
    };

    return {
      events: generateEvents(kurrentSubscription),
      unsubscribe: async () => {
        await kurrentSubscription.unsubscribe();
      },
    };
  }

  private wrapAllStreamSubscription(
    kurrentSubscription: AllStreamSubscription
  ): Subscription {
    const mapEvent = this.mapAllStreamResolvedEventToEnvelope.bind(this);

    const generateEvents = async function* (
      subscription: AllStreamSubscription
    ): AsyncIterable<ResolvedEventEnvelope> {
      for await (const resolved of subscription) {
        const envelope = mapEvent(resolved);
        if (envelope) {
          yield envelope;
        }
      }
    };

    return {
      events: generateEvents(kurrentSubscription),
      unsubscribe: async () => {
        await kurrentSubscription.unsubscribe();
      },
    };
  }
}

import { Logger } from '@nestjs/common';
import type { ILoggableDomainEvent } from '../types/domain-event.interface';
import type { EventEnvelope } from '../types/event-envelope';
import type {
  AppendResult,
  IEventStoreAdapter,
  ReadStreamOptions,
  Subscription,
  SubscribeToAllOptions,
  SubscribeToStreamOptions,
} from './event-store-adapter.interface';

/**
 * Controls the verbosity of event store adapter logging.
 *
 * - `none` — no logging (default)
 * - `events` — log event envelopes on append (what's being persisted)
 * - `all` — log all adapter method calls + event envelopes
 */
export type EventStoreLoggingLevel = 'none' | 'events' | 'all';

/**
 * Decorator that adds configurable logging to any {@link IEventStoreAdapter}.
 *
 * Wraps an inner adapter and logs operations based on the configured level.
 * At `events` level, only write operations (appendToStream) log event details.
 * At `all` level, every method call is logged including reads and subscriptions.
 *
 * @example
 * ```typescript
 * const adapter = new KurrentDbEventStoreAdapter(uri);
 * const logged = new LoggingEventStoreAdapter(adapter, 'events');
 * ```
 */
export class LoggingEventStoreAdapter implements IEventStoreAdapter {
  private readonly logger: Logger;

  constructor(
    private readonly inner: IEventStoreAdapter,
    private readonly level: EventStoreLoggingLevel,
    logger?: Logger
  ) {
    this.logger = logger ?? new Logger(LoggingEventStoreAdapter.name);
  }

  async appendToStream(
    streamId: string,
    events: EventEnvelope[],
    expectedRevision?: bigint
  ): Promise<AppendResult> {
    if (this.level === 'none') {
      return this.inner.appendToStream(streamId, events, expectedRevision);
    }

    if (this.level === 'events') {
      this.logEventEnvelopes(streamId, events);
      return this.inner.appendToStream(streamId, events, expectedRevision);
    }

    // level === 'all'
    const revisionStr =
      expectedRevision !== undefined ? String(expectedRevision) : 'any';
    this.logger.debug(
      `appendToStream(${streamId}, ${events.length} events, expectedRevision=${revisionStr})`
    );
    this.logEventEnvelopes(streamId, events);

    try {
      const result = await this.inner.appendToStream(
        streamId,
        events,
        expectedRevision
      );
      this.logger.debug(
        `appendToStream(${streamId}) succeeded, nextExpectedRevision=${result.nextExpectedRevision}`
      );
      return result;
    } catch (error) {
      this.logger.error(
        `appendToStream(${streamId}) failed: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  readStream(streamId: string, options?: ReadStreamOptions) {
    if (this.level === 'all') {
      this.logger.debug(
        `readStream(${streamId}, ${JSON.stringify(options ?? {})})`
      );
    }

    return this.inner.readStream(streamId, options);
  }

  subscribeToStream(
    streamId: string,
    options?: SubscribeToStreamOptions
  ): Subscription {
    if (this.level !== 'all') {
      return this.inner.subscribeToStream(streamId, options);
    }

    this.logger.debug(
      `subscribeToStream(${streamId}, ${JSON.stringify(options ?? {})})`
    );

    const subscription = this.inner.subscribeToStream(streamId, options);
    return this.wrapSubscription(subscription, `subscribeToStream(${streamId})`);
  }

  subscribeToAll(options?: SubscribeToAllOptions): Subscription {
    if (this.level !== 'all') {
      return this.inner.subscribeToAll(options);
    }

    this.logger.debug(`subscribeToAll(${JSON.stringify(options ?? {})})`);

    const subscription = this.inner.subscribeToAll(options);
    return this.wrapSubscription(subscription, 'subscribeToAll');
  }

  private logEventEnvelopes(
    streamId: string,
    events: EventEnvelope[]
  ): void {
    for (const event of events) {
      const summary = `  → ${streamId}: ${event.type} [id=${event.id}, correlationId=${event.metadata.correlationId}]`;

      if (isLoggableDomainEvent(event.data)) {
        this.logger.log(`${summary} ${event.data.toLogString()}`);
      } else {
        this.logger.debug(summary);
      }
    }
  }

  private wrapSubscription(
    subscription: Subscription,
    label: string
  ): Subscription {
    return {
      events: subscription.events,
      unsubscribe: async () => {
        this.logger.debug(`${label} unsubscribing`);
        await subscription.unsubscribe();
      },
    };
  }
}

function isLoggableDomainEvent(data: unknown): data is ILoggableDomainEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    'toLogString' in data &&
    typeof (data as ILoggableDomainEvent).toLogString === 'function'
  );
}

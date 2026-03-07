import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
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
  ConcurrencyConflictError,
} from '@pbuda/nestjs-event-store';

/**
 * In-memory implementation of IEventStoreAdapter.
 *
 * Useful for testing and development scenarios where a real event store
 * is not needed. Events are stored in memory and lost when the process exits.
 */
@Injectable()
export class InMemoryEventStoreAdapter implements IEventStoreAdapter {
  private readonly streams = new Map<string, RecordedEventEnvelope[]>();
  private readonly allEvents: RecordedEventEnvelope[] = [];
  private readonly emitter = new EventEmitter();
  private globalPosition = 0n;

  async appendToStream(
    streamId: string,
    events: EventEnvelope[],
    expectedRevision?: bigint
  ): Promise<AppendResult> {
    const stream = this.streams.get(streamId) ?? [];
    const currentRevision = BigInt(stream.length) - 1n;

    // Optimistic concurrency check
    if (expectedRevision !== undefined && currentRevision !== expectedRevision) {
      throw new ConcurrencyConflictError(streamId, expectedRevision, currentRevision);
    }

    const recordedEvents: RecordedEventEnvelope[] = events.map(
      (event, index) => {
        const position = this.globalPosition++;
        return {
          streamId,
          id: event.id,
          revision: BigInt(stream.length + index),
          type: event.type,
          created: new Date(),
          data: event.data,
          metadata: event.metadata,
          position: { commit: position, prepare: position },
        };
      }
    );

    stream.push(...recordedEvents);
    this.allEvents.push(...recordedEvents);
    this.streams.set(streamId, stream);

    // Emit for subscriptions
    for (const event of recordedEvents) {
      this.emitter.emit('event', event);
      this.emitter.emit(`stream:${streamId}`, event);
    }

    return {
      nextExpectedRevision: BigInt(stream.length),
    };
  }

  async *readStream(
    streamId: string,
    options?: ReadStreamOptions
  ): AsyncIterable<RecordedEventEnvelope> {
    const stream = this.streams.get(streamId) ?? [];

    if (stream.length === 0) {
      return;
    }

    const direction = options?.direction ?? 'forwards';
    const fromRevision = options?.fromRevision ?? 'start';
    const maxCount = options?.maxCount ?? stream.length;

    let startIndex: number;
    if (fromRevision === 'start') {
      startIndex = 0;
    } else if (fromRevision === 'end') {
      startIndex = stream.length - 1;
    } else {
      startIndex = Number(fromRevision);
    }

    if (direction === 'forwards') {
      const endIndex = Math.min(startIndex + maxCount, stream.length);
      for (let i = startIndex; i < endIndex; i++) {
        yield stream[i];
      }
    } else {
      const endIndex = Math.max(startIndex - maxCount + 1, 0);
      for (let i = startIndex; i >= endIndex; i--) {
        yield stream[i];
      }
    }
  }

  subscribeToStream(
    streamId: string,
    options?: SubscribeToStreamOptions
  ): Subscription {
    const fromRevision = options?.fromRevision ?? 'start';
    let cancelled = false;

    // Capture references to avoid 'this' aliasing
    const streams = this.streams;
    const emitter = this.emitter;

    const generateEvents = async function* (): AsyncIterable<ResolvedEventEnvelope> {
      const stream = streams.get(streamId) ?? [];

      // Determine starting point
      let startIndex: number;
      if (fromRevision === 'start') {
        startIndex = 0;
      } else if (fromRevision === 'end') {
        startIndex = stream.length;
      } else {
        startIndex = Number(fromRevision) + 1;
      }

      // Yield historical events
      for (let i = startIndex; i < stream.length && !cancelled; i++) {
        yield { event: stream[i], commitPosition: stream[i].position?.commit };
      }

      // Wait for live events
      if (!cancelled) {
        const eventQueue: RecordedEventEnvelope[] = [];
        let resolveWait: (() => void) | null = null;

        const handler = (event: RecordedEventEnvelope) => {
          eventQueue.push(event);
          if (resolveWait) {
            resolveWait();
            resolveWait = null;
          }
        };

        emitter.on(`stream:${streamId}`, handler);

        try {
          while (!cancelled) {
            const event = eventQueue.shift();
            if (event) {
              yield { event, commitPosition: event.position?.commit };
            } else {
              await new Promise<void>((resolve) => {
                resolveWait = resolve;
              });
            }
          }
        } finally {
          emitter.off(`stream:${streamId}`, handler);
        }
      }
    };

    return {
      events: generateEvents(),
      unsubscribe: async () => {
        cancelled = true;
      },
    };
  }

  subscribeToAll(options?: SubscribeToAllOptions): Subscription {
    const fromPosition = options?.fromPosition ?? 'start';
    const filterByEventType = options?.filterByEventType;
    const filterByStreamName = options?.filterByStreamName;
    let cancelled = false;

    // Capture references to avoid 'this' aliasing
    const allEvents = this.allEvents;
    const emitter = this.emitter;

    const matchesFilters = (event: RecordedEventEnvelope): boolean => {
      if (filterByEventType && filterByEventType.length > 0) {
        if (!filterByEventType.some((prefix) => event.type.startsWith(prefix))) {
          return false;
        }
      }
      if (filterByStreamName && filterByStreamName.length > 0) {
        if (!filterByStreamName.some((prefix) => event.streamId.startsWith(prefix))) {
          return false;
        }
      }
      return true;
    };

    const generateEvents = async function* (): AsyncIterable<ResolvedEventEnvelope> {
      // Determine starting point
      let startIndex: number;
      if (fromPosition === 'start') {
        startIndex = 0;
      } else if (fromPosition === 'end') {
        startIndex = allEvents.length;
      } else {
        // Find index by commit position
        startIndex = allEvents.findIndex(
          (e) => e.position && e.position.commit > fromPosition.commit
        );
        if (startIndex === -1) {
          startIndex = allEvents.length;
        }
      }

      // Yield historical events
      for (let i = startIndex; i < allEvents.length && !cancelled; i++) {
        const event = allEvents[i];
        if (matchesFilters(event)) {
          yield { event, commitPosition: event.position?.commit };
        }
      }

      // Wait for live events
      if (!cancelled) {
        const eventQueue: RecordedEventEnvelope[] = [];
        let resolveWait: (() => void) | null = null;

        const handler = (event: RecordedEventEnvelope) => {
          if (matchesFilters(event)) {
            eventQueue.push(event);
            if (resolveWait) {
              resolveWait();
              resolveWait = null;
            }
          }
        };

        emitter.on('event', handler);

        try {
          while (!cancelled) {
            const event = eventQueue.shift();
            if (event) {
              yield { event, commitPosition: event.position?.commit };
            } else {
              await new Promise<void>((resolve) => {
                resolveWait = resolve;
              });
            }
          }
        } finally {
          emitter.off('event', handler);
        }
      }
    };

    return {
      events: generateEvents(),
      unsubscribe: async () => {
        cancelled = true;
      },
    };
  }

  /**
   * Get all events from a specific stream.
   * Useful for testing assertions.
   */
  getStream(streamId: string): RecordedEventEnvelope[] {
    return this.streams.get(streamId) ?? [];
  }

  /**
   * Get all streams and their events.
   * Useful for testing assertions.
   */
  getAllStreams(): Map<string, RecordedEventEnvelope[]> {
    return new Map(this.streams);
  }

  /**
   * Get all events across all streams in global order.
   * Useful for testing assertions.
   */
  getAllEvents(): RecordedEventEnvelope[] {
    return [...this.allEvents];
  }

  /**
   * Clear all streams and reset state.
   * Useful for test cleanup.
   */
  clear(): void {
    this.streams.clear();
    this.allEvents.length = 0;
    this.globalPosition = 0n;
    this.emitter.removeAllListeners();
  }
}

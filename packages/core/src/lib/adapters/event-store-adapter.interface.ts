import { EventEnvelope, RecordedEventEnvelope } from '../types/event-envelope';

/**
 * Injection token for the event store adapter.
 */
export const EVENT_STORE_ADAPTER = Symbol('EVENT_STORE_ADAPTER');

/**
 * Result of appending events to a stream.
 */
export interface AppendResult {
  /**
   * The next expected revision after the append.
   * Use this for optimistic concurrency control on subsequent appends.
   */
  nextExpectedRevision: bigint;
}

/**
 * Read direction for stream operations.
 */
export type ReadDirection = 'forwards' | 'backwards';

/**
 * Options for reading events from a stream.
 */
export interface ReadStreamOptions {
  /**
   * Direction to read the stream.
   * @default 'forwards'
   */
  direction?: ReadDirection;

  /**
   * Starting revision to read from.
   * Use 'start' for beginning, 'end' for latest.
   * @default 'start'
   */
  fromRevision?: bigint | 'start' | 'end';

  /**
   * Maximum number of events to read.
   */
  maxCount?: number;
}

/**
 * Abstract adapter interface for event store implementations.
 * Implementations should handle connection management and serialization.
 */
export interface IEventStoreAdapter {
  /**
   * Append events to a stream.
   *
   * @param streamId - Target stream identifier (e.g., "Order-123")
   * @param events - Events to append
   * @param expectedRevision - Expected stream revision for optimistic concurrency.
   *                           Use `undefined` for any revision, or a specific bigint.
   * @returns Result containing the next expected revision
   * @throws {ConcurrencyError} When expectedRevision doesn't match
   */
  appendToStream(
    streamId: string,
    events: EventEnvelope[],
    expectedRevision?: bigint
  ): Promise<AppendResult>;

  /**
   * Read events from a stream.
   *
   * @param streamId - Stream identifier to read from
   * @param options - Read options (direction, starting position, limit)
   * @returns Async iterable of recorded events
   */
  readStream(
    streamId: string,
    options?: ReadStreamOptions
  ): AsyncIterable<RecordedEventEnvelope>;
}

import {
  EventEnvelope,
  EventPosition,
  RecordedEventEnvelope,
  ResolvedEventEnvelope,
} from '../types/event-envelope';

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
 * Options for subscribing to a stream.
 */
export interface SubscribeToStreamOptions {
  /**
   * Starting revision within the stream.
   * Use 'start' for beginning, 'end' for live-only.
   * @default 'start'
   */
  fromRevision?: bigint | 'start' | 'end';
}

/**
 * Options for subscribing to the global $all stream.
 */
export interface SubscribeToAllOptions {
  /**
   * Starting position in the global log.
   * Use 'start' for beginning, 'end' for live-only.
   * @default 'start'
   */
  fromPosition?: EventPosition | 'start' | 'end';

  /**
   * Filter by event type prefixes.
   * Example: ['Order', 'Payment'] matches OrderCreated, PaymentReceived, etc.
   */
  filterByEventType?: string[];

  /**
   * Filter by stream name prefixes.
   * Example: ['Order-', 'User-'] matches Order-123, User-456, etc.
   */
  filterByStreamName?: string[];
}

/**
 * Active subscription handle.
 * Wraps async iterable with lifecycle management.
 */
export interface Subscription {
  /**
   * Async iterable of resolved events.
   */
  events: AsyncIterable<ResolvedEventEnvelope>;

  /**
   * Unsubscribe and clean up resources.
   */
  unsubscribe(): Promise<void>;
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
   * Yields an empty iterable if the stream does not exist.
   * In event sourcing, "no events" and "stream doesn't exist" are
   * semantically equivalent.
   *
   * @param streamId - Stream identifier to read from
   * @param options - Read options (direction, starting position, limit)
   * @returns Async iterable of recorded events
   */
  readStream(
    streamId: string,
    options?: ReadStreamOptions
  ): AsyncIterable<RecordedEventEnvelope>;

  /**
   * Subscribe to a single stream (catch-up subscription).
   * Receives historical events from the starting position, then continues with live events.
   *
   * @param streamId - Stream to subscribe to
   * @param options - Subscription options (starting position)
   * @returns Subscription handle with events iterable and unsubscribe method
   */
  subscribeToStream(
    streamId: string,
    options?: SubscribeToStreamOptions
  ): Subscription;

  /**
   * Subscribe to all events across all streams (catch-up subscription).
   * Useful for building cross-aggregate read models and projections.
   *
   * @param options - Subscription options with optional filters
   * @returns Subscription handle with events iterable and unsubscribe method
   */
  subscribeToAll(options?: SubscribeToAllOptions): Subscription;
}

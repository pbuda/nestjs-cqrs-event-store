import { EventMetadata } from './event-metadata';

/**
 * Event envelope for appending events to the event store.
 */
export interface EventEnvelope<T = unknown> {
  /**
   * Unique event identifier (UUID format).
   */
  id: string;

  /**
   * Event type/name used for classification.
   * Should include version suffix, e.g. "OrderPlacedV1", "UserRegisteredV2"
   */
  type: string;

  /**
   * Domain event payload.
   */
  data: T;

  /**
   * Custom metadata for correlation tracking and auditing.
   */
  metadata: EventMetadata;
}

/**
 * Global position in the event log.
 * Used for checkpointing catch-up subscriptions.
 */
export interface EventPosition {
  commit: bigint;
  prepare: bigint;
}

/**
 * Recorded event as returned from the event store.
 * Includes both user-provided and system-generated fields.
 */
export interface RecordedEventEnvelope<T = unknown> {
  /**
   * Stream identifier where this event is stored.
   */
  streamId: string;

  /**
   * Unique event identifier (UUID format).
   */
  id: string;

  /**
   * Event's position within its stream (0-indexed).
   * Used for optimistic concurrency control.
   */
  revision: bigint;

  /**
   * Event type/name.
   */
  type: string;

  /**
   * Timestamp when event was written to the store.
   */
  created: Date;

  /**
   * Domain event payload.
   */
  data: T;

  /**
   * Custom event metadata.
   */
  metadata: EventMetadata;

  /**
   * Global position in the event log.
   */
  position?: EventPosition;
}

/**
 * Resolved event from subscriptions and reads.
 * May include link events when reading through projections or category streams.
 */
export interface ResolvedEventEnvelope<T = unknown> {
  /**
   * The actual event data.
   */
  event?: RecordedEventEnvelope<T>;

  /**
   * Link event when reading through projections.
   * Points to the original event location.
   */
  link?: RecordedEventEnvelope<unknown>;

  /**
   * Global commit position in the event log.
   * Use for checkpointing subscriptions.
   */
  commitPosition?: bigint;
}

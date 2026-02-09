import { IEvent } from '@nestjs/cqrs';

/**
 * Interface for domain events that include type information.
 * The eventType is used for serialization and stream filtering.
 */
export interface IDomainEvent extends IEvent {
  /**
   * Type identifier for the event.
   * Should include version suffix for schema evolution.
   * @example "OrderPlacedV1", "UserRegisteredV2"
   */
  readonly eventType: string;
}

/**
 * Domain event that provides a custom log representation.
 *
 * Implement this interface to control what gets logged when the
 * {@link LoggingEventStoreAdapter} persists events. Events that do not
 * implement this interface are logged with a compact summary
 * (type, id, correlationId). Events that do implement it get their
 * {@link toLogString} output appended to the log line.
 *
 * Use this to include relevant payload fields while redacting sensitive data.
 *
 * @example
 * ```typescript
 * export class OrderCreated implements ILoggableDomainEvent {
 *   readonly eventType = 'OrderCreatedV1';
 *
 *   constructor(
 *     public readonly orderId: string,
 *     private readonly creditCard: string,
 *   ) {}
 *
 *   toLogString(): string {
 *     return `orderId=${this.orderId}`;
 *   }
 * }
 * ```
 */
export interface ILoggableDomainEvent extends IDomainEvent {
  /**
   * Returns a human-readable log representation of this event's payload.
   * Sensitive fields should be omitted or redacted.
   */
  toLogString(): string;
}

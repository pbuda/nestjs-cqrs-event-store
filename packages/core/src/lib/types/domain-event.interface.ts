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

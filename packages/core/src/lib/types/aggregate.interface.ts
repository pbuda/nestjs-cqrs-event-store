/**
 * Interface for aggregates that can be identified for event stream naming.
 * Aggregates implementing this interface can have their events persisted
 * to a stream named `{aggregateType}-{aggregateId}`.
 */
export interface IAggregateIdentifiable {
  /**
   * Unique identifier of the aggregate instance.
   * Used as part of the stream name.
   */
  readonly aggregateId: string;

  /**
   * Type name of the aggregate.
   * Used as the stream name prefix (e.g., "Order", "User").
   */
  readonly aggregateType: string;
}

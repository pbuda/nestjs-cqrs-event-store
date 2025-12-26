/**
 * Metadata attached to every event for tracing and debugging.
 */
export interface EventMetadata {
  /**
   * Traces full lifecycle of a business operation.
   * All events caused by the same user action share this ID.
   */
  correlationId: string;

  /**
   * Identifies the event that caused this event to be created.
   * This is used to trace the event back to its source.
   * It is not required, but it is recommended to set it when the event is created.
   */
  causationId?: string;

  /**
   * System component or identifier that produced the event.
   * e.g., "service:service-name", "user:username"
   */
  actor?: string;
}

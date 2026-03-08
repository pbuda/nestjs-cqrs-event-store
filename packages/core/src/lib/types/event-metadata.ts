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

/**
 * Validates that raw data from storage conforms to the EventMetadata shape.
 * Throws a descriptive Error when any required field is missing or has the wrong type.
 *
 * Used by adapters on every read path to surface corrupt metadata before it
 * reaches callers rather than silently passing through an invalid object.
 */
export function validateEventMetadata(raw: unknown): EventMetadata {
  if (raw === null || typeof raw !== 'object') {
    throw new Error(
      `Invalid event metadata: expected an object, got ${typeof raw}`
    );
  }
  const meta = raw as Record<string, unknown>;
  if (typeof meta['correlationId'] !== 'string' || meta['correlationId'].length === 0) {
    throw new Error(
      `Invalid event metadata: correlationId must be a non-empty string`
    );
  }
  if (meta['causationId'] !== undefined && typeof meta['causationId'] !== 'string') {
    throw new Error(
      `Invalid event metadata: causationId must be a string if present`
    );
  }
  if (meta['actor'] !== undefined && typeof meta['actor'] !== 'string') {
    throw new Error(
      `Invalid event metadata: actor must be a string if present`
    );
  }
  return {
    correlationId: meta['correlationId'] as string,
    causationId: meta['causationId'] as string | undefined,
    actor: meta['actor'] as string | undefined,
  };
}

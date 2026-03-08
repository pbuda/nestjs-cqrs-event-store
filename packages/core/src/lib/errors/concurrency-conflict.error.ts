export class ConcurrencyConflictError extends Error {
  override readonly name = 'ConcurrencyConflictError';
  readonly streamId: string;
  readonly expectedRevision: bigint;
  readonly actualRevision: bigint;

  constructor(streamId: string, expectedRevision: bigint, actualRevision: bigint) {
    super(
      `Concurrency conflict on stream "${streamId}": ` +
        `expected revision ${expectedRevision}, actual revision ${actualRevision}`
    );
    this.streamId = streamId;
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

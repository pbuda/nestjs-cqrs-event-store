import { ConcurrencyConflictError } from '@pbuda/nestjs-event-store';
import { InMemoryEventStoreAdapter } from './in-memory-event-store.adapter';
import type { EventEnvelope } from '@pbuda/nestjs-event-store';
import { randomUUID } from 'crypto';

const createEvent = (): EventEnvelope => ({
  id: randomUUID(),
  type: 'TestEventV1',
  data: { value: 1 },
  metadata: { correlationId: randomUUID() },
});

describe('ConcurrencyConflictError', () => {
  it('has correct structure', () => {
    const error = new ConcurrencyConflictError('my-stream', 2n, 5n);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ConcurrencyConflictError);
    expect(error.name).toBe('ConcurrencyConflictError');
    expect(error.streamId).toBe('my-stream');
    expect(error.expectedRevision).toBe(2n);
    expect(error.actualRevision).toBe(5n);
    expect(error.message).toContain('my-stream');
    expect(error.message).toContain('2');
    expect(error.message).toContain('5');
  });
});

describe('InMemoryEventStoreAdapter', () => {
  describe('appendToStream — optimistic concurrency', () => {
    it('throws ConcurrencyConflictError on revision mismatch', async () => {
      const adapter = new InMemoryEventStoreAdapter();
      const streamId = `stream-${randomUUID()}`;

      // Append one event — stream is now at revision 0n
      await adapter.appendToStream(streamId, [createEvent()]);

      // Attempt to append with wrong expectedRevision
      const error = await adapter
        .appendToStream(streamId, [createEvent()], 5n)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConcurrencyConflictError);
      if (error instanceof ConcurrencyConflictError) {
        expect(error.streamId).toBe(streamId);
        expect(error.expectedRevision).toBe(5n);
        expect(error.actualRevision).toBe(0n);
      }
    });

    it('succeeds when expectedRevision matches', async () => {
      const adapter = new InMemoryEventStoreAdapter();
      const streamId = `stream-${randomUUID()}`;

      // Append one event — stream is now at revision 0n
      await adapter.appendToStream(streamId, [createEvent()]);

      // Append with correct expectedRevision
      const result = await adapter.appendToStream(
        streamId,
        [createEvent()],
        0n
      );

      // nextExpectedRevision equals stream.length (2 events total)
      expect(result.nextExpectedRevision).toBe(2n);
    });
  });
});

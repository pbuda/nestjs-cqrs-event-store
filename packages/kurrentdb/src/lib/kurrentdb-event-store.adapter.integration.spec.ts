import { KurrentDbEventStoreAdapter } from './kurrentdb-event-store.adapter';
import {
  EventEnvelope,
  EventMetadata,
  RecordedEventEnvelope,
  ResolvedEventEnvelope,
  ConcurrencyConflictError,
} from '@pbuda/nestjs-event-store';
import { randomUUID } from 'crypto';

/**
 * Integration tests for KurrentDbEventStoreAdapter.
 *
 * Requires KurrentDB running on localhost:2113 (insecure mode).
 * Start with: docker compose up -d
 */
describe('KurrentDbEventStoreAdapter Integration', () => {
  let adapter: KurrentDbEventStoreAdapter;

  beforeAll(() => {
    adapter = new KurrentDbEventStoreAdapter(
      'kurrentdb://localhost:2113?tls=false'
    );
  });

  afterAll(async () => {
    await adapter.onModuleDestroy();
  });

  const createEvent = (
    type: string,
    data: Record<string, unknown>
  ): EventEnvelope => ({
    id: randomUUID(),
    type,
    data,
    metadata: {
      correlationId: randomUUID(),
      causationId: randomUUID(),
      actor: 'test-user',
    },
  });

  const uniqueStreamId = () => `test-stream-${randomUUID()}`;

  describe('subscribeToAll — filter validation', () => {
    it('should throw when both filterByEventType and filterByStreamName are provided', () => {
      expect(() =>
        adapter.subscribeToAll({
          filterByEventType: ['Order'],
          filterByStreamName: ['Order-'],
        })
      ).toThrow('filterByEventType');
    });
  });

  describe('appendToStream', () => {
    it('should append a single event to a new stream', async () => {
      const streamId = uniqueStreamId();
      const event = createEvent('TestEventV1', { message: 'hello' });

      const result = await adapter.appendToStream(streamId, [event]);

      expect(result.nextExpectedRevision).toBe(0n);
    });

    it('should append multiple events to a stream', async () => {
      const streamId = uniqueStreamId();
      const events = [
        createEvent('TestEventV1', { index: 1 }),
        createEvent('TestEventV1', { index: 2 }),
        createEvent('TestEventV1', { index: 3 }),
      ];

      const result = await adapter.appendToStream(streamId, events);

      expect(result.nextExpectedRevision).toBe(2n);
    });

    it('should support optimistic concurrency with expectedRevision', async () => {
      const streamId = uniqueStreamId();

      // First append
      const result1 = await adapter.appendToStream(streamId, [
        createEvent('TestEventV1', { step: 1 }),
      ]);
      expect(result1.nextExpectedRevision).toBe(0n);

      // Second append with correct expectedRevision
      const result2 = await adapter.appendToStream(
        streamId,
        [createEvent('TestEventV1', { step: 2 })],
        0n
      );
      expect(result2.nextExpectedRevision).toBe(1n);
    });

    it('should fail on concurrency conflict', async () => {
      const streamId = uniqueStreamId();

      // First append
      await adapter.appendToStream(streamId, [
        createEvent('TestEventV1', { step: 1 }),
      ]);

      // Second append with wrong expectedRevision
      await expect(
        adapter.appendToStream(
          streamId,
          [createEvent('TestEventV1', { step: 2 })],
          5n // Wrong revision
        )
      ).rejects.toThrow(ConcurrencyConflictError);
    });
  });

  describe('readStream', () => {
    it('should read events from a stream', async () => {
      const streamId = uniqueStreamId();
      const events = [
        createEvent('TestEventV1', { index: 1 }),
        createEvent('TestEventV1', { index: 2 }),
        createEvent('TestEventV1', { index: 3 }),
      ];

      await adapter.appendToStream(streamId, events);

      const readEvents: RecordedEventEnvelope[] = [];
      for await (const event of adapter.readStream(streamId)) {
        readEvents.push(event);
      }

      expect(readEvents).toHaveLength(3);
      expect(readEvents[0].streamId).toBe(streamId);
      expect(readEvents[0].type).toBe('TestEventV1');
      expect(BigInt(readEvents[0].revision)).toBe(0n);
      expect(readEvents[0].data).toEqual({ index: 1 });

      expect(BigInt(readEvents[2].revision)).toBe(2n);
      expect(readEvents[2].data).toEqual({ index: 3 });
    });

    it('should read events with maxCount limit', async () => {
      const streamId = uniqueStreamId();
      const events = Array.from({ length: 10 }, (_, i) =>
        createEvent('TestEventV1', { index: i })
      );

      await adapter.appendToStream(streamId, events);

      const readEvents: RecordedEventEnvelope[] = [];
      for await (const event of adapter.readStream(streamId, { maxCount: 3 })) {
        readEvents.push(event);
      }

      expect(readEvents).toHaveLength(3);
    });

    it('should read events from a specific revision', async () => {
      const streamId = uniqueStreamId();
      const events = Array.from({ length: 5 }, (_, i) =>
        createEvent('TestEventV1', { index: i })
      );

      await adapter.appendToStream(streamId, events);

      const readEvents: RecordedEventEnvelope[] = [];
      for await (const event of adapter.readStream(streamId, {
        fromRevision: 2n,
      })) {
        readEvents.push(event);
      }

      expect(readEvents).toHaveLength(3);
      expect((readEvents[0].data as { index: number }).index).toBe(2);
    });

    it('should return empty iterable for a nonexistent stream', async () => {
      const streamId = uniqueStreamId();

      const readEvents: RecordedEventEnvelope[] = [];
      for await (const event of adapter.readStream(streamId)) {
        readEvents.push(event);
      }

      expect(readEvents).toHaveLength(0);
    });

    it('should read events backwards', async () => {
      const streamId = uniqueStreamId();
      const events = Array.from({ length: 5 }, (_, i) =>
        createEvent('TestEventV1', { index: i })
      );

      await adapter.appendToStream(streamId, events);

      const readEvents: RecordedEventEnvelope[] = [];
      for await (const event of adapter.readStream(streamId, {
        direction: 'backwards',
        fromRevision: 'end',
      })) {
        readEvents.push(event);
      }

      expect(readEvents).toHaveLength(5);
      expect((readEvents[0].data as { index: number }).index).toBe(4);
      expect((readEvents[4].data as { index: number }).index).toBe(0);
    });
  });

  describe('subscribeToStream', () => {
    it('should receive historical events', async () => {
      const streamId = uniqueStreamId();
      const events = [
        createEvent('TestEventV1', { index: 1 }),
        createEvent('TestEventV1', { index: 2 }),
      ];

      await adapter.appendToStream(streamId, events);

      const subscription = adapter.subscribeToStream(streamId);
      const receivedEvents: ResolvedEventEnvelope[] = [];

      // Read just the historical events
      for await (const event of subscription.events) {
        receivedEvents.push(event);
        if (receivedEvents.length >= 2) {
          await subscription.unsubscribe();
          break;
        }
      }

      expect(receivedEvents).toHaveLength(2);
      expect(receivedEvents[0].event?.type).toBe('TestEventV1');
      expect(receivedEvents[0].event?.data).toEqual({ index: 1 });
    });

    it('should receive live events after historical', async () => {
      const streamId = uniqueStreamId();

      // Append initial event
      await adapter.appendToStream(streamId, [
        createEvent('TestEventV1', { index: 1 }),
      ]);

      const subscription = adapter.subscribeToStream(streamId);
      const receivedEvents: ResolvedEventEnvelope[] = [];

      // Start collecting events in background
      const collectPromise = (async () => {
        for await (const event of subscription.events) {
          receivedEvents.push(event);
          if (receivedEvents.length >= 3) {
            await subscription.unsubscribe();
            break;
          }
        }
      })();

      // Give subscription time to catch up, then append more events
      await new Promise((r) => setTimeout(r, 100));
      await adapter.appendToStream(streamId, [
        createEvent('TestEventV1', { index: 2 }),
        createEvent('TestEventV1', { index: 3 }),
      ]);

      await collectPromise;

      expect(receivedEvents).toHaveLength(3);
    });

    it('should subscribe from end for live-only events', async () => {
      const streamId = uniqueStreamId();

      // Append initial events (these should NOT be received)
      await adapter.appendToStream(streamId, [
        createEvent('TestEventV1', { index: 1 }),
        createEvent('TestEventV1', { index: 2 }),
      ]);

      const subscription = adapter.subscribeToStream(streamId, {
        fromRevision: 'end',
      });
      const receivedEvents: ResolvedEventEnvelope[] = [];

      const collectPromise = (async () => {
        for await (const event of subscription.events) {
          receivedEvents.push(event);
          if (receivedEvents.length >= 1) {
            await subscription.unsubscribe();
            break;
          }
        }
      })();

      // Give subscription time to set up
      await new Promise((r) => setTimeout(r, 100));

      // Append new event (this SHOULD be received)
      await adapter.appendToStream(streamId, [
        createEvent('TestEventV1', { index: 3 }),
      ]);

      await collectPromise;

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].event?.data).toEqual({ index: 3 });
    });
  });

  describe('subscribeToAll', () => {
    it('should receive events from multiple streams with event type filter', async () => {
      const stream1 = uniqueStreamId();
      const stream2 = uniqueStreamId();

      // Append events with different types
      await adapter.appendToStream(stream1, [
        createEvent('OrderCreatedV1', { orderId: '1' }),
        createEvent('PaymentReceivedV1', { paymentId: '1' }),
      ]);
      await adapter.appendToStream(stream2, [
        createEvent('OrderCreatedV1', { orderId: '2' }),
        createEvent('UserRegisteredV1', { userId: '1' }),
      ]);

      const subscription = adapter.subscribeToAll({
        fromPosition: 'end',
        filterByEventType: ['Order'],
      });
      const receivedEvents: ResolvedEventEnvelope[] = [];

      const collectPromise = (async () => {
        for await (const event of subscription.events) {
          receivedEvents.push(event);
          if (receivedEvents.length >= 2) {
            await subscription.unsubscribe();
            break;
          }
        }
      })();

      // Give subscription time to set up
      await new Promise((r) => setTimeout(r, 100));

      // Append more events
      await adapter.appendToStream(uniqueStreamId(), [
        createEvent('OrderCreatedV1', { orderId: '3' }),
        createEvent('PaymentReceivedV1', { paymentId: '2' }),
        createEvent('OrderShippedV1', { orderId: '3' }),
      ]);

      await collectPromise;

      // Should only receive Order* events
      expect(receivedEvents).toHaveLength(2);
      expect(
        receivedEvents.every((e) => e.event?.type.startsWith('Order'))
      ).toBe(true);
    });

    it('should receive events with stream name filter', async () => {
      const orderStream = `Order-${randomUUID()}`;
      const userStream = `User-${randomUUID()}`;

      const subscription = adapter.subscribeToAll({
        fromPosition: 'end',
        filterByStreamName: ['Order-'],
      });
      const receivedEvents: ResolvedEventEnvelope[] = [];

      const collectPromise = (async () => {
        for await (const event of subscription.events) {
          receivedEvents.push(event);
          if (receivedEvents.length >= 2) {
            await subscription.unsubscribe();
            break;
          }
        }
      })();

      // Give subscription time to set up
      await new Promise((r) => setTimeout(r, 100));

      // Append events to different streams
      await adapter.appendToStream(orderStream, [
        createEvent('OrderCreatedV1', { orderId: '1' }),
        createEvent('OrderCreatedV1', { orderId: '2' }),
      ]);
      await adapter.appendToStream(userStream, [
        createEvent('UserCreatedV1', { userId: '1' }),
      ]);

      await collectPromise;

      // Should only receive events from Order-* streams
      expect(receivedEvents).toHaveLength(2);
      expect(
        receivedEvents.every((e) => e.event?.streamId.startsWith('Order-'))
      ).toBe(true);
    });
  });

  describe('metadata preservation', () => {
    it('should preserve event metadata through round-trip', async () => {
      const streamId = uniqueStreamId();
      const metadata: EventMetadata = {
        correlationId: randomUUID(),
        causationId: randomUUID(),
        actor: 'test-actor-123',
      };
      const event: EventEnvelope = {
        id: randomUUID(),
        type: 'TestEventV1',
        data: { message: 'test' },
        metadata,
      };

      await adapter.appendToStream(streamId, [event]);

      const readEvents: RecordedEventEnvelope[] = [];
      for await (const e of adapter.readStream(streamId)) {
        readEvents.push(e);
      }

      expect(readEvents[0].metadata.correlationId).toBe(metadata.correlationId);
      expect(readEvents[0].metadata.causationId).toBe(metadata.causationId);
      expect(readEvents[0].metadata.actor).toBe(metadata.actor);
    });
  });
});

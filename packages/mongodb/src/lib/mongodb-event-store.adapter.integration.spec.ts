import { MongoDbEventStoreAdapter } from './mongodb-event-store.adapter';
import { MongoClient } from 'mongodb';
import type {
  EventEnvelope,
  RecordedEventEnvelope,
  ResolvedEventEnvelope,
} from '@pbuda/nestjs-event-store';
import { ConcurrencyConflictError } from '@pbuda/nestjs-event-store';
import { randomUUID } from 'crypto';

/**
 * Integration tests for MongoDbEventStoreAdapter.
 *
 * Requires a MongoDB replica set running on localhost:27017.
 * Start with: docker compose up -d mongodb.db mongodb.init
 * Wait ~10s after first start for replica set initialization.
 */

const MONGO_URI = 'mongodb://localhost:27017/?replicaSet=rs0';
const DB_NAME = 'integration-tests';

describe('MongoDbEventStoreAdapter Integration', () => {
  let client: MongoClient;
  let adapter: MongoDbEventStoreAdapter;

  // client is shared across all tests (expensive to reconnect)
  beforeAll(async () => {
    client = new MongoClient(MONGO_URI);
    await client.connect();
  });

  afterAll(async () => {
    await client.close();
  });

  // A fresh adapter per test is required because indexesReady resolves once and
  // the beforeEach collection drop removes indexes. A new adapter instance
  // re-triggers ensureIndexes() for each test.
  beforeEach(async () => {
    const db = client.db(DB_NAME);
    await db.collection('app_events').drop().catch(() => { /* ignore if not exists */ });
    await db.collection('app__event_counters').drop().catch(() => { /* ignore */ });
    adapter = new MongoDbEventStoreAdapter(client, DB_NAME);
    // Await indexesReady by reading from a nonexistent stream (no-op but triggers await indexesReady).
    // This prevents the indexesReady Promise from staying in-flight when afterAll closes the client.
    const noop: RecordedEventEnvelope[] = [];
    for await (const e of adapter.readStream('__warmup__')) { noop.push(e); }
  });

  afterEach(async () => {
    // No-op: client.close() is handled in afterAll; adapter has no independent resources
    // (the client it holds is the shared one from beforeAll).
  });

  const createEvent = (type: string, data: Record<string, unknown>): EventEnvelope => ({
    id: randomUUID(),
    type,
    data,
    metadata: { correlationId: randomUUID(), causationId: randomUUID(), actor: 'test-user' },
  });

  const uniqueStreamId = () => `test-stream-${randomUUID()}`;

  describe('subscribeToAll — filter validation', () => {
    it('throws when both filterByEventType and filterByStreamName are provided', () => {
      expect(() =>
        adapter.subscribeToAll({ filterByEventType: ['Order'], filterByStreamName: ['Order-'] })
      ).toThrow('filterByEventType');
    });
  });

  describe('appendToStream', () => {
    it('appends single event; nextExpectedRevision = 0n', async () => {
      const streamId = uniqueStreamId();
      const event = createEvent('TestEventV1', { message: 'hello' });

      const result = await adapter.appendToStream(streamId, [event]);

      expect(result.nextExpectedRevision).toBe(0n);
    });

    it('appends 3 events; nextExpectedRevision = 2n', async () => {
      const streamId = uniqueStreamId();
      const events = [
        createEvent('TestEventV1', { index: 1 }),
        createEvent('TestEventV1', { index: 2 }),
        createEvent('TestEventV1', { index: 3 }),
      ];

      const result = await adapter.appendToStream(streamId, events);

      expect(result.nextExpectedRevision).toBe(2n);
    });

    it('succeeds with correct expectedRevision (optimistic concurrency)', async () => {
      const streamId = uniqueStreamId();

      const result1 = await adapter.appendToStream(streamId, [
        createEvent('TestEventV1', { step: 1 }),
      ]);
      expect(result1.nextExpectedRevision).toBe(0n);

      const result2 = await adapter.appendToStream(
        streamId,
        [createEvent('TestEventV1', { step: 2 })],
        0n
      );
      expect(result2.nextExpectedRevision).toBe(1n);
    });

    it('throws ConcurrencyConflictError with wrong expectedRevision', async () => {
      const streamId = uniqueStreamId();

      await adapter.appendToStream(streamId, [
        createEvent('TestEventV1', { step: 1 }),
      ]);

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
    it('reads events in insertion order; revision 0-indexed', async () => {
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
      expect(readEvents[0].revision).toBe(0n);
      expect(readEvents[0].data).toEqual({ index: 1 });
      expect(readEvents[2].revision).toBe(2n);
      expect(readEvents[2].data).toEqual({ index: 3 });
    });

    it('reads with maxCount: 3 from 10 events', async () => {
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

    it('reads from specific revision (fromRevision: 2n → events at revision >= 2)', async () => {
      const streamId = uniqueStreamId();
      const events = Array.from({ length: 5 }, (_, i) =>
        createEvent('TestEventV1', { index: i })
      );

      await adapter.appendToStream(streamId, events);

      const readEvents: RecordedEventEnvelope[] = [];
      for await (const event of adapter.readStream(streamId, { fromRevision: 2n })) {
        readEvents.push(event);
      }

      expect(readEvents).toHaveLength(3);
      expect((readEvents[0].data as { index: number }).index).toBe(2);
    });

    it('returns empty iterable for nonexistent stream (no error)', async () => {
      const streamId = uniqueStreamId();

      const readEvents: RecordedEventEnvelope[] = [];
      for await (const event of adapter.readStream(streamId)) {
        readEvents.push(event);
      }

      expect(readEvents).toHaveLength(0);
    });

    it('reads backwards (direction: backwards, fromRevision: end)', async () => {
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
    it('receives historical events from start', async () => {
      const streamId = uniqueStreamId();
      const events = [
        createEvent('TestEventV1', { index: 1 }),
        createEvent('TestEventV1', { index: 2 }),
      ];

      await adapter.appendToStream(streamId, events);

      const subscription = adapter.subscribeToStream(streamId);
      const receivedEvents: ResolvedEventEnvelope[] = [];

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

    it('receives live events appended after subscription start', async () => {
      const streamId = uniqueStreamId();

      await adapter.appendToStream(streamId, [
        createEvent('TestEventV1', { index: 1 }),
      ]);

      const subscription = adapter.subscribeToStream(streamId);
      const receivedEvents: ResolvedEventEnvelope[] = [];

      const collectPromise = (async () => {
        for await (const event of subscription.events) {
          receivedEvents.push(event);
          if (receivedEvents.length >= 3) {
            await subscription.unsubscribe();
            break;
          }
        }
      })();

      // Give subscription time to set up and drain historical events
      await new Promise((r) => setTimeout(r, 100));
      await adapter.appendToStream(streamId, [
        createEvent('TestEventV1', { index: 2 }),
        createEvent('TestEventV1', { index: 3 }),
      ]);

      await collectPromise;

      expect(receivedEvents).toHaveLength(3);
    });

    it('fromRevision: end skips historical, receives only live events', async () => {
      const streamId = uniqueStreamId();

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

      // Give subscription time to set up (no historical events to drain)
      await new Promise((r) => setTimeout(r, 100));

      await adapter.appendToStream(streamId, [
        createEvent('TestEventV1', { index: 3 }),
      ]);

      await collectPromise;

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].event?.data).toEqual({ index: 3 });
    });
  });

  describe('subscribeToAll', () => {
    it('delivers only events matching filterByEventType prefix', async () => {
      const streamId = uniqueStreamId();

      const subscription = adapter.subscribeToAll({
        fromPosition: 'end',
        filterByEventType: ['Order'],
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

      await new Promise((r) => setTimeout(r, 100));

      await adapter.appendToStream(streamId, [
        createEvent('PaymentProcessed', { amount: 100 }),
        createEvent('OrderPlaced', { orderId: 'x1' }),
      ]);

      await collectPromise;

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].event?.type).toBe('OrderPlaced');
    });

    it('delivers only events from streams matching filterByStreamName prefix', async () => {
      const ordersStreamId = `Order-${randomUUID()}`;
      const usersStreamId = `User-${randomUUID()}`;

      const subscription = adapter.subscribeToAll({
        fromPosition: 'end',
        filterByStreamName: ['Order-'],
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

      await new Promise((r) => setTimeout(r, 100));

      await adapter.appendToStream(usersStreamId, [
        createEvent('UserRegistered', { userId: 'u1' }),
      ]);
      await adapter.appendToStream(ordersStreamId, [
        createEvent('OrderCreated', { orderId: 'o1' }),
      ]);

      await collectPromise;

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].event?.streamId).toBe(ordersStreamId);
    });
  });

  describe('metadata preservation', () => {
    it('preserves correlationId, causationId, and actor through append and read', async () => {
      const streamId = uniqueStreamId();
      const correlationId = randomUUID();
      const causationId = randomUUID();
      const actor = 'integration-test-user';

      const event: EventEnvelope = {
        id: randomUUID(),
        type: 'MetadataTestEvent',
        data: { payload: 'test' },
        metadata: { correlationId, causationId, actor },
      };

      await adapter.appendToStream(streamId, [event]);

      const readEvents: RecordedEventEnvelope[] = [];
      for await (const e of adapter.readStream(streamId)) {
        readEvents.push(e);
      }

      expect(readEvents).toHaveLength(1);
      expect(readEvents[0].metadata.correlationId).toBe(correlationId);
      expect(readEvents[0].metadata.causationId).toBe(causationId);
      expect(readEvents[0].metadata.actor).toBe(actor);
    });
  });
});

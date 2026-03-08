import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Long, MongoClient, MongoServerError } from 'mongodb';
import {
  IEventStoreAdapter,
  EventEnvelope,
  RecordedEventEnvelope,
  ResolvedEventEnvelope,
  AppendResult,
  ReadStreamOptions,
  Subscription,
  SubscribeToStreamOptions,
  SubscribeToAllOptions,
  ConcurrencyConflictError,
  validateEventMetadata,
} from '@pbuda/nestjs-event-store';
import type { EventMetadata } from '@pbuda/nestjs-event-store';

@Injectable()
export class MongoDbEventStoreAdapter
  implements IEventStoreAdapter, OnModuleDestroy
{
  private readonly indexesReady: Promise<void>;

  constructor(
    private readonly client: MongoClient,
    private readonly dbName: string,
    private readonly collectionName = 'events'
  ) {
    this.indexesReady = this.ensureIndexes();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
  }

  private async ensureIndexes(): Promise<void> {
    const col = this.getCollection();
    await col.createIndex({ streamId: 1, revision: 1 }, { unique: true });
    await col.createIndex({ globalPosition: 1 });
  }

  private getCollection() {
    return this.client.db(this.dbName).collection(this.collectionName);
  }

  private getCountersCollection() {
    return this.client.db(this.dbName).collection('_event_counters');
  }

  private mapDocToResolvedEnvelope(
    doc: Record<string, unknown>,
    metadata: EventMetadata
  ): ResolvedEventEnvelope {
    const recorded: RecordedEventEnvelope = {
      streamId: doc['streamId'] as string,
      id: doc['id'] as string,
      revision: (doc['revision'] as Long).toBigInt(),
      type: doc['type'] as string,
      created: doc['created'] as Date,
      data: doc['data'],
      metadata,
      position: {
        commit: (doc['globalPosition'] as Long).toBigInt(),
        prepare: (doc['globalPosition'] as Long).toBigInt(),
      },
    };
    return {
      event: recorded,
      commitPosition: recorded.position?.commit,
    };
  }

  async appendToStream(
    streamId: string,
    events: EventEnvelope[],
    expectedRevision?: bigint
  ): Promise<AppendResult> {
    await this.indexesReady;
    const session = this.client.startSession();
    let currentRevision = -1n;
    try {
      await session.withTransaction(async () => {
        const col = this.getCollection();
        const countersCol = this.getCountersCollection();

        // Find current max revision for the stream
        const lastDoc = await col.findOne(
          { streamId },
          { sort: { revision: -1 }, session }
        );
        currentRevision = lastDoc
          ? (lastDoc['revision'] as Long).toBigInt()
          : -1n;

        // Explicit concurrency check
        if (expectedRevision !== undefined && currentRevision !== expectedRevision) {
          throw new ConcurrencyConflictError(streamId, expectedRevision, currentRevision);
        }

        // Atomically allocate global positions for the batch
        const before = await countersCol.findOneAndUpdate(
          { _id: 'globalPosition' } as Record<string, unknown>,
          { $inc: { seq: Long.fromBigInt(BigInt(events.length)) } },
          { upsert: true, returnDocument: 'before', session }
        );
        const startGlobal = (before?.['seq'] as Long | undefined)?.toBigInt() ?? 0n;

        // Build and insert documents
        const docs = events.map((event, i) => ({
          streamId,
          revision: Long.fromBigInt(currentRevision + 1n + BigInt(i)),
          globalPosition: Long.fromBigInt(startGlobal + BigInt(i)),
          id: event.id,
          type: event.type,
          data: event.data,
          metadata: event.metadata,
          created: new Date(),
        }));

        await col.insertMany(docs, { session });
      });
    } catch (error) {
      if (error instanceof ConcurrencyConflictError) throw error;
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new ConcurrencyConflictError(streamId, expectedRevision ?? -1n, currentRevision);
      }
      throw error;
    } finally {
      await session.endSession();
    }
    return { nextExpectedRevision: currentRevision + BigInt(events.length) };
  }

  async *readStream(
    streamId: string,
    options?: ReadStreamOptions
  ): AsyncIterable<RecordedEventEnvelope> {
    await this.indexesReady;
    const col = this.getCollection();
    const direction = options?.direction ?? 'forwards';
    const fromRevision = options?.fromRevision ?? 'start';
    const maxCount = options?.maxCount;

    // 'end' + forwards → nothing to read
    if (fromRevision === 'end' && direction === 'forwards') {
      return;
    }

    // Build query
    const query: Record<string, unknown> = { streamId };
    if (typeof fromRevision === 'bigint') {
      if (direction === 'forwards') {
        query['revision'] = { $gte: Long.fromBigInt(fromRevision) };
      } else {
        query['revision'] = { $lte: Long.fromBigInt(fromRevision) };
      }
    }
    // 'start' + forwards: no revision filter (reads from 0)
    // 'end' + backwards: no revision filter (reads from last)

    const sortOrder = direction === 'forwards' ? 1 : -1;
    let cursor = col.find(query).sort({ revision: sortOrder });
    if (maxCount !== undefined) {
      cursor = cursor.limit(maxCount);
    }

    try {
      for await (const doc of cursor) {
        const metadata = validateEventMetadata(doc['metadata']);
        yield {
          streamId: doc['streamId'] as string,
          id: doc['id'] as string,
          revision: (doc['revision'] as Long).toBigInt(),
          type: doc['type'] as string,
          created: doc['created'] as Date,
          data: doc['data'],
          metadata,
          position: {
            commit: (doc['globalPosition'] as Long).toBigInt(),
            prepare: (doc['globalPosition'] as Long).toBigInt(),
          },
        };
      }
    } finally {
      await cursor.close();
    }
  }

  subscribeToStream(
    streamId: string,
    options?: SubscribeToStreamOptions
  ): Subscription {
    const col = this.getCollection();
    const fromRevision = options?.fromRevision ?? 'start';
    let cancelled = false;
    let activeChangeStream: import('mongodb').ChangeStream | null = null;

    // Bind helper to preserve 'this' context inside async generator
    const mapDoc = this.mapDocToResolvedEnvelope.bind(this);

    const generateEvents = async function* (): AsyncIterable<ResolvedEventEnvelope> {
      // 1. Open change stream first (buffers live events during historical drain)
      const pipeline = [{
        $match: {
          operationType: 'insert',
          'fullDocument.streamId': streamId,
        },
      }];
      const changeStream = col.watch(pipeline, { fullDocument: 'updateLookup' });
      activeChangeStream = changeStream;

      let lastHistoricalRevision = -1n;

      // 2. Yield historical events (skip entirely if fromRevision === 'end')
      if (fromRevision !== 'end') {
        const query: Record<string, unknown> = { streamId };
        if (typeof fromRevision === 'bigint') {
          query['revision'] = { $gte: Long.fromBigInt(fromRevision) };
        }
        const cursor = col.find(query).sort({ revision: 1 });
        try {
          for await (const doc of cursor) {
            if (cancelled) { await cursor.close(); return; }
            lastHistoricalRevision = (doc['revision'] as Long).toBigInt();
            const metadata = validateEventMetadata(doc['metadata']);
            yield mapDoc(doc as Record<string, unknown>, metadata);
          }
        } finally {
          await cursor.close();
        }
      }

      // 3. Yield live events from change stream, deduplicate already-yielded revisions
      try {
        for await (const change of changeStream) {
          if (cancelled) break;
          if (change.operationType !== 'insert') continue;
          const doc = change.fullDocument as Record<string, unknown> | null;
          if (!doc) continue;
          const rev = (doc['revision'] as Long).toBigInt();
          if (rev <= lastHistoricalRevision) continue; // already yielded in history
          const metadata = validateEventMetadata(doc['metadata']);
          yield mapDoc(doc, metadata);
        }
      } catch (err) {
        if (!cancelled) throw err;
        // swallow the close-triggered error when cancelled
      } finally {
        if (!changeStream.closed) await changeStream.close();
      }
    };

    return {
      events: generateEvents(),
      unsubscribe: async () => {
        cancelled = true;
        if (activeChangeStream && !activeChangeStream.closed) {
          await activeChangeStream.close();
        }
      },
    };
  }

  subscribeToAll(options?: SubscribeToAllOptions): Subscription {
    if (
      options?.filterByEventType && options.filterByEventType.length > 0 &&
      options?.filterByStreamName && options.filterByStreamName.length > 0
    ) {
      throw new Error(
        'subscribeToAll does not support filterByEventType and filterByStreamName ' +
        'simultaneously — use one or the other'
      );
    }

    const col = this.getCollection();
    const fromPosition = options?.fromPosition ?? 'start';
    const filterByEventType = options?.filterByEventType;
    const filterByStreamName = options?.filterByStreamName;
    let cancelled = false;
    let activeChangeStream: import('mongodb').ChangeStream | null = null;

    const mapDoc = this.mapDocToResolvedEnvelope.bind(this);

    const matchesFilters = (doc: Record<string, unknown>): boolean => {
      if (filterByEventType && filterByEventType.length > 0) {
        if (!filterByEventType.some((p) => (doc['type'] as string).startsWith(p))) return false;
      }
      if (filterByStreamName && filterByStreamName.length > 0) {
        if (!filterByStreamName.some((p) => (doc['streamId'] as string).startsWith(p))) return false;
      }
      return true;
    };

    const generateEvents = async function* (): AsyncIterable<ResolvedEventEnvelope> {
      // Open change stream first
      const changeStream = col.watch(
        [{ $match: { operationType: 'insert' } }],
        { fullDocument: 'updateLookup' }
      );
      activeChangeStream = changeStream;

      let lastHistoricalGlobalPos = -1n;

      // Historical phase (skip if fromPosition === 'end')
      if (fromPosition !== 'end') {
        const query: Record<string, unknown> = {};
        if (fromPosition !== 'start') {
          // fromPosition is an EventPosition object
          query['globalPosition'] = { $gt: Long.fromBigInt(fromPosition.commit) };
        }
        const cursor = col.find(query).sort({ globalPosition: 1 });
        try {
          for await (const doc of cursor) {
            if (cancelled) { await cursor.close(); return; }
            if (!matchesFilters(doc as Record<string, unknown>)) continue;
            lastHistoricalGlobalPos = (doc['globalPosition'] as Long).toBigInt();
            const metadata = validateEventMetadata(doc['metadata']);
            yield mapDoc(doc as Record<string, unknown>, metadata);
          }
        } finally {
          await cursor.close();
        }
      }

      // Live phase
      try {
        for await (const change of changeStream) {
          if (cancelled) break;
          if (change.operationType !== 'insert') continue;
          const doc = change.fullDocument as Record<string, unknown> | null;
          if (!doc) continue;
          if (!matchesFilters(doc)) continue;
          const gp = (doc['globalPosition'] as Long).toBigInt();
          if (gp <= lastHistoricalGlobalPos) continue; // deduplicate
          const metadata = validateEventMetadata(doc['metadata']);
          yield mapDoc(doc, metadata);
        }
      } catch (err) {
        if (!cancelled) throw err;
      } finally {
        if (!changeStream.closed) await changeStream.close();
      }
    };

    return {
      events: generateEvents(),
      unsubscribe: async () => {
        cancelled = true;
        if (activeChangeStream && !activeChangeStream.closed) {
          await activeChangeStream.close();
        }
      },
    };
  }
}

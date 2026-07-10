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

// MongoDB 6 driver promotes BSON Long to JavaScript number by default.
// useBigInt64: true makes the driver return Long values as native bigint,
// while leaving other numeric types (Int32, Double) as JavaScript numbers.
const BSON_OPTIONS = { useBigInt64: true } as const;

@Injectable()
export class MongoDbEventStoreAdapter
  implements IEventStoreAdapter, OnModuleDestroy
{
  private readonly indexesReady: Promise<void>;

  constructor(
    private readonly client: MongoClient,
    private readonly dbName: string,
    private readonly prefix = 'app'
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
    return this.client.db(this.dbName).collection(`${this.prefix}_events`);
  }

  private getCountersCollection() {
    return this.client.db(this.dbName).collection(`${this.prefix}__event_counters`);
  }

  private mapDocToResolvedEnvelope(
    doc: Record<string, unknown>,
    metadata: EventMetadata
  ): ResolvedEventEnvelope {
    const recorded: RecordedEventEnvelope = {
      streamId: doc['streamId'] as string,
      id: doc['id'] as string,
      revision: doc['revision'] as bigint,
      type: doc['type'] as string,
      created: doc['created'] as Date,
      data: doc['data'],
      metadata,
      position: {
        commit: doc['globalPosition'] as bigint,
        prepare: doc['globalPosition'] as bigint,
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
    const col = this.getCollection();
    const countersCol = this.getCountersCollection();

    try {
      // withTransaction automatically retries the callback on transient errors —
      // notably WriteConflict (code 112), which every concurrent append triggers
      // by contending on the shared globalPosition counter and the unique
      // { streamId, revision } index. It also retries the commit on
      // UnknownTransactionCommitResult. The callback re-reads all state on each
      // attempt, so a retry recomputes the revision and re-allocates positions.
      return await session.withTransaction(async (): Promise<AppendResult> => {
        // Find current max revision for the stream
        const lastDoc = await col.findOne(
          { streamId },
          { sort: { revision: -1 }, session, ...BSON_OPTIONS }
        );
        const currentRevision = lastDoc
          ? (lastDoc['revision'] as bigint)
          : -1n;

        // Explicit optimistic-concurrency check. ConcurrencyConflictError carries
        // no TransientTransactionError label, so withTransaction aborts and
        // propagates it instead of retrying.
        if (expectedRevision !== undefined && currentRevision !== expectedRevision) {
          throw new ConcurrencyConflictError(streamId, expectedRevision, currentRevision);
        }

        // Atomically allocate global positions for the batch
        const before = await countersCol.findOneAndUpdate(
          { _id: 'globalPosition' } as Record<string, unknown>,
          { $inc: { seq: Long.fromBigInt(BigInt(events.length)) } },
          { upsert: true, returnDocument: 'before', session, ...BSON_OPTIONS }
        );
        const startGlobal = (before?.['seq'] as bigint | undefined) ?? 0n;

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

        try {
          await col.insertMany(docs, { session });
        } catch (insertError) {
          // Duplicate key on { streamId, revision }: another writer already
          // claimed this revision. Non-transient — surface as a concurrency
          // conflict rather than letting withTransaction retry indefinitely.
          if (insertError instanceof MongoServerError && insertError.code === 11000) {
            throw new ConcurrencyConflictError(streamId, expectedRevision ?? -1n, currentRevision);
          }
          throw insertError;
        }

        return { nextExpectedRevision: currentRevision + BigInt(events.length) };
      });
    } finally {
      await session.endSession();
    }
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
    let cursor = col.find(query, BSON_OPTIONS).sort({ revision: sortOrder });
    if (maxCount !== undefined) {
      cursor = cursor.limit(maxCount);
    }

    try {
      for await (const doc of cursor) {
        const metadata = validateEventMetadata(doc['metadata']);
        yield {
          streamId: doc['streamId'] as string,
          id: doc['id'] as string,
          revision: doc['revision'] as bigint,
          type: doc['type'] as string,
          created: doc['created'] as Date,
          data: doc['data'],
          metadata,
          position: {
            commit: doc['globalPosition'] as bigint,
            prepare: doc['globalPosition'] as bigint,
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
      const changeStream = col.watch(pipeline, { fullDocument: 'updateLookup', ...BSON_OPTIONS });
      activeChangeStream = changeStream;

      let lastHistoricalRevision = -1n;

      // 2. Yield historical events (skip entirely if fromRevision === 'end')
      if (fromRevision !== 'end') {
        const query: Record<string, unknown> = { streamId };
        if (typeof fromRevision === 'bigint') {
          query['revision'] = { $gte: Long.fromBigInt(fromRevision) };
        }
        const cursor = col.find(query, BSON_OPTIONS).sort({ revision: 1 });
        try {
          for await (const doc of cursor) {
            if (cancelled) { await cursor.close(); return; }
            lastHistoricalRevision = doc['revision'] as bigint;
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
          const rev = doc['revision'] as bigint;
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
        { fullDocument: 'updateLookup', ...BSON_OPTIONS }
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
        const cursor = col.find(query, BSON_OPTIONS).sort({ globalPosition: 1 });
        try {
          for await (const doc of cursor) {
            if (cancelled) { await cursor.close(); return; }
            if (!matchesFilters(doc as Record<string, unknown>)) continue;
            lastHistoricalGlobalPos = doc['globalPosition'] as bigint;
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
          const gp = doc['globalPosition'] as bigint;
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

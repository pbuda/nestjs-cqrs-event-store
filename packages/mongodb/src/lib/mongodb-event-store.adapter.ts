import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Long, MongoClient, MongoServerError } from 'mongodb';
import {
  IEventStoreAdapter,
  EventEnvelope,
  RecordedEventEnvelope,
  AppendResult,
  ReadStreamOptions,
  Subscription,
  SubscribeToStreamOptions,
  SubscribeToAllOptions,
  ConcurrencyConflictError,
  validateEventMetadata,
} from '@pbuda/nestjs-event-store';

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
    _streamId: string,
    _options?: SubscribeToStreamOptions
  ): Subscription {
    throw new Error('Not implemented');
  }

  subscribeToAll(_options?: SubscribeToAllOptions): Subscription {
    throw new Error('Not implemented');
  }
}

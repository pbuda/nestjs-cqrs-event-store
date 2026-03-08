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

  // eslint-disable-next-line require-yield
  async *readStream(
    _streamId: string,
    _options?: ReadStreamOptions
  ): AsyncIterable<RecordedEventEnvelope> {
    throw new Error('Not implemented');
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

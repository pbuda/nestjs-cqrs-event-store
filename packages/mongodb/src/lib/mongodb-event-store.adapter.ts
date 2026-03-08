import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { MongoClient } from 'mongodb';
import {
  IEventStoreAdapter,
  EventEnvelope,
  RecordedEventEnvelope,
  AppendResult,
  ReadStreamOptions,
  Subscription,
  SubscribeToStreamOptions,
  SubscribeToAllOptions,
} from '@pbuda/nestjs-event-store';

@Injectable()
export class MongoDbEventStoreAdapter
  implements IEventStoreAdapter, OnModuleDestroy
{
  constructor(
    private readonly client: MongoClient,
    _dbName: string,
    _collectionName = 'events'
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
  }

  async appendToStream(
    _streamId: string,
    _events: EventEnvelope[],
    _expectedRevision?: bigint
  ): Promise<AppendResult> {
    throw new Error('Not implemented');
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

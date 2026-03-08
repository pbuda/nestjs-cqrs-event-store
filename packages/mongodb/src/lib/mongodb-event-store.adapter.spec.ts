import { MongoDbEventStoreAdapter } from './mongodb-event-store.adapter';
import type { MongoClient } from 'mongodb';
import { Long } from 'mongodb';
import { randomUUID } from 'crypto';

// Factory: creates a mock MongoClient with configurable collection behaviour
function makeMockClient(collectionOverride?: Record<string, unknown>): MongoClient {
  const defaultCollection = {
    createIndex: jest.fn().mockResolvedValue(undefined),
    find: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      [Symbol.asyncIterator]: async function* () { /* empty */ },
      close: jest.fn().mockResolvedValue(undefined),
    }),
    watch: jest.fn().mockReturnValue({
      [Symbol.asyncIterator]: async function* () { /* empty */ },
      closed: false,
      close: jest.fn().mockResolvedValue(undefined),
    }),
    ...collectionOverride,
  };
  return {
    db: jest.fn().mockReturnValue({
      collection: jest.fn().mockReturnValue(defaultCollection),
    }),
    close: jest.fn().mockResolvedValue(undefined),
    startSession: jest.fn(),
  } as unknown as MongoClient;
}

describe('MongoDbEventStoreAdapter — onModuleDestroy', () => {
  it('calls client.close()', async () => {
    const client = makeMockClient();
    const adapter = new MongoDbEventStoreAdapter(client, 'testdb');
    await adapter.onModuleDestroy();
    expect(client.close).toHaveBeenCalledTimes(1);
  });
});

describe('MongoDbEventStoreAdapter — subscribeToAll filter validation', () => {
  it('throws synchronously when both filter types are provided', () => {
    const client = makeMockClient();
    const adapter = new MongoDbEventStoreAdapter(client, 'testdb');
    expect(() =>
      adapter.subscribeToAll({
        filterByEventType: ['Order'],
        filterByStreamName: ['Order-'],
      })
    ).toThrow('filterByEventType');
  });

  it('does not throw when only filterByEventType is provided', () => {
    const client = makeMockClient();
    const adapter = new MongoDbEventStoreAdapter(client, 'testdb');
    expect(() =>
      adapter.subscribeToAll({ filterByEventType: ['Order'] })
    ).not.toThrow();
  });
});

describe('MongoDbEventStoreAdapter — metadata validation on readStream', () => {
  it('throws when iterating a stream event with invalid metadata', async () => {
    const badDoc = {
      streamId: 'test-stream',
      revision: Long.fromBigInt(0n),
      globalPosition: Long.fromBigInt(0n),
      id: randomUUID(),
      type: 'BadEvent',
      data: {},
      metadata: {},  // invalid — missing correlationId
      created: new Date(),
    };
    const badCursor = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      [Symbol.asyncIterator]: async function* () { yield badDoc; },
      close: jest.fn().mockResolvedValue(undefined),
    };
    const client = makeMockClient({ find: jest.fn().mockReturnValue(badCursor) });
    const adapter = new MongoDbEventStoreAdapter(client, 'testdb');

    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _event of adapter.readStream('test-stream')) {
        // exhaust the generator
      }
    }).rejects.toThrow('correlationId');
  });
});

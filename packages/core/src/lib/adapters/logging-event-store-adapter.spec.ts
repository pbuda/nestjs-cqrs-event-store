import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { ILoggableDomainEvent } from '../types/domain-event.interface';
import type { EventEnvelope } from '../types/event-envelope';
import type {
  AppendResult,
  IEventStoreAdapter,
  Subscription,
} from './event-store-adapter.interface';
import {
  EventStoreLoggingLevel,
  LoggingEventStoreAdapter,
} from './logging-event-store-adapter';

describe('LoggingEventStoreAdapter', () => {
  let mockAdapter: jest.Mocked<IEventStoreAdapter>;
  let mockLogger: jest.Mocked<Logger>;

  const createEvent = (type = 'TestEventV1'): EventEnvelope => ({
    id: randomUUID(),
    type,
    data: { message: 'test' },
    metadata: {
      correlationId: randomUUID(),
      causationId: randomUUID(),
      actor: 'test-user',
    },
  });

  const createLoggableEvent = (
    type = 'OrderCreatedV1',
    logOutput = 'orderId=123'
  ): EventEnvelope<ILoggableDomainEvent> => ({
    id: randomUUID(),
    type,
    data: {
      eventType: type,
      orderId: '123',
      secretField: 'should-not-appear',
      toLogString: () => logOutput,
    } as unknown as ILoggableDomainEvent,
    metadata: {
      correlationId: randomUUID(),
      causationId: randomUUID(),
      actor: 'test-user',
    },
  });

  const appendResult: AppendResult = { nextExpectedRevision: 1n };

  const createMockSubscription = (): jest.Mocked<Subscription> => ({
    events: (async function* () {
      /* empty */
    })(),
    unsubscribe: jest.fn().mockResolvedValue(undefined),
  });

  beforeEach(() => {
    mockAdapter = {
      appendToStream: jest.fn().mockResolvedValue(appendResult),
      readStream: jest.fn().mockReturnValue(
        (async function* () {
          /* empty */
        })()
      ),
      subscribeToStream: jest.fn().mockReturnValue(createMockSubscription()),
      subscribeToAll: jest.fn().mockReturnValue(createMockSubscription()),
    };

    mockLogger = {
      debug: jest.fn(),
      log: jest.fn(),
      error: jest.fn(),
    } as unknown as jest.Mocked<Logger>;
  });

  const createDecorator = (level: EventStoreLoggingLevel) =>
    new LoggingEventStoreAdapter(mockAdapter, level, mockLogger);

  describe('appendToStream', () => {
    it('delegates to inner adapter', async () => {
      const decorator = createDecorator('none');
      const events = [createEvent()];

      const result = await decorator.appendToStream(
        'stream-1',
        events,
        0n
      );

      expect(result).toEqual(appendResult);
      expect(mockAdapter.appendToStream).toHaveBeenCalledWith(
        'stream-1',
        events,
        0n
      );
    });

    it('does not log at none level', async () => {
      const decorator = createDecorator('none');

      await decorator.appendToStream('stream-1', [createEvent()]);

      expect(mockLogger.debug).not.toHaveBeenCalled();
      expect(mockLogger.log).not.toHaveBeenCalled();
    });

    it('logs event envelopes at events level via debug', async () => {
      const decorator = createDecorator('events');
      const event = createEvent('OrderCreatedV1');

      await decorator.appendToStream('stream-1', [event]);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('OrderCreatedV1(stream-1)')
      );
    });

    it('does not include event id or correlationId in log output', async () => {
      const decorator = createDecorator('events');
      const event = createEvent('OrderCreatedV1');

      await decorator.appendToStream('stream-1', [event]);

      const loggedMessage = mockLogger.debug.mock.calls
        .map(([msg]) => msg)
        .find((msg: string) => msg.includes('OrderCreatedV1'));
      expect(loggedMessage).not.toContain(event.id);
      expect(loggedMessage).not.toContain(event.metadata.correlationId);
    });

    it('does not log method call at events level', async () => {
      const decorator = createDecorator('events');

      await decorator.appendToStream('stream-1', [createEvent()]);

      expect(mockLogger.debug).not.toHaveBeenCalledWith(
        expect.stringContaining('appendToStream(stream-1')
      );
    });

    it('logs method call, envelopes, and result at all level via debug', async () => {
      const decorator = createDecorator('all');
      const event = createEvent('OrderCreatedV1');

      await decorator.appendToStream('stream-1', [event], 0n);

      // Method call logged at debug
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'appendToStream(stream-1, 1 events, expectedRevision=0)'
      );

      // Event envelope logged at debug (plain event)
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('OrderCreatedV1')
      );

      // Result logged at debug
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'appendToStream(stream-1) succeeded, nextExpectedRevision=1'
      );
    });

    it('logs expectedRevision as "any" when undefined at all level', async () => {
      const decorator = createDecorator('all');

      await decorator.appendToStream('stream-1', [createEvent()]);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('expectedRevision=any')
      );
    });

    it('logs and re-throws errors at all level', async () => {
      const decorator = createDecorator('all');
      const error = new Error('concurrency conflict');
      mockAdapter.appendToStream.mockRejectedValue(error);

      await expect(
        decorator.appendToStream('stream-1', [createEvent()])
      ).rejects.toThrow('concurrency conflict');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('appendToStream(stream-1) failed')
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('concurrency conflict')
      );
    });
  });

  describe('readStream', () => {
    it('delegates to inner adapter', () => {
      const decorator = createDecorator('none');

      decorator.readStream('stream-1', { maxCount: 10 });

      expect(mockAdapter.readStream).toHaveBeenCalledWith('stream-1', {
        maxCount: 10,
      });
    });

    it('does not log at none level', () => {
      const decorator = createDecorator('none');

      decorator.readStream('stream-1');

      expect(mockLogger.debug).not.toHaveBeenCalled();
      expect(mockLogger.log).not.toHaveBeenCalled();
    });

    it('does not log at events level', () => {
      const decorator = createDecorator('events');

      decorator.readStream('stream-1');

      expect(mockLogger.debug).not.toHaveBeenCalled();
      expect(mockLogger.log).not.toHaveBeenCalled();
    });

    it('logs method call at all level via debug', () => {
      const decorator = createDecorator('all');

      decorator.readStream('stream-1', {
        direction: 'backwards',
        maxCount: 5,
      });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'readStream(stream-1, {"direction":"backwards","maxCount":5})'
      );
    });
  });

  describe('subscribeToStream', () => {
    it('delegates to inner adapter', () => {
      const decorator = createDecorator('none');

      decorator.subscribeToStream('stream-1', { fromRevision: 'start' });

      expect(mockAdapter.subscribeToStream).toHaveBeenCalledWith('stream-1', {
        fromRevision: 'start',
      });
    });

    it('does not log at none level', () => {
      const decorator = createDecorator('none');

      decorator.subscribeToStream('stream-1');

      expect(mockLogger.debug).not.toHaveBeenCalled();
      expect(mockLogger.log).not.toHaveBeenCalled();
    });

    it('does not log at events level', () => {
      const decorator = createDecorator('events');

      decorator.subscribeToStream('stream-1');

      expect(mockLogger.debug).not.toHaveBeenCalled();
      expect(mockLogger.log).not.toHaveBeenCalled();
    });

    it('logs subscription start at all level via debug', () => {
      const decorator = createDecorator('all');

      decorator.subscribeToStream('stream-1', { fromRevision: 'end' });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'subscribeToStream(stream-1, {"fromRevision":"end"})'
      );
    });

    it('logs unsubscribe at all level via debug', async () => {
      const decorator = createDecorator('all');

      const subscription = decorator.subscribeToStream('stream-1');
      await subscription.unsubscribe();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'subscribeToStream(stream-1) unsubscribing'
      );
    });
  });

  describe('subscribeToAll', () => {
    it('delegates to inner adapter', () => {
      const decorator = createDecorator('none');

      decorator.subscribeToAll({ filterByEventType: ['Order'] });

      expect(mockAdapter.subscribeToAll).toHaveBeenCalledWith({
        filterByEventType: ['Order'],
      });
    });

    it('does not log at none level', () => {
      const decorator = createDecorator('none');

      decorator.subscribeToAll();

      expect(mockLogger.debug).not.toHaveBeenCalled();
      expect(mockLogger.log).not.toHaveBeenCalled();
    });

    it('does not log at events level', () => {
      const decorator = createDecorator('events');

      decorator.subscribeToAll();

      expect(mockLogger.debug).not.toHaveBeenCalled();
      expect(mockLogger.log).not.toHaveBeenCalled();
    });

    it('logs subscription start at all level via debug', () => {
      const decorator = createDecorator('all');

      decorator.subscribeToAll({ filterByEventType: ['Order'] });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'subscribeToAll({"filterByEventType":["Order"]})'
      );
    });

    it('logs unsubscribe at all level via debug', async () => {
      const decorator = createDecorator('all');

      const subscription = decorator.subscribeToAll();
      await subscription.unsubscribe();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'subscribeToAll unsubscribing'
      );
    });
  });

  describe('ILoggableDomainEvent', () => {
    it('logs at log level when event data implements the interface', async () => {
      const decorator = createDecorator('events');
      const event = createLoggableEvent('OrderCreatedV1', 'orderId=123');

      await decorator.appendToStream('stream-1', [event]);

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('orderId=123')
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('OrderCreatedV1')
      );
    });

    it('logs at debug level for plain event data', async () => {
      const decorator = createDecorator('events');
      const event = createEvent('TestEventV1');

      await decorator.appendToStream('stream-1', [event]);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('TestEventV1')
      );
      expect(mockLogger.log).not.toHaveBeenCalled();
    });

    it('uses log level at all level too', async () => {
      const decorator = createDecorator('all');
      const event = createLoggableEvent('OrderCreatedV1', 'customerId=abc');

      await decorator.appendToStream('stream-1', [event]);

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('customerId=abc')
      );
    });

    it('logs mixed events at correct levels', async () => {
      const decorator = createDecorator('events');
      const plainEvent = createEvent('PlainEventV1');
      const loggableEvent = createLoggableEvent('OrderCreatedV1', 'orderId=1');

      await decorator.appendToStream('stream-1', [plainEvent, loggableEvent]);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('PlainEventV1')
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('orderId=1')
      );
    });
  });

  describe('default logger', () => {
    it('creates a Logger when none is provided', async () => {
      const decorator = new LoggingEventStoreAdapter(mockAdapter, 'all');

      // Should not throw — internally creates a Logger
      await decorator.appendToStream('stream-1', [createEvent()]);

      expect(mockAdapter.appendToStream).toHaveBeenCalled();
    });
  });
});

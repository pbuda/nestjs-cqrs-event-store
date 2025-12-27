import {
  DynamicModule,
  InjectionToken,
  Module,
  OptionalFactoryDependency,
  Provider,
  Type,
} from '@nestjs/common';
import { CqrsModule, EventBus, EventPublisher } from '@nestjs/cqrs';
import {
  EVENT_STORE_ADAPTER,
  IEventStoreAdapter,
} from './adapters/event-store-adapter.interface';
import { EventContext } from './context/event-context';
import { PersistentEventBus } from './event-bus/persistent-event-bus';
import { EventEnvelopeFactory } from './services/event-envelope-factory';
import { PersistentEventPublisher } from './event-bus/persistent-event-publisher';

/**
 * Configuration options for EventStoreModule.
 */
export interface EventStoreModuleOptions {
  /**
   * The event store adapter class to use.
   * Must implement IEventStoreAdapter.
   */
  adapter: Type<IEventStoreAdapter>;
}

/**
 * Async configuration options for EventStoreModule.
 */
export interface EventStoreModuleAsyncOptions {
  /**
   * Factory function that returns the adapter instance.
   */
  useFactory: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...args: any[]
  ) => IEventStoreAdapter | Promise<IEventStoreAdapter>;

  /**
   * Dependencies to inject into the factory function.
   */
  inject?: (InjectionToken | OptionalFactoryDependency)[];

  /**
   * Modules to import for dependency injection.
   */
  imports?: DynamicModule['imports'];
}

@Module({})
export class EventStoreModule {
  /**
   * Configure the EventStoreModule with an event store adapter.
   *
   * @param options - Configuration options including the adapter class
   * @returns Dynamic module configuration
   *
   * @example
   * ```typescript
   * @Module({
   *   imports: [
   *     EventStoreModule.forRoot({
   *       adapter: KurrentDbAdapter,
   *     }),
   *   ],
   * })
   * export class AppModule {}
   * ```
   */
  static forRoot(options: EventStoreModuleOptions): DynamicModule {
    const adapterProvider: Provider = {
      provide: EVENT_STORE_ADAPTER,
      useClass: options.adapter,
    };

    return {
      module: EventStoreModule,
      global: true,
      imports: [CqrsModule],
      providers: [
        adapterProvider,
        EventContext,
        EventEnvelopeFactory,
        PersistentEventBus,
        PersistentEventPublisher,
        {
          provide: EventBus,
          useExisting: PersistentEventBus,
        },
        {
          provide: EventPublisher,
          useExisting: PersistentEventPublisher,
        },
      ],
      exports: [
        CqrsModule,
        EventBus,
        EventPublisher,
        PersistentEventBus,
        PersistentEventPublisher,
        EventContext,
        EVENT_STORE_ADAPTER,
      ],
    };
  }

  /**
   * Configure the EventStoreModule asynchronously.
   * Use this when the adapter requires async initialization or dependencies.
   *
   * @param options - Async configuration options
   * @returns Dynamic module configuration
   *
   * @example
   * ```typescript
   * @Module({
   *   imports: [
   *     EventStoreModule.forRootAsync({
   *       imports: [ConfigModule],
   *       inject: [ConfigService],
   *       useFactory: (config: ConfigService) => {
   *         return new KurrentDbAdapter(config.get('EVENTSTORE_URI'));
   *       },
   *     }),
   *   ],
   * })
   * export class AppModule {}
   * ```
   */
  static forRootAsync(options: EventStoreModuleAsyncOptions): DynamicModule {
    const adapterProvider: Provider = {
      provide: EVENT_STORE_ADAPTER,
      useFactory: options.useFactory,
      inject: options.inject ?? [],
    };

    return {
      module: EventStoreModule,
      global: true,
      imports: [...(options.imports ?? []), CqrsModule],
      providers: [
        adapterProvider,
        EventContext,
        EventEnvelopeFactory,
        PersistentEventBus,
        PersistentEventPublisher,
        {
          provide: EventBus,
          useExisting: PersistentEventBus,
        },
        {
          provide: EventPublisher,
          useExisting: PersistentEventPublisher,
        },
      ],
      exports: [
        CqrsModule,
        EventBus,
        EventPublisher,
        PersistentEventBus,
        PersistentEventPublisher,
        EventContext,
        EVENT_STORE_ADAPTER,
      ],
    };
  }
}

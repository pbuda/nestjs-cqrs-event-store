# Persistent Event Bus Implementation Plan

## Goal
Replace @nestjs/cqrs EventBus with a custom implementation that persists events to an event store (per-aggregate streams) before dispatching to handlers.

## Design Decisions (Confirmed)

| Decision | Choice |
|----------|--------|
| Integration | Replace EventBus via NestJS DI |
| Stream model | Per-aggregate streams (`{type}-{id}`) |
| Metadata | AsyncContext (set in middleware, auto-attached) |
| Concurrency | Repository pattern (repo tracks revision) |

## Architecture Overview

```
User Request
  ↓
Middleware sets AsyncContext { correlationId, actor }
  ↓
Repository.save(aggregate, expectedRevision)
  ↓
EventPublisher.publishAll(events, aggregate)
  ↓
PersistentEventBus.publishAll(events, dispatcherContext)
  ↓
1. Get metadata from AsyncContext
2. Extract streamId from aggregate (dispatcherContext)
3. Create EventEnvelopes
4. Persist to EventStore adapter
5. Dispatch to handlers via RxJS Subject
```

## Files to Create

| File | Purpose |
|------|---------|
| `types/aggregate.interface.ts` | IAggregateIdentifiable for stream naming |
| `types/domain-event.interface.ts` | IDomainEvent with type info |
| `adapters/event-store-adapter.interface.ts` | Abstract adapter interface |
| `context/event-context.ts` | AsyncContext wrapper for metadata |
| `event-bus/persistent-event-bus.ts` | Custom EventBus replacement |
| `services/event-envelope-factory.ts` | Domain event → EventEnvelope |

## Files to Modify

| File | Change |
|------|--------|
| `core.module.ts` | forRoot() config, provider registration |
| `index.ts` | Export new types |

## Implementation Details

### 1. IAggregateIdentifiable

```typescript
export interface IAggregateIdentifiable {
  readonly aggregateId: string;
  readonly aggregateType: string;
}
```

### 2. IDomainEvent

```typescript
export interface IDomainEvent {
  readonly eventType: string;  // "OrderPlacedV1"
}
```

### 3. IEventStoreAdapter

```typescript
export interface IEventStoreAdapter {
  appendToStream(
    streamId: string,
    events: EventEnvelope[],
    expectedRevision?: bigint
  ): Promise<AppendResult>;

  readStream(
    streamId: string,
    options?: ReadStreamOptions
  ): AsyncIterable<RecordedEventEnvelope>;
}
```

### 4. EventContext (AsyncContext Wrapper)

```typescript
@Injectable()
export class EventContext {
  private readonly storage = new AsyncLocalStorage<EventMetadata>();

  run<T>(metadata: EventMetadata, fn: () => T): T {
    return this.storage.run(metadata, fn);
  }

  getMetadata(): EventMetadata | undefined {
    return this.storage.getStore();
  }
}
```

### 5. PersistentEventBus

```typescript
@Injectable()
export class PersistentEventBus extends EventBus {
  constructor(
    private readonly adapter: IEventStoreAdapter,
    private readonly eventContext: EventContext,
    private readonly envelopeFactory: EventEnvelopeFactory,
    // ... parent deps
  ) { super(...); }

  async publishAll<T extends IEvent>(
    events: T[],
    dispatcherContext?: IAggregateIdentifiable,
    asyncContext?: AsyncContext
  ): Promise<void> {
    if (!dispatcherContext) {
      // No aggregate context - dispatch only, don't persist
      return super.publishAll(events, asyncContext);
    }

    const streamId = `${dispatcherContext.aggregateType}-${dispatcherContext.aggregateId}`;
    const metadata = this.eventContext.getMetadata();
    const envelopes = events.map(e =>
      this.envelopeFactory.create(e as IDomainEvent, metadata)
    );

    await this.adapter.appendToStream(streamId, envelopes);

    // Dispatch to handlers after successful persist
    return super.publishAll(events, dispatcherContext, asyncContext);
  }
}
```

### 6. Module Configuration

```typescript
@Module({})
export class CoreModule {
  static forRoot(options: CoreModuleOptions): DynamicModule {
    return {
      module: CoreModule,
      imports: [CqrsModule],
      providers: [
        EventContext,
        EventEnvelopeFactory,
        { provide: EVENT_STORE_ADAPTER, useClass: options.adapter },
        { provide: EventBus, useClass: PersistentEventBus },
      ],
      exports: [EventBus, EventContext],
    };
  }
}
```

## Implementation Order

1. `types/aggregate.interface.ts` - IAggregateIdentifiable
2. `types/domain-event.interface.ts` - IDomainEvent
3. `adapters/event-store-adapter.interface.ts` - IEventStoreAdapter + tokens
4. `context/event-context.ts` - AsyncLocalStorage wrapper
5. `services/event-envelope-factory.ts` - Creates envelopes
6. `event-bus/persistent-event-bus.ts` - Main implementation
7. `core.module.ts` - forRoot() configuration
8. `index.ts` - Exports

---

## Session Notes

**Questions resolved:**
- Integration: Replace EventBus via NestJS DI
- Stream model: Per-aggregate streams
- Metadata: AsyncContext (middleware sets correlationId/actor)
- Concurrency: Repository pattern (repo tracks expected revision)

**Key insight from @nestjs/cqrs analysis:**
- EventPublisher.mergeObjectContext() injects publish()/publishAll() into aggregates
- Aggregate passed as `dispatcherContext` to EventBus.publishAll()
- We can extract aggregateId/aggregateType from dispatcherContext
- Events dispatched to handlers via RxJS Subject after persistence

**Resume:** Ask to continue implementation

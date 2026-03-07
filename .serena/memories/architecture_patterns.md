# Architecture & Patterns

## Core Abstraction: IEventStoreAdapter
All storage backends implement `IEventStoreAdapter` from `@pbuda/nestjs-event-store`:
```typescript
interface IEventStoreAdapter {
  appendToStream(streamId: string, events: EventEnvelope[], expectedRevision?: bigint): Promise<AppendResult>
  readStream(streamId: string, options?: ReadStreamOptions): AsyncIterable<RecordedEventEnvelope>
  subscribeToStream(streamId: string, options?: SubscribeToStreamOptions): Subscription
  subscribeToAll(options?: SubscribeToAllOptions): Subscription
}
```

## Event Sourcing
- Streams named `{aggregateType}-{aggregateId}` (e.g., `Todo-abc123`)
- Aggregates implement `IAggregateIdentifiable` (provides `aggregateId` + `aggregateType`)
- Repositories replay full event stream on every `findById` — no snapshots
- `apply(event, { fromHistory: true })` distinguishes replay from new events

## PersistentEventBus
- Wraps `@nestjs/cqrs` EventBus via composition (not inheritance)
- Intercepts `publishAll()` → persists events → then dispatches to handlers/sagas
- Only persists if aggregate implements `IAggregateIdentifiable`
- Re-throws persistence errors (prevents dispatch if store fails)

## EventContext (AsyncLocalStorage)
- `EventContext.run({ correlationId, actor }, next)` — sets metadata scope for async chain
- `EventEnvelopeFactory` reads from context automatically when wrapping events
- Used in middleware/guards to thread correlation through command handling

## Module Configuration
```typescript
EventStoreModule.forRoot({ adapter: new KurrentDbEventStoreAdapter(connStr) })
EventStoreModule.forRootAsync({ inject: [ConfigService], useFactory: (cfg) => new Adapter(cfg) })
```

## Key Types
- `IDomainEvent` — extends IEvent, adds `eventType: string` (e.g., `'OrderCreatedV1'`)
- `ILoggableDomainEvent` — extends IDomainEvent, adds `toLogString()` for redacted logging
- `EventEnvelope` — wraps domain event with `id` (UUID), `type`, `data`, `metadata`
- `RecordedEventEnvelope` — adds `streamId`, `revision`, `created`, `position`
- `ResolvedEventEnvelope` — for subscriptions, adds optional `link` and `commitPosition`
- `EventMetadata` — `{ correlationId: string, causationId?: string, actor?: string }`
- `AppendResult` — `{ nextExpectedRevision: bigint }`

## Adapter Patterns
- `LoggingEventStoreAdapter` — Decorator wrapping any IEventStoreAdapter with configurable logging ('none'|'events'|'all')
- `StreamNotFoundError` → treat as empty iterable (not an error)
- Optimistic concurrency: `appendToStream(streamId, events, expectedRevision?)` — throw on conflict

## Async Generators
Both readStream and subscription generators use `async function*` — consumers use `for await`.
`Subscription` interface: `{ events: AsyncIterable<ResolvedEventEnvelope>, unsubscribe: () => Promise<void> }`

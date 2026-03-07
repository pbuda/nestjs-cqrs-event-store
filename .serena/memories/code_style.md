# Code Style & Conventions

## Naming
- Classes: PascalCase with descriptive suffix (`TodoAggregate`, `CreateTodoHandler`, `KurrentDbEventStoreAdapter`)
- Interfaces: `I` prefix (`IEventStoreAdapter`, `IDomainEvent`, `IAggregateIdentifiable`)
- Injection tokens: SCREAMING_SNAKE_CASE const Symbol (`EVENT_STORE_ADAPTER`)
- Event types: versioned string literal (`'TodoCreatedV1'`, `'OrderPlacedV2'`)
- Methods: camelCase; private helpers: camelCase (no underscore prefix)
- Files: kebab-case (`event-store.module.ts`, `kurrentdb-event-store.adapter.ts`)

## TypeScript
- Strict mode enabled (`strict: true`, `noUncheckedIndexedAccess`)
- Experimental decorators enabled
- ES2021 target for library output
- No `any` — use explicit types or generics
- Bigint for stream revisions and positions (e.g., `revision: bigint`)
- Use `type` import for type-only imports

## NestJS Patterns
- `@Injectable()` on all services; DI via constructor
- `@Module()` for feature modules; `forRoot`/`forRootAsync` for configurable library modules
- `ConfigModule.forRoot({ isGlobal: true })` once in AppModule
- Lifecycle hooks: `OnModuleDestroy` for cleanup (close db connections, subscriptions)

## Event Sourcing Conventions
- Domain events: `class FooCreatedEvent implements IDomainEvent { readonly eventType = 'FooCreatedV1' }`
- Aggregate on-handlers: `onFooCreatedEvent(event: FooCreatedEvent)` — mutate state only here
- Factory methods on aggregates: `static create(...)` applies first event
- Index barrels for directories: `commands/index.ts`, `events/index.ts`, etc.

## Error Handling
- Business rule violations: throw `new Error('...')` with descriptive message
- Missing aggregate: throw NestJS `NotFoundException`
- Concurrency conflict: throw `new Error('Concurrency conflict on stream ...')`
- `StreamNotFoundError` (or equivalent): catch and return empty iterable

## Testing
- `InMemoryEventStoreAdapter` for unit/integration tests — has `clear()`, `getStream()`, `getAllEvents()`
- Integration tests against real adapters use live Docker containers
- `describe` / `it` with `beforeEach`/`afterEach` for setup/teardown
- No mocking of core abstractions — prefer real implementations in tests

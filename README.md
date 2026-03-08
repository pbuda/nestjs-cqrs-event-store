# NestJS CQRS Event Store

[![npm version](https://img.shields.io/npm/v/@pbuda/nestjs-event-store.svg)](https://www.npmjs.com/package/@pbuda/nestjs-event-store)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Persistent event storage for [@nestjs/cqrs](https://github.com/nestjs/cqrs) - seamlessly integrate event sourcing into your NestJS applications with support for KurrentDB (EventStoreDB), in-memory storage, and more adapters planned for the future.

## Features

- **Seamless NestJS integration** - Drop-in replacement for the standard CQRS EventBus
- **Automatic event persistence** - Events are persisted before being dispatched to handlers
- **Multiple storage backends** - KurrentDB, MongoDB, or in-memory adapters
- **Optimistic concurrency control** - Built-in stream revision tracking
- **Catch-up subscriptions** - Subscribe to streams and receive historical + live events
- **Correlation tracking** - Automatic correlation IDs for event tracing
- **Pluggable architecture** - Easy to implement custom adapters

## Packages

| Package | Description |
|---------|-------------|
| [`@pbuda/nestjs-event-store`](https://www.npmjs.com/package/@pbuda/nestjs-event-store) | Core module with interfaces and NestJS integration |
| [`@pbuda/nestjs-event-store-kurrentdb`](https://www.npmjs.com/package/@pbuda/nestjs-event-store-kurrentdb) | KurrentDB (EventStoreDB) adapter |
| [`@pbuda/nestjs-event-store-mongodb`](https://www.npmjs.com/package/@pbuda/nestjs-event-store-mongodb) | MongoDB adapter (requires replica set) |
| [`@pbuda/nestjs-event-store-in-memory`](https://www.npmjs.com/package/@pbuda/nestjs-event-store-in-memory) | In-memory adapter for testing |

## Installation

```bash
# Core package (required)
npm install @pbuda/nestjs-event-store

# KurrentDB adapter
npm install @pbuda/nestjs-event-store-kurrentdb @kurrent/kurrentdb-client

# OR MongoDB adapter
npm install @pbuda/nestjs-event-store-mongodb mongodb

# OR In-memory adapter (for testing/development)
npm install @pbuda/nestjs-event-store-in-memory
```

## Quick Start

### 1. Configure the module

```typescript
import { Module } from '@nestjs/common';
import { EventStoreModule } from '@pbuda/nestjs-event-store';
import { KurrentDbEventStoreAdapter } from '@pbuda/nestjs-event-store-kurrentdb';

@Module({
  imports: [
    EventStoreModule.forRootAsync({
      useFactory: () => {
        return new KurrentDbEventStoreAdapter(
          'kurrentdb://localhost:2113?tls=false'
        );
      },
    }),
  ],
})
export class AppModule {}
```

### 2. Define domain events

```typescript
import { IDomainEvent } from '@pbuda/nestjs-event-store';

export class OrderCreated implements IDomainEvent {
  readonly eventType = 'OrderCreated';

  constructor(
    public readonly orderId: string,
    public readonly customerId: string,
    public readonly items: OrderItem[],
  ) {}
}
```

### 3. Use in aggregates

```typescript
import { AggregateRoot } from '@nestjs/cqrs';
import { IAggregateIdentifiable } from '@pbuda/nestjs-event-store';

export class Order extends AggregateRoot implements IAggregateIdentifiable {
  readonly aggregateType = 'Order';

  constructor(public readonly aggregateId: string) {
    super();
  }

  create(customerId: string, items: OrderItem[]) {
    // This event will be automatically persisted to stream "Order-{aggregateId}"
    this.apply(new OrderCreated(this.aggregateId, customerId, items));
  }
}
```

### 4. Publish events

Events are automatically persisted when published through the `EventPublisher`:

```typescript
import { CommandHandler, ICommandHandler, EventPublisher } from '@nestjs/cqrs';

@CommandHandler(CreateOrderCommand)
export class CreateOrderHandler implements ICommandHandler<CreateOrderCommand> {
  constructor(private publisher: EventPublisher) {}

  async execute(command: CreateOrderCommand) {
    const order = new Order(command.orderId);
    const orderWithPublisher = this.publisher.mergeObjectContext(order);

    orderWithPublisher.create(command.customerId, command.items);
    orderWithPublisher.commit(); // Events persisted to "Order-{orderId}" stream

    return order;
  }
}
```

## Configuration

### Environment-Based Adapter Selection

Switch between adapters based on environment configuration. See the [MongoDB adapter](#mongodb-adapter) section below for the full three-adapter example including MongoDB.

### MongoDB Adapter

The MongoDB adapter stores events in a single collection and uses Change Streams for live subscriptions. It requires a **replica set** — Change Streams and multi-document transactions are not available on standalone MongoDB instances.

#### Constructor

```typescript
new MongoDbEventStoreAdapter(
  client: MongoClient,      // pre-built, connected MongoClient
  dbName: string,           // database name
  collectionName?: string   // collection name, default: 'events'
)
```

The adapter creates two collections on startup:
- `events` (or your custom name) — stores all event documents
- `_event_counters` — maintains a monotonic global position counter

Two indexes are created automatically:
- `{ streamId, revision }` — unique, enforces optimistic concurrency
- `{ globalPosition }` — used by `subscribeToAll` historical cursor

#### Basic setup

```typescript
import { MongoClient } from 'mongodb';
import { MongoDbEventStoreAdapter } from '@pbuda/nestjs-event-store-mongodb';

EventStoreModule.forRootAsync({
  useFactory: () => {
    const client = new MongoClient('mongodb://localhost:27017/?replicaSet=rs0');
    return new MongoDbEventStoreAdapter(client, 'event_store');
  },
});
```

#### Custom collection name

```typescript
new MongoDbEventStoreAdapter(client, 'event_store', 'domain_events')
```

#### Environment-based adapter selection

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventStoreModule, IEventStoreAdapter } from '@pbuda/nestjs-event-store';
import { InMemoryEventStoreAdapter } from '@pbuda/nestjs-event-store-in-memory';
import { KurrentDbEventStoreAdapter } from '@pbuda/nestjs-event-store-kurrentdb';
import { MongoDbEventStoreAdapter } from '@pbuda/nestjs-event-store-mongodb';
import { MongoClient } from 'mongodb';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventStoreModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): IEventStoreAdapter => {
        const adapterType = config.get<string>('EVENT_STORE_ADAPTER', 'memory');

        if (adapterType === 'kurrentdb') {
          return new KurrentDbEventStoreAdapter(
            config.get('KURRENTDB_CONNECTION_STRING', 'kurrentdb://localhost:2113?tls=false')
          );
        }

        if (adapterType === 'mongodb') {
          const client = new MongoClient(
            config.get('MONGODB_CONNECTION_STRING', 'mongodb://localhost:27017/?replicaSet=rs0')
          );
          return new MongoDbEventStoreAdapter(
            client,
            config.get('MONGODB_DB_NAME', 'event_store')
          );
        }

        return new InMemoryEventStoreAdapter();
      },
    }),
  ],
})
export class AppModule {}
```

**Environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `EVENT_STORE_ADAPTER` | `memory` | Adapter to use: `memory`, `kurrentdb`, `mongodb` |
| `MONGODB_CONNECTION_STRING` | `mongodb://localhost:27017/?replicaSet=rs0` | MongoDB connection URI |
| `MONGODB_DB_NAME` | `event_store` | Database name |

#### Infrastructure requirements

The MongoDB adapter requires a replica set. For local development with Docker:

```yaml
# docker-compose.yaml
services:
  mongodb:
    image: mongo:7
    ports:
      - "27017:27017"
    command: mongod --replSet rs0 --bind_ip_all
    healthcheck:
      test: mongosh --eval "rs.status()" --quiet
      interval: 5s
      retries: 10

  mongodb-init:
    image: mongo:7
    depends_on:
      mongodb:
        condition: service_healthy
    command: >
      mongosh --host mongodb:27017 --eval
      "rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'localhost:27017' }] })"
    restart: "no"
```

> **Note:** The replica set member hostname (`localhost:27017` above) must match what your application resolves. If your app runs inside Docker, use the service name (`mongodb:27017`) instead.

### Using In-Memory Adapter for Testing

```typescript
import { EventStoreModule } from '@pbuda/nestjs-event-store';
import { InMemoryEventStoreAdapter } from '@pbuda/nestjs-event-store-in-memory';

EventStoreModule.forRoot({
  adapter: InMemoryEventStoreAdapter,
});
```

### Logging

The `LoggingEventStoreAdapter` decorator adds configurable logging to any adapter. Wrap your adapter and choose a logging level:

| Level | Behavior |
|-------|----------|
| `none` | No logging (default) |
| `events` | Log event envelopes on append — shows what's being persisted |
| `all` | Log all adapter method calls, event envelopes, results, and errors |

```typescript
import { EventStoreModule, LoggingEventStoreAdapter } from '@pbuda/nestjs-event-store';
import { KurrentDbEventStoreAdapter } from '@pbuda/nestjs-event-store-kurrentdb';

EventStoreModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const adapter = new KurrentDbEventStoreAdapter(
      config.get('KURRENTDB_CONNECTION_STRING', 'kurrentdb://localhost:2113?tls=false')
    );

    return new LoggingEventStoreAdapter(
      adapter,
      config.get('EVENT_STORE_LOG_LEVEL', 'none')
    );
  },
});
```

At `events` level, each appended event logs its type, id, and correlation id:

```
[LoggingEventStoreAdapter]   → Order-123: OrderCreatedV1 [id=abc-123, correlationId=def-456]
```

At `all` level, method calls and results are also logged:

```
[LoggingEventStoreAdapter] appendToStream(Order-123, 2 events, expectedRevision=1)
[LoggingEventStoreAdapter]   → Order-123: OrderCreatedV1 [id=abc-123, correlationId=def-456]
[LoggingEventStoreAdapter]   → Order-123: OrderShippedV1 [id=ghi-789, correlationId=def-456]
[LoggingEventStoreAdapter] appendToStream(Order-123) succeeded, nextExpectedRevision=3
```

Operational logs (method calls, results, plain event summaries) use `debug` level. Errors use `error` level. You can pass a custom `Logger` instance as the third constructor argument.

#### Logging Event Payloads

By default, log lines include only the event type, id, and correlation id. To include payload details, implement `ILoggableDomainEvent` on your domain event — this lets each event control what's safe to log:

```typescript
import { ILoggableDomainEvent } from '@pbuda/nestjs-event-store';

export class OrderCreated implements ILoggableDomainEvent {
  readonly eventType = 'OrderCreatedV1';

  constructor(
    public readonly orderId: string,
    public readonly customerId: string,
    private readonly creditCard: string, // sensitive — not logged
  ) {}

  toLogString(): string {
    return `orderId=${this.orderId}, customerId=${this.customerId}`;
  }
}
```

Events implementing `ILoggableDomainEvent` are logged at `log` level (instead of `debug`) with their `toLogString()` output appended — making them visible as an audit trail while operational noise stays at `debug`:

```
[LoggingEventStoreAdapter]   → Order-123: OrderCreatedV1 [id=abc-123, correlationId=def-456] orderId=1, customerId=cust-789
```

Events that don't implement the interface continue to log the compact summary. This is opt-in per event type — no adapter configuration needed.

## Reading Events

Access the adapter directly to read events or create subscriptions:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { EVENT_STORE_ADAPTER, IEventStoreAdapter } from '@pbuda/nestjs-event-store';

@Injectable()
export class OrderProjection {
  constructor(
    @Inject(EVENT_STORE_ADAPTER)
    private readonly eventStore: IEventStoreAdapter,
  ) {}

  async rebuildFromStream(orderId: string) {
    const events = this.eventStore.readStream(`Order-${orderId}`);
    for await (const event of events) {
      this.apply(event);
    }
  }

  async subscribeToOrders() {
    const subscription = this.eventStore.subscribeToAll({
      filterByStreamName: ['Order-'],
    });

    for await (const event of subscription.events) {
      this.apply(event.event);
    }
  }
}
```

## Development

### Prerequisites

- Node.js 18+
- Docker (for running KurrentDB)
- npm

### Setup

```bash
# Clone the repository
git clone https://github.com/pbuda/nestjs-cqrs-event-store.git
cd nestjs-cqrs-event-store

# Install dependencies
npm install
```

### Running KurrentDB

Start the KurrentDB instance required for integration tests:

```bash
docker compose up -d
```

KurrentDB will be available at `http://localhost:2113` with:
- Projections enabled
- Insecure mode (no TLS)
- AtomPub over HTTP enabled

### Build

```bash
# Build a specific package
npx nx build core
npx nx build kurrentdb
npx nx build in-memory

# Build all packages
npx nx run-many -t build
```

### Test

```bash
# Run tests for a package
npx nx test core

# Run a specific test file
npx nx test core --testFile=src/lib/some.spec.ts

# Run all tests
npx nx run-many -t test
```

### Lint & Type Check

```bash
# Lint
npx nx lint core

# Type check
npx nx typecheck core

# Run all checks
npx nx run-many -t lint,typecheck
```

### Sync TypeScript Project References

```bash
npx nx sync
```

## Project Structure

```
nestjs-cqrs-event-store/
├── packages/
│   ├── core/           # Core module, interfaces, and NestJS integration
│   ├── kurrentdb/      # KurrentDB adapter implementation
│   └── in-memory/      # In-memory adapter for testing
├── docker-compose.yaml # KurrentDB for local development
└── nx.json            # Nx workspace configuration
```

## Contributing

Contributions are welcome. Please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT

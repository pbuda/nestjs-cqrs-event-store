# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-03-09

### Changed

- **MongoDB adapter** (`@pbuda/nestjs-event-store-mongodb`): the third constructor parameter has changed from `collectionName` (a direct collection name) to `prefix` (a collection name prefix).
  - Events collection: `{prefix}_events` (default: `app_events`)
  - Counters collection: `{prefix}__event_counters` (default: `app__event_counters`)

### Migration from 0.4.0

If you were using the default (no third argument), rename your collections:

```
events           → app_events
_event_counters  → app__event_counters
```

If you were passing a custom collection name (e.g. `'domain_events'`), switch to a prefix:

```typescript
// Before
new MongoDbEventStoreAdapter(client, dbName, 'domain_events')

// After — pick a prefix; adapter appends _events and __event_counters
new MongoDbEventStoreAdapter(client, dbName, 'domain')
// creates: domain_events, domain__event_counters
```

Then rename the old collections in MongoDB accordingly.

## [0.4.0] - 2026-03-07

### Added

- MongoDB adapter (`@pbuda/nestjs-event-store-mongodb`) with replica set support
- Change Stream-based live subscriptions for `subscribeToStream` and `subscribeToAll`
- Optimistic concurrency control via per-stream revision tracking
- Global position counter with atomic `$inc` allocation
- `LoggingEventStoreAdapter` decorator with `none` / `events` / `all` levels
- `ILoggableDomainEvent` interface for opt-in payload logging

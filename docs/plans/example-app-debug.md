# Example App Debug Notes

## Current Status

The example app scaffolding is complete with a Todo domain, but events are not being persisted to the in-memory event store.

## Issue

When creating a todo via `POST /api/todos`, the response is:
```json
{"message":"Todo with id \"...\" not found","error":"Not Found","statusCode":404}
```

This happens because:
1. The command handler creates the aggregate and calls `repository.save()`
2. `save()` calls `publisher.mergeObjectContext(aggregate).commit()`
3. `commit()` calls `EventBus.publishAll()` but events don't reach `PersistentEventBus`
4. When controller tries to fetch the todo, no events exist in the store

## Root Cause Analysis

The `PersistentEventBus.publishAll()` checks if `dispatcherContext` implements `IAggregateIdentifiable`:

```typescript
if (!isAggregateIdentifiable(dispatcherContext)) {
  // Falls through to super.publishAll() without persisting
  return super.publishAll(events, dispatcherContext, asyncContext);
}
```

The issue is that when `EventPublisher.mergeObjectContext()` is called, it injects a `publish()` method that calls `EventBus.publishAll(events, this)` where `this` is the aggregate. However, this needs to be verified.

## Files to Investigate

1. **`packages/core/src/lib/event-bus/persistent-event-bus.ts`**
   - Add logging to see what `dispatcherContext` contains
   - Verify `isAggregateIdentifiable()` check is working

2. **`node_modules/@nestjs/cqrs/dist/event-publisher.js`**
   - Check how `mergeObjectContext` injects the publish method
   - Verify the aggregate is passed as dispatcher context

3. **`apps/example-app/src/app/todo/todo.repository.ts`**
   - Current implementation calls `mergeObjectContext` before `commit()`

## Debugging Steps

1. Add logging to `PersistentEventBus.publishAllInternal()`:
   ```typescript
   this.logger.debug(`publishAll called with ${events.length} events`);
   this.logger.debug(`dispatcherContext: ${JSON.stringify(dispatcherContext)}`);
   this.logger.debug(`isAggregateIdentifiable: ${isAggregateIdentifiable(dispatcherContext)}`);
   ```

2. Add logging to `InMemoryEventStoreAdapter.appendToStream()`:
   ```typescript
   this.logger.log(`appendToStream called for stream "${streamId}" with ${events.length} events`);
   ```

3. Run the app and check logs when creating a todo

## Potential Fixes

### Option 1: Verify EventPublisher behavior
Check if `@nestjs/cqrs` EventPublisher passes the aggregate as `dispatcherContext`. If not, we may need a different approach.

### Option 2: Override publish on aggregate
Instead of relying on EventPublisher, override the `publish` method on the aggregate to explicitly include aggregate info.

### Option 3: Use a wrapper/decorator
Create a custom `EventPublisher` that explicitly passes aggregate context.

## Changes Made to Core

1. **`packages/core/src/lib/core.module.ts`** - Added `global: true` to both `forRoot()` and `forRootAsync()` so exports are available across modules.

## Commands to Test

```bash
# Reset cache and rebuild
npx nx reset
npx nx build core
npx nx build example-app

# Run the app
npx nx serve example-app

# Test create (in another terminal)
curl -X POST http://localhost:3000/api/todos \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","description":"Test description"}'
```

## Next Steps

1. Add debug logging to trace the event flow
2. Identify where events are getting lost
3. Fix the persistence chain
4. Verify with tests

## 0.5.0 (2026-03-09)

### 🚀 Features

- ⚠️  **mongodb:** replace collectionName with prefix for collection naming ([e54e847](https://github.com/pbuda/nestjs-cqrs-event-store/commit/e54e847))
- **mongodb-adapter:** TASK-008 — integration tests; fix BSON deserialization and session lifecycle ([bb19fa8](https://github.com/pbuda/nestjs-cqrs-event-store/commit/bb19fa8))
- **mongodb-adapter:** TASK-007 — unit tests for onModuleDestroy, filter validation, metadata ([0bdc5b4](https://github.com/pbuda/nestjs-cqrs-event-store/commit/0bdc5b4))
- **mongodb-adapter:** TASK-006 — implement subscribeToAll with filters and change stream ([a309e26](https://github.com/pbuda/nestjs-cqrs-event-store/commit/a309e26))
- **mongodb-adapter:** TASK-005 — implement subscribeToStream with historical and live events ([942c130](https://github.com/pbuda/nestjs-cqrs-event-store/commit/942c130))
- **mongodb-adapter:** TASK-004 — implement readStream with direction, fromRevision, maxCount ([f444665](https://github.com/pbuda/nestjs-cqrs-event-store/commit/f444665))
- **mongodb-adapter:** TASK-003 — implement appendToStream with concurrency control ([753dd3c](https://github.com/pbuda/nestjs-cqrs-event-store/commit/753dd3c))
- **mongodb-adapter:** TASK-001 — scaffold MongoDB Nx package ([6da57e2](https://github.com/pbuda/nestjs-cqrs-event-store/commit/6da57e2))

### ⚠️  Breaking Changes

- **mongodb:** replace collectionName with prefix for collection naming  ([e54e847](https://github.com/pbuda/nestjs-cqrs-event-store/commit/e54e847))
  existing deployments must rename collections; see CHANGELOG.
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>

### ❤️ Thank You

- Claude Sonnet 4.6
- Piotr Buda @pbuda
# Project Overview: nestjs-cqrs-event-store

## Purpose
NestJS library that adds persistent event storage to `@nestjs/cqrs`. Intercepts the CQRS event bus (PersistentEventBus) to automatically persist domain events before dispatching — enabling event sourcing without modifying application code.

## Published Packages
- `@pbuda/nestjs-event-store` (core) — interfaces, module wiring, event bus
- `@pbuda/nestjs-event-store-in-memory` — in-memory adapter (testing/dev)
- `@pbuda/nestjs-event-store-kurrentdb` — KurrentDB/EventStoreDB adapter (production)
- `@pbuda/nestjs-event-store-postgresql` — PostgreSQL adapter (WIP, dist present, source missing)
- `@pbuda/nestjs-event-store-mongodb` — MongoDB adapter (WIP, mongodb branch)

## Tech Stack
- TypeScript 5.9 (strict mode, ES2021 target, experimental decorators)
- NestJS 11 + @nestjs/cqrs 11
- Nx 22.3 monorepo with npm workspaces (`packages/*`, `apps/*`)
- SWC (`@swc/core ~1.5`) for fast compilation in tests
- Jest 30 with @swc/jest
- ESLint 9 + Prettier 3.6
- KurrentDB via `@kurrent/kurrentdb-client ^1.1.0`
- PostgreSQL via `pg` (node-postgres)
- Verdaccio for local npm registry during publishing

## Monorepo Structure
```
packages/
  core/          — @pbuda/nestjs-event-store
  in-memory/     — @pbuda/nestjs-event-store-in-memory
  kurrentdb/     — @pbuda/nestjs-event-store-kurrentdb
  postgresql/    — @pbuda/nestjs-event-store-postgresql (WIP)
apps/
  example-app/       — Reference CQRS + event sourcing app (Todo domain)
  example-app-e2e/   — HTTP E2E tests (axios + Jest)
docker-compose.yaml  — KurrentDB for integration tests
nx.json              — Nx targets + release automation
tsconfig.base.json   — Shared strict TypeScript config
```

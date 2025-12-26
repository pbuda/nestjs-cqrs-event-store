# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NestJS CQRS Event Store library - a monorepo containing packages for persistent event storage for @nestjs/cqrs package, integrating NestJS applications with KurrentDB (formerly EventStoreDB), PostgresQL or MongoDB for event sourcing and CQRS patterns.

This library provides a common interface for event storage and adapters for the aforementioned databases with the main focus on KurrentDB.

## Workflow

- analyse requirements, ask questions - before any implementation a clear plan for the artifact must be created
- no big updates - work on smaller tasks
- keep a rudimentary task list
- no bullshitting, no shortcuts - you must always be critical of ideas
- guiding - propose resolutions, tasks and ideas, but everything must be reviewed to create a plan
- follow proper object oriented programming guidelines
- use architectural and design patterns
- access docs and samples if in doubt

## Documentation

- KurrentDB features https://docs.kurrent.io/server/v25.1/features/streams.html
- KurrentDB connectors https://docs.kurrent.io/server/v25.1/features/connectors/
- KurrentDB projections https://docs.kurrent.io/server/v25.1/features/projections/
- KurrentDB samples on GitHub https://github.com/kurrent-io/KurrentDB-Client-NodeJS/tree/master/packages/test/src/samples
- KurrentDB HTTP API documentation (different to gRPC from samples) https://docs.kurrent.io/server/v25.1/http-api/introduction.html

## Commands

```bash
# Build
npx nx build core

# Test
npx nx test core

# Run a single test file
npx nx test core --testFile=src/lib/some.spec.ts

# Lint
npx nx lint core

# Typecheck
npx nx typecheck core

# Run multiple targets
npx nx run-many -t build,test,lint -p core

# Sync TypeScript project references
npx nx sync

# Start KurrentDB (required for integration tests)
docker compose up -d
```

## Architecture

### Monorepo Structure

- **Nx workspace** with npm workspaces (`packages/*`)
- Packages are publishable libraries under `@pbuda/` scope
- Uses SWC for fast TypeScript compilation in tests

### Core Package (`packages/core`)

The main library providing NestJS integration with KurrentDB:

- `CoreModule` - NestJS module for event store integration
- `EventMetadata` interface - Defines correlation tracking with `correlationId` and optional `actor` fields

### Infrastructure

KurrentDB runs on port 2113 via Docker Compose with:
- Projections enabled
- Insecure mode (for development)
- AtomPub over HTTP enabled

### TypeScript Configuration

- Strict mode enabled with experimental decorators
- ES2021 target for library output
- Custom condition `@nestjs-cqrs-event-store/source` for source imports during development

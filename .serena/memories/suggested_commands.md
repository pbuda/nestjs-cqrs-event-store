# Suggested Commands

## Build
```bash
npx nx build core
npx nx build in-memory
npx nx build kurrentdb
npx nx build postgresql
npx nx run-many -t build -p core,in-memory,kurrentdb
```

## Test
```bash
npx nx test core
npx nx test core --testFile=src/lib/some.spec.ts
npx nx test kurrentdb        # requires Docker (KurrentDB)
npx nx e2e example-app-e2e  # requires running app + Docker
```

## Lint & Typecheck
```bash
npx nx lint core
npx nx typecheck core
npx nx run-many -t build,test,lint -p core
```

## Sync TypeScript project references
```bash
npx nx sync
```

## Docker (KurrentDB for integration tests)
```bash
docker compose up -d
docker compose down
```

## Release
```bash
npx nx release   # version bump, changelog, GitHub release, npm publish
```

## Local Registry (Verdaccio)
```bash
npx nx local-registry   # start local npm registry on :4873
```

## Task completion checklist
After implementing changes:
1. `npx nx typecheck <package>` — no type errors
2. `npx nx lint <package>` — no lint errors
3. `npx nx test <package>` — all tests pass
4. `npx nx build <package>` — build succeeds

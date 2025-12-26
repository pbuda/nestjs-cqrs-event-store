# MCP Server Plan

Create an MCP (Model Context Protocol) server to make the library AI-accessible for developers using Claude Code or other MCP-compatible tools.

## Goals

- Help AI assistants understand and use the library correctly
- Provide searchable documentation and code examples
- Expose type definitions and architectural patterns
- Enable AI to assist developers with event sourcing implementation

## Package Structure

```
packages/mcp-server/
├── src/
│   ├── index.ts                 # Main server entry point
│   ├── tools/
│   │   ├── code-search.ts       # Search library source code
│   │   ├── docs-query.ts        # Query documentation
│   │   ├── examples.ts          # Retrieve code examples
│   │   └── types-explorer.ts    # Explore type definitions
│   ├── resources/
│   │   ├── overview.ts          # Library overview resource
│   │   └── quick-reference.ts   # Quick reference resource
│   └── utils/
│       ├── file-reader.ts       # Read files from packages
│       └── search.ts            # Search implementation
├── data/
│   ├── guides/                  # How-to guides (markdown)
│   ├── api-reference/           # API documentation
│   └── examples/                # Code examples by topic
├── package.json
├── tsconfig.json
└── README.md
```

## Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  }
}
```

## Tools to Implement

### 1. search_code

Search through library source code.

```typescript
server.tool(
  "search_code",
  {
    query: z.string().describe("Search query for library code"),
    package: z.enum(["core", "all"]).optional().describe("Package to search"),
    maxResults: z.number().int().min(1).max(20).default(10),
  },
  async ({ query, package, maxResults }) => {
    // Use ripgrep or fs to search packages/*/src
    // Return file paths and code snippets
  }
);
```

### 2. get_docs

Query documentation by topic.

```typescript
server.tool(
  "get_docs",
  {
    topic: z.enum([
      "quick-start",
      "event-sourcing",
      "cqrs-pattern",
      "adapters",
      "kurrentdb",
      "api-reference",
      "testing",
      "event-metadata",
    ]).describe("Documentation topic"),
  },
  async ({ topic }) => {
    // Load markdown from data/guides/{topic}.md
  }
);
```

### 3. get_example

Retrieve code examples by scenario.

```typescript
server.tool(
  "get_example",
  {
    scenario: z.enum([
      "module-setup",
      "create-aggregate",
      "define-event",
      "handle-event",
      "query-events",
      "use-projection",
      "configure-kurrentdb",
      "configure-postgres",
      "configure-mongodb",
      "event-metadata",
      "testing",
    ]).describe("Type of example needed"),
  },
  async ({ scenario }) => {
    // Load examples from data/examples/{scenario}.ts
  }
);
```

### 4. explore_types

Look up type definitions with documentation.

```typescript
server.tool(
  "explore_types",
  {
    typeName: z.string().describe("Name of type/interface (e.g., 'EventMetadata', 'CoreModule')"),
  },
  async ({ typeName }) => {
    // Parse TypeScript files and extract type definitions
    // Include JSDoc comments
  }
);
```

### 5. explain_architecture

Explain architectural patterns and design decisions.

```typescript
server.tool(
  "explain_architecture",
  {
    component: z.enum([
      "adapter-pattern",
      "monorepo-structure",
      "event-flow",
      "cqrs-integration",
      "correlation-tracking",
    ]).describe("Architecture component to explain"),
  },
  async ({ component }) => {
    // Return curated architectural explanations
  }
);
```

## Resources to Expose

### overview

Static library overview with key concepts, features, and package structure.

### quick-reference

Condensed reference for:
- Core interfaces
- Configuration options
- Common patterns
- Troubleshooting tips

## Documentation Content to Create

### data/guides/

- `quick-start.md` - Getting started guide
- `event-sourcing.md` - Event sourcing concepts
- `cqrs-pattern.md` - CQRS implementation guide
- `adapters.md` - Adapter configuration overview
- `kurrentdb.md` - KurrentDB-specific guide
- `testing.md` - Testing strategies

### data/examples/

- `module-setup.ts` - CoreModule configuration
- `create-aggregate.ts` - Aggregate root example
- `define-event.ts` - Event class definition
- `handle-event.ts` - Event handler example
- `event-metadata.ts` - Using EventMetadata
- `configure-kurrentdb.ts` - KurrentDB adapter setup

### data/api-reference/

- `core-module.md` - CoreModule API
- `event-metadata.md` - EventMetadata interface
- `adapters.md` - Adapter interfaces

## Server Entry Point

```typescript
#!/usr/bin/env node

import { McpServer, StdioServerTransport } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const server = new McpServer({
  name: "nestjs-cqrs-event-store-mcp",
  version: "1.0.0",
});

// Register tools
// ... (implementations from above)

// Register resources
server.resource("overview", "text/markdown", () => ({
  contents: [{ uri: "library://overview", mimeType: "text/markdown", text: overviewContent }]
}));

// Connect transport
const transport = new StdioServerTransport();
await server.connect(transport);
```

## Distribution

### npm Package

Publish as `@pbuda/cqrs-event-store-mcp` to npm.

### Installation Command

```bash
claude mcp add cqrs-event-store -- npx @pbuda/cqrs-event-store-mcp
```

### MCP Registry

List on https://mcp.so for discoverability.

## Implementation Tasks

1. [ ] Create `packages/mcp-server` package structure
2. [ ] Set up TypeScript and dependencies
3. [ ] Implement `search_code` tool
4. [ ] Implement `get_docs` tool
5. [ ] Implement `get_example` tool
6. [ ] Implement `explore_types` tool
7. [ ] Implement `explain_architecture` tool
8. [ ] Create documentation content in `data/`
9. [ ] Add overview and quick-reference resources
10. [ ] Test locally with Claude Code
11. [ ] Add to Nx workspace configuration
12. [ ] Publish to npm
13. [ ] Submit to MCP registry
14. [ ] Document in main README

## References

- [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Documentation](https://modelcontextprotocol.io/docs/develop/build-server)
- [Context7 MCP](https://github.com/upstash/context7) - Example library docs MCP
- [MCP Registry](https://mcp.so)

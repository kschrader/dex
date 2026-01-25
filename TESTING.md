# Testing Guidelines

## Philosophy

Tests should be **comprehensive** and **isolated**. Every test must:
- Run independently without affecting other tests or local state
- Use temporary directories for storage (never touch real `.dex/`)
- Mock all network requests (GitHub API, etc.)
- Clean up resources in `afterEach` hooks

## Running Tests

```bash
pnpm test              # Run all tests once
pnpm test:watch        # Watch mode for development
```

## Test Organization

### File Naming
- Test files use `*.test.ts` extension
- Co-locate tests with source: `foo.ts` → `foo.test.ts`
- Shared utilities go in `test-helpers.ts` per domain

### Directory Structure
```
src/
├── cli/
│   ├── commands.ts
│   ├── commands.test.ts
│   └── test-helpers.ts      # CLI-specific helpers
├── core/
│   ├── task-service.ts
│   └── task-service.test.ts
├── mcp/
│   ├── server.ts
│   ├── server.test.ts
│   └── test-helpers.ts      # MCP-specific helpers
tests/
├── config.test.ts           # Cross-cutting integration tests
├── storage.test.ts
└── task-service.test.ts
```

## Test Isolation

### CLI Tests

Always use `createTempStorage()` to isolate file system operations:

```typescript
import { createTempStorage, captureOutput } from "./test-helpers.js";

describe("my command", () => {
  let storage: FileStorage;
  let cleanup: () => void;
  let output: ReturnType<typeof captureOutput>;

  beforeEach(() => {
    const temp = createTempStorage();
    storage = temp.storage;
    cleanup = temp.cleanup;
    output = captureOutput();
  });

  afterEach(() => {
    output.restore();
    cleanup();
  });

  it("does something", async () => {
    await runCli(["command", "--flag"], { storage });
    expect(output.stdout.join("\n")).toContain("expected");
  });
});
```

### Network Mocking

**All HTTP requests must be mocked.** Use nock for GitHub API:

```typescript
import { setupGitHubMock, cleanupGitHubMock, createIssueFixture } from "./test-helpers.js";

describe("github integration", () => {
  let github: nock.Scope;

  beforeEach(() => {
    github = setupGitHubMock();
  });

  afterEach(() => {
    cleanupGitHubMock();
  });

  it("fetches issues", async () => {
    github
      .get("/repos/owner/repo/issues/123")
      .reply(200, createIssueFixture({ number: 123, title: "Test" }));

    // ... test code
  });
});
```

### MCP Server Tests

Use `createMcpTestContext()` for in-process MCP testing:

```typescript
import { createMcpTestContext, parseToolResponse } from "./test-helpers.js";

describe("mcp tool", () => {
  it("handles request", async () => {
    const { client, cleanup } = await createMcpTestContext();

    try {
      const result = await client.callTool({ name: "tool_name", arguments: {} });
      const response = parseToolResponse(result);
      expect(response.success).toBe(true);
    } finally {
      await cleanup();
    }
  });
});
```

## Test Utilities

### CLI Helpers (`src/cli/test-helpers.ts`)

| Utility | Purpose |
|---------|---------|
| `captureOutput()` | Captures stdout/stderr for assertion |
| `createTempStorage()` | Creates isolated temp storage directory |
| `TASK_ID_REGEX` | Regex for matching task IDs in output |
| `setupGitHubMock()` | Sets up nock interceptors for GitHub API |
| `cleanupGitHubMock()` | Cleans up nock state after tests |
| `createIssueFixture()` | Factory for GitHub issue fixtures |
| `createFullDexIssueBody()` | Creates dex issue body with metadata |

### MCP Helpers (`src/mcp/test-helpers.ts`)

| Utility | Purpose |
|---------|---------|
| `createMcpTestContext()` | Creates in-process MCP client/server |
| `parseToolResponse()` | Parses JSON from MCP tool responses |
| `isErrorResult()` | Checks if tool result is an error |

## Writing Good Tests

### Do
- Test behavior, not implementation
- Use descriptive test names that explain the scenario
- Test error cases and edge conditions
- Group related tests with nested `describe()` blocks
- Verify cleanup happens (no leftover files, mocks cleared)

### Don't
- Share state between tests (each test should be independent)
- Make real network requests
- Depend on test execution order
- Leave unrestored mocks or spies
- Use hardcoded paths (use temp directories)

## Coverage Goals

We aim for comprehensive coverage of:
- All CLI commands
- Core business logic (task-service, storage)
- MCP server and tool handlers
- Error handling paths

Coverage tooling and thresholds are configured in `vitest.config.ts`.

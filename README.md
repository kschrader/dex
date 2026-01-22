# dex

Task tracking for LLM workflows. CLI + MCP server.

## Why dex?

**For Agent Coordination**: Dex enables agents to work as master coordinators on complex tasks - breaking down work, tracking structured deliverables, and recording comprehensive results.

**Tickets, Not Todos**: Each task is a structured ticket with full context:
- Like a **GitHub Issue**: Detailed description with background, requirements, approach
- Like a **PR description**: Implementation summary with decisions and outcomes

**Agent Benefits**:
- Resume work across sessions without losing context
- Coordinate with other agents through shared understanding
- Make informed decisions based on recorded rationale
- Reconcile data and understand past choices

**Git-Friendly**: One task per file enables collaboration, versioning, and conflict-free workflows.

## How Tasks Work

Tasks have three key components:

1. **Description** (required): One-line summary like an issue title
   - Example: "Add JWT authentication to API endpoints"

2. **Context** (required): Comprehensive background like an issue body
   - What/why, requirements, constraints, approach, acceptance criteria
   - Example: See `.dex/tasks/c2w75okn.json`

3. **Result** (when completing): Implementation summary like a PR description
   - What was built, key decisions, trade-offs, follow-ups
   - Example: See `.dex/tasks/c2w75okn.json`

This structure ensures tasks are self-contained artifacts that anyone can understand without additional context.

## Install

```bash
pnpm install
pnpm run build
```

## Usage

### CLI

```bash
# Create task with comprehensive context
dex create -d "Fix token refresh 401 errors" \
  --context "Users getting 401 errors when trying to refresh expired access tokens.

Problem: verify-token middleware rejects refresh requests with expired access tokens
before checking if it's a refresh flow.

Fix approach:
- Update src/middleware/verify-token.ts
- Add separate validation path for /auth/refresh endpoint
- Check refresh token validity independently from access token
- Return proper error codes: 401 for expired refresh, 403 for invalid

Done when:
- Users can refresh tokens successfully
- Tests cover expired access + valid refresh scenario
- No breaking changes to other auth flows"

# List tasks
dex list
dex list --all  # Include completed
dex show <id>   # View details

# Complete with detailed result
dex complete <id> --result "Fixed token refresh flow:

Implementation:
- Split token validation into two paths: regular auth and refresh
- Refresh endpoint now validates refresh token independently
- Access token expiry is ignored during refresh flow
- Error codes: 401 for expired refresh, 403 for invalid signature

Key decision: Used separate validation paths instead of adding flags to
existing middleware. Cleaner separation of concerns, easier to test.

Trade-off: Slight code duplication in validation logic, but more explicit
and less error-prone than conditional logic in shared function.

All tests passing, manual verification with expired tokens successful."

# Get help
dex help
```

### MCP Server

```bash
dex mcp
```

## Storage

Tasks stored as individual files in `.dex/tasks/{id}.json` (git root or home directory).

Override: `DEX_STORAGE_PATH` env var or `--storage-path` flag.

# Agent Instructions

## Package Manager
Use **pnpm**: `pnpm install`, `pnpm build`, `pnpm test`

## Commit Attribution
AI commits MUST include:
```
Co-Authored-By: <model name> <noreply@anthropic.com>
```
Example: `Co-Authored-By: Claude Sonnet 4 <noreply@anthropic.com>`

## Architecture
```
src/
├── index.ts           # Entry: routes to CLI or MCP
├── types.ts           # Zod schemas
├── core/              # Storage + TaskService
├── tools/             # MCP tool handlers
├── mcp/server.ts      # MCP server
└── cli/commands.ts    # CLI handlers
```

## Storage
One file per task: `.dex/tasks/{id}.json`

## Task Management
Use `dex` skill for task coordination. See `plugins/dex/skills/dex/SKILL.md`

## Task Planning
Use `dex-plan` skill for creating tasks from planning docs. See `plugins/dex/skills/dex-plan/SKILL.md`

## Local Development
```bash
pnpm install && pnpm run link  # Setup (builds + links globally)
pnpm build                      # Rebuild after changes
pnpm dev                        # Watch mode
pnpm run unlink                 # Cleanup
```

## Documentation
When adding or modifying CLI commands, update:
- `src/cli/help.ts` — Built-in help text
- `docs/src/pages/cli.astro` — CLI reference documentation

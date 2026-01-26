---
name: dex
description: Manage tasks via dex CLI. Use when breaking down complex work, tracking implementation items, or persisting context across sessions.
---

# Agent Coordination with dex

## Command Invocation

Use `dex` directly for all commands. If not on PATH, use `npx @zeeg/dex` instead.

```bash
command -v dex &>/dev/null && echo "use: dex" || echo "use: npx @zeeg/dex"
```

## Core Principle: Tickets, Not Todos

Dex tasks are **tickets** - structured artifacts with comprehensive context:
- **Description**: One-line summary (issue title)
- **Context**: Full background, requirements, approach (issue body)
- **Result**: Implementation details, decisions, outcomes (PR description)

Think: "Would someone understand the what, why, and how from this task alone?"

## Dex Tasks are Ephemeral

**Never reference dex task IDs in external artifacts** (commits, PRs, docs). Task IDs like `abc123` become meaningless once tasks are completed. Describe the work itself, not the task that tracked it.

## When to Use dex

**Use dex when:**
- Breaking down complexity into subtasks
- Work spans multiple sessions
- Context needs to persist for handoffs
- Recording decisions for future reference

**Skip dex when:**
- Work is a single atomic action
- Everything fits in one session with no follow-up
- Overhead exceeds value

## dex vs Claude Code's TaskCreate

| | dex | Claude Code TaskCreate |
|---|---|---|
| **Persistence** | Files in `.dex/` | Session-only |
| **Context** | Rich (description + context + result) | Basic |
| **Hierarchy** | 3-level (epic → task → subtask) | Flat |

Use **dex** for persistent work. Use **TaskCreate** for ephemeral in-session tracking only.

## Basic Workflow

### Create a Task

```bash
dex create -d "Short description" --context "Full implementation context"
```

Context should include: what needs to be done, why, implementation approach, and acceptance criteria. See [examples.md](examples.md) for good/bad examples.

### List and View Tasks

```bash
dex list                  # Pending tasks
dex list --ready          # Unblocked tasks
dex show <id>             # Full details
```

### Complete a Task

```bash
dex complete <id> --result "What was accomplished" --commit <sha>
```

**Always verify before completing.** Results must include evidence: test counts, build status, manual testing outcomes. See [verification.md](verification.md) for the full checklist.

### Edit and Delete

```bash
dex edit <id> --context "Updated context"
dex delete <id>
```

For full CLI reference including blockers, see [cli-reference.md](cli-reference.md).

## Starting Work on a Task

When picking up a task, **check if the context is sufficient**:
- Do I know **what** needs to be done specifically?
- Do I understand **why** this is needed?
- Is the **approach** clear?
- Do I know when it's **done**?

If any answer is "no," **suggest entering plan mode** to flesh out details before starting:

```
This task doesn't have enough context to start implementation confidently.
I'd recommend entering plan mode to work through the requirements.
```

**Proceed anyway when:**
- Task is trivial/atomic (e.g., "Add .gitignore entry")
- Conversation context makes the task clear
- Description itself is complete

## Task Hierarchies

Three levels: **Epic** (large initiative) → **Task** (significant work) → **Subtask** (atomic step).

**Choosing the right level:**
- Small feature (1-2 files) → Single task
- Medium feature (3-7 steps) → Task with subtasks
- Large initiative (5+ tasks) → Epic with tasks

```bash
# Create subtask under parent
dex create --parent <id> -d "Description" --context "..."
```

For detailed hierarchy guidance, see [hierarchies.md](hierarchies.md).

## Recording Results

Complete tasks **immediately after implementing AND verifying**:
- Capture decisions while fresh
- Note deviations from plan
- Document verification performed
- Create follow-up tasks for tech debt

Your result must include explicit verification evidence. Don't just describe what you did—prove it works. See [verification.md](verification.md).

## Best Practices

1. **Right-size tasks**: Completable in one focused session
2. **Clear completion criteria**: Context should define "done"
3. **Don't over-decompose**: 3-7 children per parent
4. **Action-oriented descriptions**: Start with verbs ("Add", "Fix", "Update")
5. **Verify before completing**: Tests passing, manual testing done

## Additional Resources

- [cli-reference.md](cli-reference.md) - Full CLI documentation
- [examples.md](examples.md) - Good/bad context and result examples
- [verification.md](verification.md) - Verification checklist and process
- [hierarchies.md](hierarchies.md) - Epic/task/subtask organization

---
name: dex-plan
description: Create dex task from markdown planning documents (plans, specs, design docs, roadmaps)
---

# Converting Markdown Documents to Tasks

Use `/dex-plan` to convert any markdown planning document into a trackable dex task.

## When to Use

**Common scenarios:**
- After completing a plan in plan mode → persist as trackable work
- Have a specification document → track implementation as structured task
- Design document ready for implementation → convert to dex task
- Roadmap or milestone document → create task with full context
- Any markdown file with planning/design content you want to track

## Supported Documents

Works with any markdown file containing planning or design content:
- Plan files from plan mode (`~/.claude/plans/*.md`)
- Specification documents (`SPEC.md`, `REQUIREMENTS.md`)
- Design documents (`DESIGN.md`, `ARCHITECTURE.md`)
- Roadmaps and milestone documents
- Feature proposals and technical RFCs
- Any markdown file with structured planning content

## Usage

```bash
/dex-plan <markdown-file-path>
```

### Examples

**From plan mode:**
```bash
/dex-plan /home/user/.claude/plans/moonlit-brewing-lynx.md
```

**From specification document:**
```bash
/dex-plan @SPEC.md
```

**From design document:**
```bash
/dex-plan docs/AUTHENTICATION_DESIGN.md
```

**From roadmap:**
```bash
/dex-plan ROADMAP.md
```

## What It Does

1. Reads any markdown file
2. Extracts title from first `#` heading (or uses filename as fallback)
3. Strips "Plan: " prefix if present (case-insensitive)
4. Stores full markdown content as task context
5. Creates dex task
6. Returns task ID

## Examples

**From plan mode file:**
```markdown
# Plan: Add JWT Authentication

## Summary
...
```
→ Task description: "Add JWT Authentication" (note: "Plan: " prefix stripped)

**From specification document:**
```markdown
# User Authentication Specification

## Requirements
...
```
→ Task description: "User Authentication Specification"

## Options

```bash
/dex-plan <file> --priority 2              # Set priority
/dex-plan <file> --parent abc123           # Create as subtask
```

## After Creating

Once created, you can:
- View: `dex show <task-id>`
- Create subtasks: `dex create --parent <task-id> -d "..." --context "..."`
- Track progress through implementation
- Complete: `dex complete <task-id> --result "..."`

## When NOT to Use

- Document is incomplete or exploratory (just draft notes)
- Content isn't actionable or ready for implementation
- File hasn't been saved to disk yet
- File doesn't contain meaningful planning/design content

import { TaskService } from "../core/task-service.js";
import { Task, TaskStatus } from "../types.js";

interface CliOptions {
  storagePath?: string;
}

interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

function createService(options: CliOptions): TaskService {
  return new TaskService(options.storagePath);
}

function formatTask(task: Task, verbose: boolean = false, indent: number = 0): string {
  const prefix = "  ".repeat(indent);
  const status = task.status === "completed" ? "✓" : "○";
  const priority = task.priority !== 1 ? ` [p${task.priority}]` : "";
  const project = task.project !== "default" ? ` (${task.project})` : "";

  let output = `${prefix}${status} ${task.id}${priority}${project}: ${task.description}`;

  if (verbose) {
    output += `\n${prefix}  Context: ${task.context}`;
    if (task.result) {
      output += `\n${prefix}  Result: ${task.result}`;
    }
    output += `\n${prefix}  Created: ${task.created_at}`;
    output += `\n${prefix}  Updated: ${task.updated_at}`;
  }

  return output;
}

function getStringFlag(flags: ParsedArgs["flags"], name: string): string | undefined {
  const value = flags[name];
  return typeof value === "string" ? value : undefined;
}

function getBooleanFlag(flags: ParsedArgs["flags"], name: string): boolean {
  return flags[name] === true;
}

function parseIntFlag(flags: ParsedArgs["flags"], name: string): number | undefined {
  const value = getStringFlag(flags, name);
  return value !== undefined ? parseInt(value, 10) : undefined;
}

export function runCli(args: string[], options: CliOptions = {}): void {
  const command = args[0];

  switch (command) {
    case "create":
      return createCommand(args.slice(1), options);
    case "list":
      return listCommand(args.slice(1), options);
    case "show":
      return showCommand(args.slice(1), options);
    case "edit":
      return editCommand(args.slice(1), options);
    case "complete":
      return completeCommand(args.slice(1), options);
    case "delete":
      return deleteCommand(args.slice(1), options);
    case "projects":
      return projectsCommand(options);
    case "help":
    case "--help":
    case "-h":
      return helpCommand();
    default:
      if (!command) {
        return listCommand([], options);
      }
      console.error(`Unknown command: ${command}`);
      console.error('Run "dex help" for usage information.');
      process.exit(1);
  }
}

interface FlagConfig {
  short?: string;
  hasValue: boolean;
}

function parseArgs(
  args: string[],
  flagDefs: Record<string, FlagConfig>
): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith("--")) {
      const flagName = arg.slice(2);
      const flagConfig = flagDefs[flagName];

      if (flagConfig?.hasValue) {
        flags[flagName] = args[++i] || "";
      } else {
        flags[flagName] = true;
      }
    } else if (arg.startsWith("-") && arg.length === 2) {
      const shortFlag = arg.slice(1);
      const flagEntry = Object.entries(flagDefs).find(
        ([, config]) => config.short === shortFlag
      );

      if (flagEntry) {
        const [flagName, flagConfig] = flagEntry;
        if (flagConfig.hasValue) {
          flags[flagName] = args[++i] || "";
        } else {
          flags[flagName] = true;
        }
      }
    } else {
      positional.push(arg);
    }
  }

  return { positional, flags };
}

function createCommand(args: string[], options: CliOptions): void {
  const { flags } = parseArgs(args, {
    description: { short: "d", hasValue: true },
    context: { hasValue: true },
    project: { hasValue: true },
    priority: { short: "p", hasValue: true },
    parent: { hasValue: true },
  });

  const description = getStringFlag(flags, "description");
  const context = getStringFlag(flags, "context");

  if (!description) {
    console.error("Error: --description (-d) is required");
    process.exit(1);
  }

  if (!context) {
    console.error("Error: --context is required");
    process.exit(1);
  }

  const service = createService(options);
  try {
    const task = service.create({
      description,
      context,
      parent_id: getStringFlag(flags, "parent"),
      project: getStringFlag(flags, "project"),
      priority: parseIntFlag(flags, "priority"),
    });

    console.log(`Created task ${task.id}`);
    console.log(formatTask(task));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

function printTaskTree(tasks: Task[], parentId: string | null, indent: number): void {
  const children = tasks
    .filter((t) => t.parent_id === parentId)
    .toSorted((a, b) => a.priority - b.priority);

  for (const task of children) {
    console.log(formatTask(task, false, indent));
    printTaskTree(tasks, task.id, indent + 1);
  }
}

function listCommand(args: string[], options: CliOptions): void {
  const { flags } = parseArgs(args, {
    all: { short: "a", hasValue: false },
    status: { short: "s", hasValue: true },
    project: { hasValue: true },
    query: { short: "q", hasValue: true },
    flat: { short: "f", hasValue: false },
  });

  const statusValue = getStringFlag(flags, "status");
  const status = statusValue === "pending" || statusValue === "completed"
    ? statusValue as TaskStatus
    : undefined;

  const service = createService(options);
  const tasks = service.list({
    all: getBooleanFlag(flags, "all") || undefined,
    status,
    project: getStringFlag(flags, "project"),
    query: getStringFlag(flags, "query"),
  });

  if (tasks.length === 0) {
    console.log("No tasks found.");
    return;
  }

  if (getBooleanFlag(flags, "flat")) {
    for (const task of tasks) {
      console.log(formatTask(task));
    }
  } else {
    printTaskTree(tasks, null, 0);
  }
}

function showCommand(args: string[], options: CliOptions): void {
  const { positional } = parseArgs(args, {});
  const id = positional[0];

  if (!id) {
    console.error("Error: Task ID is required");
    process.exit(1);
  }

  const service = createService(options);
  const task = service.get(id);

  if (!task) {
    console.error(`Task ${id} not found`);
    process.exit(1);
  }

  console.log(formatTask(task, true));

  const children = service.getChildren(id);
  if (children.length > 0) {
    const pending = children.filter((c) => c.status === "pending").length;
    const completed = children.filter((c) => c.status === "completed").length;
    console.log(`\n  Subtasks: ${pending} pending, ${completed} completed`);
  }
}

function editCommand(args: string[], options: CliOptions): void {
  const { positional, flags } = parseArgs(args, {
    description: { short: "d", hasValue: true },
    context: { hasValue: true },
    project: { hasValue: true },
    priority: { short: "p", hasValue: true },
    parent: { hasValue: true },
  });

  const id = positional[0];

  if (!id) {
    console.error("Error: Task ID is required");
    process.exit(1);
  }

  const service = createService(options);
  try {
    const task = service.update({
      id,
      description: getStringFlag(flags, "description"),
      context: getStringFlag(flags, "context"),
      parent_id: getStringFlag(flags, "parent"),
      project: getStringFlag(flags, "project"),
      priority: parseIntFlag(flags, "priority"),
    });

    if (!task) {
      console.error(`Task ${id} not found`);
      process.exit(1);
    }

    console.log(`Updated task ${id}`);
    console.log(formatTask(task));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

function completeCommand(args: string[], options: CliOptions): void {
  const { positional, flags } = parseArgs(args, {
    result: { short: "r", hasValue: true },
  });

  const id = positional[0];
  const result = getStringFlag(flags, "result");

  if (!id) {
    console.error("Error: Task ID is required");
    process.exit(1);
  }

  if (!result) {
    console.error("Error: --result (-r) is required");
    process.exit(1);
  }

  const service = createService(options);
  try {
    const task = service.complete(id, result);

    if (!task) {
      console.error(`Task ${id} not found`);
      process.exit(1);
    }

    console.log(`Completed task ${id}`);
    console.log(formatTask(task, true));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

function deleteCommand(args: string[], options: CliOptions): void {
  const { positional } = parseArgs(args, {});
  const id = positional[0];

  if (!id) {
    console.error("Error: Task ID is required");
    process.exit(1);
  }

  const service = createService(options);
  const deleted = service.delete(id);

  if (!deleted) {
    console.error(`Task ${id} not found`);
    process.exit(1);
  }

  console.log(`Deleted task ${id}`);
}

function projectsCommand(options: CliOptions): void {
  const service = createService(options);
  const projects = service.listProjects();

  if (projects.length === 0) {
    console.log("No projects found.");
    return;
  }

  for (const proj of projects) {
    const total = proj.pending + proj.completed;
    console.log(`${proj.project}: ${proj.pending} pending, ${proj.completed} completed (${total} total)`);
  }
}

function helpCommand(): void {
  console.log(`dex - Task tracking tool

USAGE:
  dex <command> [options]

COMMANDS:
  mcp                              Start MCP server (stdio)
  create -d "..." --context "..."  Create task
  list                             List pending tasks (tree view)
  list --flat                      List without tree hierarchy
  list --all                       Include completed tasks
  list --status completed          Filter by status
  list --project "auth"            Filter by project
  list --query "login"             Search description/context
  show <id>                        View task details + subtask count
  edit <id> [-d "..."]             Edit task
  complete <id> --result "..."     Mark completed with result
  delete <id>                      Remove task (cascades to subtasks)
  projects                         List all projects

OPTIONS:
  --storage-path <path>            Override storage file location
  -p, --priority <n>               Task priority (lower = higher priority)
  --project <name>                 Project grouping
  --parent <id>                    Parent task (creates subtask)

EXAMPLES:
  dex create -d "Fix login bug" --context "Users report 500 errors"
  dex create -d "Subtask" --context "..." --parent abc123
  dex list --project auth
  dex complete abc123 --result "Fixed by updating auth token refresh"
`);
}

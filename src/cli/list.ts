import { Task, TaskStatus } from "../types.js";
import {
  CliOptions,
  colors,
  createService,
  formatTask,
  formatBreadcrumb,
  getBooleanFlag,
  getStringFlag,
  parseArgs,
} from "./utils.js";

// Max description length for list view (to keep tree readable)
const LIST_DESCRIPTION_MAX_LENGTH = 60;

function printTaskTree(tasks: Task[], parentId: string | null, prefix: string = "", isRoot: boolean = true): void {
  const children = tasks
    .filter((t) => t.parent_id === parentId)
    .toSorted((a, b) => a.priority - b.priority);

  for (let i = 0; i < children.length; i++) {
    const task = children[i];
    const isLast = i === children.length - 1;

    if (isRoot) {
      // Root level tasks: no tree connectors
      console.log(formatTask(task, { truncateDescription: LIST_DESCRIPTION_MAX_LENGTH }));
      printTaskTree(tasks, task.id, "", false);
    } else {
      // Child tasks: use tree connectors
      const connector = isLast ? "└── " : "├── ";
      const childPrefix = prefix + (isLast ? "    " : "│   ");
      console.log(formatTask(task, { treePrefix: prefix + connector, truncateDescription: LIST_DESCRIPTION_MAX_LENGTH }));
      printTaskTree(tasks, task.id, childPrefix, false);
    }
  }
}

export async function listCommand(args: string[], options: CliOptions): Promise<void> {
  const { positional, flags } = parseArgs(args, {
    all: { short: "a", hasValue: false },
    status: { short: "s", hasValue: true },
    query: { short: "q", hasValue: true },
    flat: { short: "f", hasValue: false },
    json: { hasValue: false },
    help: { short: "h", hasValue: false },
  }, "list");

  if (getBooleanFlag(flags, "help")) {
    console.log(`${colors.bold}dex list${colors.reset} - List tasks

${colors.bold}USAGE:${colors.reset}
  dex list [filter] [options]

${colors.bold}ARGUMENTS:${colors.reset}
  [filter]                   Task ID (shows subtree) or search query

${colors.bold}OPTIONS:${colors.reset}
  -a, --all                  Include completed tasks
  -s, --status <status>      Filter by status (pending, completed)
  -q, --query <text>         Search in description and context (deprecated: use positional)
  -f, --flat                 Show flat list instead of tree view
  --json                     Output as JSON
  -h, --help                 Show this help message

${colors.bold}EXAMPLES:${colors.reset}
  dex list                   # Show pending tasks as tree
  dex list abc123            # Show task abc123 and its subtree
  dex list "auth"            # Search for tasks containing "auth"
  dex list --all             # Include completed tasks
  dex list -q "login" --flat # Search and show flat list (deprecated)
  dex list --json | jq '.'   # Output JSON for scripting
`);
    return;
  }

  // Handle positional filter argument
  const filterArg = positional[0];
  let parentFilter: string | undefined;
  let queryFilter: string | undefined;

  if (filterArg) {
    // Check if it looks like a task ID (8 lowercase alphanumeric chars)
    const isTaskId = /^[a-z0-9]{8}$/.test(filterArg);
    if (isTaskId) {
      parentFilter = filterArg;
    } else {
      queryFilter = filterArg;
    }
  }

  const statusValue = getStringFlag(flags, "status");
  let status: TaskStatus | undefined;
  if (statusValue !== undefined) {
    if (statusValue !== "pending" && statusValue !== "completed") {
      console.error(`${colors.red}Error:${colors.reset} Invalid value for --status: expected "pending" or "completed", got "${statusValue}"`);
      process.exit(1);
    }
    status = statusValue;
  }

  const service = createService(options);

  // If parent filter specified, validate it exists
  if (parentFilter) {
    const parentTask = await service.get(parentFilter);
    if (!parentTask) {
      // Fall back to treating as query if not a valid task ID
      queryFilter = filterArg;
      parentFilter = undefined;
    }
  }

  const tasks = await service.list({
    all: getBooleanFlag(flags, "all") || undefined,
    status,
    query: queryFilter ?? getStringFlag(flags, "query"),
  });

  // Filter to subtree if parent filter is active
  let filteredTasks = tasks;
  let subtreeRoot: Task | undefined;
  if (parentFilter) {
    const descendants = new Set<string>();
    collectSubtreeIds(tasks, parentFilter, descendants);
    // Include the root task itself
    filteredTasks = tasks.filter((t) => t.id === parentFilter || descendants.has(t.id));
    subtreeRoot = filteredTasks.find((t) => t.id === parentFilter);
  }

  // JSON output mode
  if (getBooleanFlag(flags, "json")) {
    console.log(JSON.stringify(filteredTasks, null, 2));
    return;
  }

  if (filteredTasks.length === 0) {
    console.log("No tasks found.");
    return;
  }

  // Show breadcrumb for subtree view
  if (subtreeRoot) {
    const ancestors = await service.getAncestors(subtreeRoot.id);
    if (ancestors.length > 0) {
      const breadcrumb = formatBreadcrumb(ancestors, subtreeRoot, 40);
      console.log(`${colors.dim}Path:${colors.reset} ${breadcrumb}`);
      console.log("");
    }
  }

  // Use flat mode when explicitly requested or when searching (tree display doesn't work well with filtered results)
  const useFlat = getBooleanFlag(flags, "flat") || Boolean(queryFilter) || Boolean(getStringFlag(flags, "query"));

  if (useFlat) {
    for (const task of filteredTasks) {
      console.log(formatTask(task, { truncateDescription: LIST_DESCRIPTION_MAX_LENGTH }));
    }
  } else if (subtreeRoot) {
    // Subtree view: show the root task, then its children as a tree
    console.log(formatTask(subtreeRoot, { truncateDescription: LIST_DESCRIPTION_MAX_LENGTH }));
    printTaskTree(filteredTasks, subtreeRoot.id, "", false);
  } else {
    // Full tree view: show all root-level tasks
    printTaskTree(filteredTasks, null, "");
  }
}

/**
 * Collect all descendant task IDs under a parent.
 */
function collectSubtreeIds(tasks: Task[], parentId: string, result: Set<string>): void {
  for (const task of tasks) {
    if (task.parent_id === parentId && !result.has(task.id)) {
      result.add(task.id);
      collectSubtreeIds(tasks, task.id, result);
    }
  }
}

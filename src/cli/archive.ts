import {
  CliOptions,
  createService,
  exitIfTaskNotFound,
  formatCliError,
} from "./utils.js";
import { colors } from "./colors.js";
import { getBooleanFlag, parseArgs } from "./args.js";
import { pluralize } from "./formatting.js";
import {
  collectArchivableTasks,
  compactTask,
} from "../core/archive-compactor.js";
import { ArchiveStorage } from "../core/storage/archive-storage.js";
import { cleanupTaskReferences } from "../core/task-relationships.js";
import { Task, TaskStore } from "../types.js";

export async function archiveCommand(
  args: string[],
  options: CliOptions,
): Promise<void> {
  const { positional, flags } = parseArgs(
    args,
    {
      help: { short: "h", hasValue: false },
    },
    "archive",
  );

  if (getBooleanFlag(flags, "help")) {
    console.log(`${colors.bold}dex archive${colors.reset} - Archive a completed task

${colors.bold}USAGE:${colors.reset}
  dex archive <task-id>

${colors.bold}ARGUMENTS:${colors.reset}
  <task-id>                  Task ID to archive (required)

${colors.bold}OPTIONS:${colors.reset}
  -h, --help                 Show this help message

${colors.bold}REQUIREMENTS:${colors.reset}
  - Task and all descendants must be completed
  - Task must not have any incomplete ancestors

${colors.bold}DESCRIPTION:${colors.reset}
  Archives a completed task and all its descendants to reduce storage size.
  Archived tasks are compacted and moved to archive.jsonl.

  Use ${colors.cyan}dex list --archived${colors.reset} to view archived tasks.

${colors.bold}EXAMPLES:${colors.reset}
  dex archive abc123         # Archive completed task and its subtasks
`);
    return;
  }

  const id = positional[0];

  if (!id) {
    console.error(`${colors.red}Error:${colors.reset} Task ID is required`);
    console.error(`Usage: dex archive <task-id>`);
    process.exit(1);
  }

  const service = createService(options);
  const task = await service.get(id);
  await exitIfTaskNotFound(task, id, service);

  // Get all tasks for validation
  const store = await options.storage.readAsync();
  const allTasks = store.tasks;

  // Collect archivable tasks (validates completion and ancestry)
  const collected = collectArchivableTasks(id, allTasks);

  if (!collected) {
    // Determine the specific reason for failure
    const rootTask = allTasks.find((t) => t.id === id);

    if (!rootTask?.completed) {
      console.error(
        `${colors.red}Error:${colors.reset} Task ${colors.bold}${id}${colors.reset} is not completed`,
      );
      console.error(
        `${colors.dim}Hint:${colors.reset} Complete the task with ${colors.cyan}dex complete ${id} --result "..."${colors.reset}`,
      );
      process.exit(1);
    }

    // Check for incomplete descendants
    const incompleteDescendants = findIncompleteDescendants(allTasks, id);
    if (incompleteDescendants.length > 0) {
      console.error(
        `${colors.red}Error:${colors.reset} Task has ${incompleteDescendants.length} incomplete ${pluralize(incompleteDescendants.length, "subtask")}:`,
      );
      for (const desc of incompleteDescendants.slice(0, 5)) {
        console.error(`  - ${desc.id}: ${desc.name}`);
      }
      if (incompleteDescendants.length > 5) {
        console.error(`  ... and ${incompleteDescendants.length - 5} more`);
      }
      process.exit(1);
    }

    // Check for active ancestors
    const activeAncestors = findActiveAncestors(allTasks, id);
    if (activeAncestors.length > 0) {
      console.error(
        `${colors.red}Error:${colors.reset} Task has ${activeAncestors.length} incomplete ${pluralize(activeAncestors.length, "ancestor")}:`,
      );
      for (const anc of activeAncestors) {
        console.error(`  - ${anc.id}: ${anc.name}`);
      }
      console.error(
        `${colors.dim}Hint:${colors.reset} Archive from the root of the completed lineage`,
      );
      process.exit(1);
    }

    // Unknown failure reason
    console.error(
      `${colors.red}Error:${colors.reset} Cannot archive task ${colors.bold}${id}${colors.reset}`,
    );
    process.exit(1);
  }

  const { root, descendants } = collected;
  const allToArchive = [root, ...descendants];

  try {
    // Group descendants by their direct parent for compaction
    const directChildren = descendants.filter((t) => t.parent_id === root.id);
    const archivedRoot = compactTask(root, directChildren);

    // Compact descendants with their children
    const archivedDescendants = descendants.map((desc) => {
      const children = descendants.filter((t) => t.parent_id === desc.id);
      return compactTask(desc, children);
    });

    // Append to archive
    const archiveStorage = new ArchiveStorage({
      path: options.storage.getIdentifier(),
    });
    archiveStorage.appendArchive([archivedRoot, ...archivedDescendants]);

    // Remove from active tasks and clean up blocking references
    const idsToRemove = new Set(allToArchive.map((t) => t.id));
    const remainingTasks = allTasks.filter((t) => !idsToRemove.has(t.id));

    // Clean up blocking references in remaining tasks
    const updatedStore: TaskStore = { tasks: remainingTasks };
    for (const archivedId of idsToRemove) {
      cleanupTaskReferences(updatedStore, archivedId);
    }

    await options.storage.writeAsync(updatedStore);

    // Calculate and display size reduction
    const originalSize = JSON.stringify(allToArchive).length;
    const archivedSize = JSON.stringify([
      archivedRoot,
      ...archivedDescendants,
    ]).length;
    const reduction = Math.round((1 - archivedSize / originalSize) * 100);

    const taskCount = allToArchive.length;

    console.log(
      `${colors.green}Archived${colors.reset} ${colors.bold}${taskCount}${colors.reset} ${pluralize(taskCount, "task")}`,
    );
    if (descendants.length > 0) {
      console.log(
        `  ${colors.dim}Root:${colors.reset} ${root.id}: ${root.name}`,
      );
      console.log(
        `  ${colors.dim}Subtasks:${colors.reset} ${descendants.length}`,
      );
    }
    console.log(`  ${colors.dim}Size reduction:${colors.reset} ${reduction}%`);
  } catch (err) {
    console.error(formatCliError(err));
    process.exit(1);
  }
}

/**
 * Find all incomplete descendants of a task.
 */
function findIncompleteDescendants(allTasks: Task[], taskId: string): Task[] {
  const incomplete: Task[] = [];
  const stack = [taskId];

  while (stack.length > 0) {
    const currentId = stack.pop()!;

    for (const task of allTasks) {
      if (task.parent_id === currentId) {
        if (!task.completed) {
          incomplete.push(task);
        }
        stack.push(task.id);
      }
    }
  }

  return incomplete;
}

/**
 * Find all incomplete ancestors of a task.
 */
function findActiveAncestors(allTasks: Task[], taskId: string): Task[] {
  const ancestors: Task[] = [];
  let current = allTasks.find((t) => t.id === taskId);

  while (current?.parent_id) {
    const parent = allTasks.find((t) => t.id === current!.parent_id);
    if (!parent) break;

    if (!parent.completed) {
      ancestors.push(parent);
    }
    current = parent;
  }

  return ancestors;
}

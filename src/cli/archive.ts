import type { CliOptions } from "./utils.js";
import { createService, exitIfTaskNotFound, formatCliError } from "./utils.js";
import { colors } from "./colors.js";
import { getBooleanFlag, getStringFlag, parseArgs } from "./args.js";
import { pluralize } from "./formatting.js";
import type { CollectedArchiveTasks } from "../core/archive-compactor.js";
import {
  collectArchivableTasks,
  compactTask,
} from "../core/archive-compactor.js";
import { ArchiveStorage } from "../core/storage/archive-storage.js";
import { cleanupTaskReferences } from "../core/task-relationships.js";
import type { ArchivedTask, Task, TaskStore } from "../types.js";

export async function archiveCommand(
  args: string[],
  options: CliOptions,
): Promise<void> {
  const { positional, flags } = parseArgs(
    args,
    {
      help: { short: "h", hasValue: false },
      "older-than": { hasValue: true },
      completed: { hasValue: false },
      except: { hasValue: true },
      "dry-run": { hasValue: false },
    },
    "archive",
  );

  if (getBooleanFlag(flags, "help")) {
    console.log(`${colors.bold}dex archive${colors.reset} - Archive completed tasks

${colors.bold}USAGE:${colors.reset}
  dex archive <task-id>
  dex archive --completed [--except <ids>]
  dex archive --older-than <duration> [--except <ids>]

${colors.bold}ARGUMENTS:${colors.reset}
  <task-id>                  Task ID to archive

${colors.bold}OPTIONS:${colors.reset}
  --older-than <duration>    Archive tasks completed more than <duration> ago
                             Format: 30d (days), 12w (weeks), 6m (months)
  --completed                Archive ALL completed tasks (use with caution)
  --except <ids>             Comma-separated task IDs to exclude from bulk archive
  --dry-run                  Show what would be archived without making changes
  -h, --help                 Show this help message

${colors.bold}REQUIREMENTS:${colors.reset}
  - Task and all descendants must be completed
  - Task must not have any incomplete ancestors

${colors.bold}DESCRIPTION:${colors.reset}
  Archives completed tasks and their descendants to reduce storage size.
  Archived tasks are compacted and moved to archive.jsonl.

  Use ${colors.cyan}dex list --archived${colors.reset} to view archived tasks.

${colors.bold}EXAMPLES:${colors.reset}
  dex archive abc123                    # Archive a specific task
  dex archive --older-than 60d          # Archive tasks completed >60 days ago
  dex archive --completed               # Archive ALL completed tasks
  dex archive --completed --except abc  # Archive all except task abc
  dex archive --older-than 30d --dry-run  # Preview what would be archived
`);
    return;
  }

  const id = positional[0];
  const olderThan = getStringFlag(flags, "older-than");
  const archiveAllCompleted = getBooleanFlag(flags, "completed");
  const exceptIds = getStringFlag(flags, "except")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const dryRun = getBooleanFlag(flags, "dry-run");

  // Handle bulk operations
  if (olderThan || archiveAllCompleted) {
    return await bulkArchive(options, {
      olderThan,
      archiveAllCompleted,
      exceptIds,
      dryRun,
    });
  }

  if (!id) {
    console.error(`${colors.red}Error:${colors.reset} Task ID is required`);
    console.error(`Usage: dex archive <task-id>`);
    console.error(`       dex archive --older-than <duration>`);
    console.error(`       dex archive --completed`);
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
    const archivedTasks = compactCollection(collected);

    // Append to archive
    const archiveStorage = new ArchiveStorage({
      path: options.storage.getIdentifier(),
    });
    archiveStorage.appendArchive(archivedTasks);

    // Remove from active tasks and clean up blocking references
    const updatedStore = removeArchivedTasks(allTasks, allToArchive);
    await options.storage.writeAsync(updatedStore);

    // Calculate and display size reduction
    const originalSize = JSON.stringify(allToArchive).length;
    const archivedSize = JSON.stringify(archivedTasks).length;
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

/**
 * Compact a collection of tasks (root + descendants) into archived format.
 */
function compactCollection(collection: CollectedArchiveTasks): ArchivedTask[] {
  const { root, descendants } = collection;
  const directChildren = descendants.filter((t) => t.parent_id === root.id);
  const archivedRoot = compactTask(root, directChildren);

  const archivedDescendants = descendants.map((desc) => {
    const children = descendants.filter((t) => t.parent_id === desc.id);
    return compactTask(desc, children);
  });

  return [archivedRoot, ...archivedDescendants];
}

/**
 * Remove archived tasks from the store and clean up blocking references.
 */
function removeArchivedTasks(
  allTasks: Task[],
  tasksToRemove: Task[],
): TaskStore {
  const idsToRemove = new Set(tasksToRemove.map((t) => t.id));
  const remainingTasks = allTasks.filter((t) => !idsToRemove.has(t.id));

  const updatedStore: TaskStore = { tasks: remainingTasks };
  for (const archivedId of idsToRemove) {
    cleanupTaskReferences(updatedStore, archivedId);
  }

  return updatedStore;
}

/**
 * Parse a duration string like "30d", "12w", "6m" into milliseconds.
 */
function parseDuration(duration: string): number | null {
  const match = duration.match(/^(\d+)([dwm])$/);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  switch (unit) {
    case "d":
      return value * MS_PER_DAY;
    case "w":
      return value * 7 * MS_PER_DAY;
    case "m":
      return value * 30 * MS_PER_DAY; // Approximate month
    default:
      return null;
  }
}

interface BulkArchiveOptions {
  olderThan?: string;
  archiveAllCompleted?: boolean;
  exceptIds?: string[];
  dryRun?: boolean;
}

/**
 * Bulk archive completed tasks based on criteria.
 */
async function bulkArchive(
  options: CliOptions,
  bulkOptions: BulkArchiveOptions,
): Promise<void> {
  const {
    olderThan,
    archiveAllCompleted,
    exceptIds = [],
    dryRun,
  } = bulkOptions;

  // Parse duration if provided
  let cutoffTime: number | undefined;
  if (olderThan) {
    const durationMs = parseDuration(olderThan);
    if (durationMs === null) {
      console.error(
        `${colors.red}Error:${colors.reset} Invalid duration format: ${olderThan}`,
      );
      console.error(`Expected format: 30d (days), 12w (weeks), 6m (months)`);
      process.exit(1);
    }
    cutoffTime = Date.now() - durationMs;
  }

  const store = await options.storage.readAsync();
  const allTasks = store.tasks;
  const exceptSet = new Set(exceptIds);

  // Find all archivable root tasks (completed tasks without incomplete ancestors)
  const archivableRoots: Task[] = [];

  for (const task of allTasks) {
    // Skip if in except list
    if (exceptSet.has(task.id)) continue;

    // Must be completed
    if (!task.completed) continue;

    // Check time filter
    if (cutoffTime && task.completed_at) {
      const completedAt = new Date(task.completed_at).getTime();
      if (completedAt > cutoffTime) continue;
    } else if (cutoffTime && !archiveAllCompleted) {
      // No completed_at timestamp - skip unless archiving all
      continue;
    }

    // Check if this is an archivable root (no incomplete ancestors, all descendants completed)
    const collected = collectArchivableTasks(task.id, allTasks);
    if (collected) {
      // Only archive root tasks (not tasks whose parent would also be archived)
      const parent = task.parent_id
        ? allTasks.find((t) => t.id === task.parent_id)
        : null;
      const parentWouldBeArchived =
        parent &&
        parent.completed &&
        !exceptSet.has(parent.id) &&
        collectArchivableTasks(parent.id, allTasks);

      if (!parentWouldBeArchived) {
        archivableRoots.push(task);
      }
    }
  }

  if (archivableRoots.length === 0) {
    console.log("No tasks found to archive.");
    return;
  }

  // Collect all tasks to archive (roots + descendants)
  const allToArchive: Task[] = [];
  const archivableCollections: Array<{ root: Task; descendants: Task[] }> = [];

  for (const root of archivableRoots) {
    const collected = collectArchivableTasks(root.id, allTasks)!;
    archivableCollections.push(collected);
    allToArchive.push(collected.root, ...collected.descendants);
  }

  // Show what would be archived
  const rootCount = archivableRoots.length;
  const totalCount = allToArchive.length;

  if (dryRun) {
    console.log(
      `${colors.cyan}Dry run:${colors.reset} Would archive ${colors.bold}${totalCount}${colors.reset} ${pluralize(totalCount, "task")} (${rootCount} root ${pluralize(rootCount, "task")}):\n`,
    );
    for (const root of archivableRoots.slice(0, 20)) {
      const collected = archivableCollections.find(
        (c) => c.root.id === root.id,
      );
      const childCount = collected?.descendants.length ?? 0;
      const childInfo = childCount > 0 ? ` (+${childCount} subtasks)` : "";
      console.log(`  ${root.id}: ${root.name}${childInfo}`);
    }
    if (archivableRoots.length > 20) {
      console.log(`  ... and ${archivableRoots.length - 20} more`);
    }
    return;
  }

  try {
    // Archive all collections
    const archiveStorage = new ArchiveStorage({
      path: options.storage.getIdentifier(),
    });

    const allArchivedTasks = archivableCollections.flatMap(compactCollection);
    archiveStorage.appendArchive(allArchivedTasks);

    // Remove from active tasks and clean up blocking references
    const updatedStore = removeArchivedTasks(allTasks, allToArchive);
    await options.storage.writeAsync(updatedStore);

    // Calculate and display size reduction
    const originalSize = JSON.stringify(allToArchive).length;
    const archivedSize = JSON.stringify(allArchivedTasks).length;
    const reduction = Math.round((1 - archivedSize / originalSize) * 100);

    console.log(
      `${colors.green}Archived${colors.reset} ${colors.bold}${totalCount}${colors.reset} ${pluralize(totalCount, "task")} (${rootCount} root ${pluralize(rootCount, "task")})`,
    );
    console.log(`  ${colors.dim}Size reduction:${colors.reset} ${reduction}%`);
  } catch (err) {
    console.error(formatCliError(err));
    process.exit(1);
  }
}

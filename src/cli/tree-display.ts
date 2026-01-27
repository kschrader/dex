import { Task } from "../types.js";
import { collectAncestors } from "../core/task-relationships.js";
import { colors } from "./colors.js";
import { formatTask, truncateText } from "./formatting.js";

export interface TreeDisplayOptions {
  /** Maximum length to truncate task names */
  truncateName?: number;
  /** Function to get blocker IDs for a task */
  getBlockedByIds?: (task: Task) => string[];
  /** Function to get GitHub issue for a task */
  getGithubIssue?: (task: Task) => number | undefined;
}

interface PrintContext {
  childrenMap: Map<string, Task[]>;
  printed: Set<string>;
  count: number;
  limit: number;
  options: TreeDisplayOptions;
}

/**
 * Build a map of parent ID to children that are in the section.
 */
export function buildChildrenMap(sectionTasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  for (const task of sectionTasks) {
    if (!task.parent_id) continue;

    const siblings = map.get(task.parent_id);
    if (siblings) {
      siblings.push(task);
    } else {
      map.set(task.parent_id, [task]);
    }
  }
  // Sort children by priority within each group
  for (const children of map.values()) {
    children.sort((a, b) => a.priority - b.priority);
  }
  return map;
}

/**
 * Calculate the continuation prefix for nested children.
 * Converts tree connectors to vertical lines or spaces for proper alignment.
 */
export function getContinuationPrefix(prefix: string): string {
  return prefix.replace(/├── $/, "│   ").replace(/└── $/, "    ");
}

/**
 * Print a task and recursively print its children that are in the section.
 */
function printTaskWithChildren(
  task: Task,
  ctx: PrintContext,
  prefix: string,
): void {
  if (ctx.count >= ctx.limit || ctx.printed.has(task.id)) return;

  const blockedByIds = ctx.options.getBlockedByIds?.(task) || [];
  const githubIssue = ctx.options.getGithubIssue?.(task);

  console.log(
    formatTask(task, {
      treePrefix: prefix,
      truncateName: ctx.options.truncateName,
      blockedByIds,
      githubIssue,
    }),
  );
  ctx.printed.add(task.id);
  ctx.count++;

  // Print children that are in the section
  const children = (ctx.childrenMap.get(task.id) || []).filter(
    (c) => !ctx.printed.has(c.id),
  );

  for (let i = 0; i < children.length && ctx.count < ctx.limit; i++) {
    const isLast = i === children.length - 1 || ctx.count + 1 >= ctx.limit;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = getContinuationPrefix(prefix) + connector;

    printTaskWithChildren(children[i], ctx, childPrefix);
  }
}

/**
 * Print tasks grouped by parent with tree connectors.
 * Tasks with children in the section show those children nested underneath.
 * Tasks whose parent is not in the section show a dimmed parent header.
 */
export function printGroupedTasks(
  sectionTasks: Task[],
  allTasks: Task[],
  limit: number,
  options: TreeDisplayOptions = {},
): void {
  const sectionTaskIds = new Set(sectionTasks.map((t) => t.id));
  const childrenMap = buildChildrenMap(sectionTasks);

  const ctx: PrintContext = {
    childrenMap,
    printed: new Set<string>(),
    count: 0,
    limit,
    options,
  };

  // Separate tasks into root tasks and orphans (tasks whose parent is not in section)
  const rootTasks: Task[] = [];
  const orphans: Task[] = [];

  for (const task of sectionTasks) {
    if (!task.parent_id) {
      rootTasks.push(task);
      continue;
    }
    if (sectionTaskIds.has(task.parent_id)) {
      // Tasks with parent in section will be printed as children
      continue;
    }
    // Parent exists but not in section - this is an orphan
    orphans.push(task);
  }

  // Sort root tasks by priority and print them
  rootTasks.sort((a, b) => a.priority - b.priority);
  for (const task of rootTasks) {
    if (ctx.count >= limit) break;
    printTaskWithChildren(task, ctx, "");
  }

  // Build task lookup map once
  const taskById = new Map(allTasks.map((t) => [t.id, t]));

  // Pre-compute ancestor chains for all orphans (avoids duplicate collectAncestors calls)
  const orphanAncestorChains = new Map<string, Task[]>();
  for (const orphan of orphans) {
    const ancestors = collectAncestors(allTasks, orphan.id);
    const orphanAncestors = ancestors.filter((a) => !sectionTaskIds.has(a.id));
    orphanAncestorChains.set(orphan.id, orphanAncestors);
  }

  // Group orphans by their root orphan ancestor (highest ancestor not in section)
  const orphansByRootAncestor = new Map<string, Task[]>();
  for (const orphan of orphans) {
    const orphanAncestors = orphanAncestorChains.get(orphan.id)!;
    const rootAncestorId =
      orphanAncestors.length > 0
        ? orphanAncestors[0].id
        : (orphan.parent_id as string);

    const group = orphansByRootAncestor.get(rootAncestorId);
    if (group) {
      group.push(orphan);
    } else {
      orphansByRootAncestor.set(rootAncestorId, [orphan]);
    }
  }

  // Print orphan groups with full dimmed ancestor chains
  for (const [rootAncestorId, groupOrphans] of orphansByRootAncestor) {
    if (ctx.count >= limit) break;

    groupOrphans.sort((a, b) => a.priority - b.priority);
    const remainingOrphans = groupOrphans.filter((o) => !ctx.printed.has(o.id));
    if (remainingOrphans.length === 0) continue;

    // Collect all unique orphan ancestor IDs for this group
    const orphanAncestorIds = new Set<string>();
    for (const orphan of remainingOrphans) {
      for (const ancestor of orphanAncestorChains.get(orphan.id)!) {
        orphanAncestorIds.add(ancestor.id);
      }
    }

    // Build children map: ancestor → children that are orphan ancestors or orphan tasks
    const orphanChildrenMap = buildOrphanChildrenMap(
      orphanAncestorIds,
      remainingOrphans,
      taskById,
    );

    printDimmedAncestorTree(
      rootAncestorId,
      orphanChildrenMap,
      remainingOrphans,
      taskById,
      ctx,
    );
  }
}

/**
 * Build a map from orphan ancestor ID to its children (other orphan ancestors or orphan tasks).
 */
function buildOrphanChildrenMap(
  orphanAncestorIds: Set<string>,
  orphanTasks: Task[],
  taskById: Map<string, Task>,
): Map<string, string[]> {
  const map = new Map<string, string[]>();

  for (const ancestorId of orphanAncestorIds) {
    const childAncestors = [...orphanAncestorIds].filter(
      (id) => taskById.get(id)?.parent_id === ancestorId,
    );
    const childOrphans = orphanTasks
      .filter((o) => o.parent_id === ancestorId)
      .map((o) => o.id);

    const children = [...childAncestors, ...childOrphans];
    if (children.length > 0) {
      map.set(ancestorId, children);
    }
  }

  return map;
}

/**
 * Recursively print a dimmed ancestor tree with proper tree connectors.
 */
function printDimmedAncestorTree(
  nodeId: string,
  orphanChildrenMap: Map<string, string[]>,
  orphanTasks: Task[],
  taskById: Map<string, Task>,
  ctx: PrintContext,
  prefix: string = "",
): void {
  if (ctx.count >= ctx.limit) return;

  const orphan = orphanTasks.find((o) => o.id === nodeId);
  if (orphan) {
    printTaskWithChildren(orphan, ctx, prefix);
    return;
  }

  const ancestor = taskById.get(nodeId);
  if (!ancestor) return;

  const truncateLength = ctx.options.truncateName ?? 50;
  const ancestorName = truncateText(ancestor.name, truncateLength);
  const ancestorIcon = ancestor.completed ? "[x]" : "[ ]";
  console.log(
    `${prefix}${colors.dim}${ancestorIcon} ${ancestor.id}: ${ancestorName}${colors.reset}`,
  );

  const children = orphanChildrenMap.get(nodeId) || [];
  const continuationPrefix = getContinuationPrefix(prefix);

  for (let i = 0; i < children.length && ctx.count < ctx.limit; i++) {
    const isLast = i === children.length - 1 || ctx.count + 1 >= ctx.limit;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = continuationPrefix + connector;

    printDimmedAncestorTree(
      children[i],
      orphanChildrenMap,
      orphanTasks,
      taskById,
      ctx,
      childPrefix,
    );
  }
}

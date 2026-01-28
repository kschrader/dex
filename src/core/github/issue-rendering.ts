import type { Task, CommitMetadata } from "../../types.js";
import type { EmbeddedSubtask, HierarchicalTask } from "./issue-parsing.js";
import { encodeMetadataValue, SUBTASKS_HEADER } from "./issue-parsing.js";

/** Common task fields needed for rendering metadata */
interface TaskLike {
  id: string;
  priority: number;
  completed: boolean;
  description: string;
  result: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  metadata: { commit?: CommitMetadata } | null;
}

/**
 * Create a compound subtask ID from parent ID and index.
 * @param parentId - The parent issue number
 * @param index - The local subtask index (1-based)
 * @returns The compound ID string
 */
export function createSubtaskId(parentId: string, index: number): string {
  return `${parentId}-${index}`;
}

/**
 * Render the metadata comments, description, and result sections for a task block.
 * @param task - The task to render metadata for
 * @param parentId - Optional parent ID for hierarchical tasks
 */
function renderTaskMetadataAndContent(
  task: TaskLike,
  parentId?: string | null,
): string[] {
  const lines: string[] = [];

  lines.push(`<!-- dex:subtask:id:${task.id} -->`);
  if (parentId) {
    lines.push(`<!-- dex:subtask:parent:${parentId} -->`);
  }
  lines.push(`<!-- dex:subtask:priority:${task.priority} -->`);
  lines.push(`<!-- dex:subtask:completed:${task.completed} -->`);
  lines.push(`<!-- dex:subtask:created_at:${task.created_at} -->`);
  lines.push(`<!-- dex:subtask:updated_at:${task.updated_at} -->`);
  lines.push(
    `<!-- dex:subtask:completed_at:${task.completed_at ?? "null"} -->`,
  );

  if (task.metadata?.commit) {
    const commit = task.metadata.commit;
    lines.push(`<!-- dex:subtask:commit_sha:${commit.sha} -->`);
    if (commit.message) {
      lines.push(
        `<!-- dex:subtask:commit_message:${encodeMetadataValue(commit.message)} -->`,
      );
    }
    if (commit.branch) {
      lines.push(`<!-- dex:subtask:commit_branch:${commit.branch} -->`);
    }
    if (commit.url) {
      lines.push(`<!-- dex:subtask:commit_url:${commit.url} -->`);
    }
    if (commit.timestamp) {
      lines.push(`<!-- dex:subtask:commit_timestamp:${commit.timestamp} -->`);
    }
  }

  lines.push("");

  if (task.description) {
    lines.push("### Description");
    lines.push(task.description);
    lines.push("");
  }

  if (task.result) {
    lines.push("### Result");
    lines.push(task.result);
    lines.push("");
  }

  return lines;
}

/**
 * Render a single task as a <details> block.
 * @param task - The task to render
 * @param options - Optional rendering options for hierarchy
 */
function renderTaskDetailsBlock(
  task: TaskLike & { name: string },
  options?: { depth?: number; parentId?: string | null },
): string {
  const statusIndicator = task.completed ? "✅ " : "";
  const treePrefix = options?.depth && options.depth > 0 ? "└─ " : "";

  return [
    "<details>",
    `<summary>${statusIndicator}${treePrefix}<b>${task.name}</b></summary>`,
    "",
    ...renderTaskMetadataAndContent(task, options?.parentId),
    "</details>",
  ].join("\n");
}

/**
 * Render an issue body with embedded subtasks.
 * @param context - The parent task context
 * @param subtasks - Array of subtasks to embed
 * @returns The rendered markdown body
 */
export function renderIssueBody(
  context: string,
  subtasks: EmbeddedSubtask[],
): string {
  if (subtasks.length === 0) {
    return context;
  }

  const subtaskBlocks = subtasks
    .map((subtask) => renderTaskDetailsBlock(subtask))
    .join("\n\n");

  return `${context}\n\n${SUBTASKS_HEADER}\n\n${subtaskBlocks}`;
}

/**
 * Render an issue body with hierarchical task tree and details.
 * Uses a merged format where each task is a <details> block with
 * tree characters for nested tasks to show hierarchy.
 * @param context - The root task context
 * @param descendants - All descendant tasks with hierarchy info
 * @returns The rendered markdown body
 */
export function renderHierarchicalIssueBody(
  context: string,
  descendants: HierarchicalTask[],
): string {
  if (descendants.length === 0) {
    return context;
  }

  const taskItems = descendants
    .map(({ task, depth, parentId }) =>
      renderTaskDetailsBlock(task, { depth, parentId }),
    )
    .join("\n\n");

  return `${context}\n\n## Tasks\n\n${taskItems}\n`;
}

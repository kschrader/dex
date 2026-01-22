import { Octokit } from "@octokit/rest";
import { StorageEngine } from "./storage-engine.js";
import { Task, TaskStore, TaskStatus } from "../types.js";
import { StorageError, DataCorruptionError } from "../errors.js";

export interface GitHubIssuesConfig {
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** GitHub personal access token */
  token: string;
  /** Label prefix for dex tasks (default: "dex") */
  labelPrefix?: string;
}

/**
 * Storage backend using GitHub Issues.
 *
 * Maps dex tasks to GitHub issues:
 * - id → issue.number (as string)
 * - description → issue.title
 * - context → issue.body
 * - result → comment with ## Result header
 * - status → issue.state + labels (dex:pending, dex:completed)
 * - priority → label (dex:priority-0, dex:priority-1, etc.)
 * - parent_id → sub-issues (if available)
 * - timestamps → issue created/updated/closed_at
 */
export class GitHubIssuesStorage implements StorageEngine {
  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private labelPrefix: string;

  constructor(config: GitHubIssuesConfig) {
    this.octokit = new Octokit({
      auth: config.token,
    });
    this.owner = config.owner;
    this.repo = config.repo;
    this.labelPrefix = config.labelPrefix || "dex";
  }

  /**
   * Synchronous read - not supported for GitHub Issues
   * @throws Always throws - use readAsync instead
   */
  read(): TaskStore {
    throw new StorageError(
      "GitHubIssuesStorage requires async operations. Use readAsync() instead.",
      undefined,
      "GitHub API requires async operations"
    );
  }

  /**
   * Read all tasks from GitHub Issues (async)
   */
  async readAsync(): Promise<TaskStore> {
    try {
      // Fetch all issues with dex label
      const { data: issues } = await this.octokit.issues.listForRepo({
        owner: this.owner,
        repo: this.repo,
        labels: this.labelPrefix,
        state: "all",
        per_page: 100,
      });

      const tasks: Task[] = [];

      for (const issue of issues) {
        // Skip pull requests
        if (issue.pull_request) {
          continue;
        }

        tasks.push(this.issueToTask(issue));
      }

      return { tasks };
    } catch (err) {
      const originalError = err instanceof Error ? err : undefined;
      throw new StorageError(
        `Failed to read from GitHub Issues (${this.owner}/${this.repo})`,
        originalError,
        "Check token permissions and repository access"
      );
    }
  }

  /**
   * Write tasks to GitHub Issues
   */
  async writeAsync(store: TaskStore): Promise<void> {
    try {
      // Fetch existing issues to determine what needs to be created/updated/deleted
      const { data: existingIssues } = await this.octokit.issues.listForRepo({
        owner: this.owner,
        repo: this.repo,
        labels: this.labelPrefix,
        state: "all",
        per_page: 100,
      });

      const existingIssueNumbers = new Set(
        existingIssues
          .filter((issue) => !issue.pull_request)
          .map((issue) => issue.number.toString())
      );
      const currentTaskIds = new Set(store.tasks.map((task) => task.id));

      // Create or update tasks
      for (const task of store.tasks) {
        if (existingIssueNumbers.has(task.id)) {
          // Update existing issue
          await this.updateIssue(task);
        } else {
          // Create new issue
          await this.createIssue(task);
        }
      }

      // Note: We don't automatically delete issues that are removed from the store
      // This is intentional - GitHub issues are valuable history even if removed from dex
    } catch (err) {
      const originalError = err instanceof Error ? err : undefined;
      throw new StorageError(
        `Failed to write to GitHub Issues (${this.owner}/${this.repo})`,
        originalError,
        "Check token permissions (needs repo scope)"
      );
    }
  }

  /**
   * Synchronous write - not supported for GitHub Issues
   * @throws Always throws - use writeAsync instead
   */
  write(store: TaskStore): void {
    throw new StorageError(
      "GitHubIssuesStorage requires async operations. Use writeAsync() instead.",
      undefined,
      "GitHub API requires async operations"
    );
  }

  /**
   * Get storage identifier
   */
  getIdentifier(): string {
    return `${this.owner}/${this.repo}`;
  }

  /**
   * GitHub Issues storage is async-only
   */
  isSync(): boolean {
    return false;
  }

  /**
   * Convert GitHub issue to dex task
   */
  private issueToTask(issue: any): Task {
    // Extract status from issue state and labels
    const status: TaskStatus =
      issue.state === "closed" ? "completed" : "pending";

    // Extract priority from labels
    const priorityLabel = issue.labels.find((label: any) =>
      typeof label === "string"
        ? label.startsWith(`${this.labelPrefix}:priority-`)
        : label.name?.startsWith(`${this.labelPrefix}:priority-`)
    );
    const priorityMatch = priorityLabel
      ? typeof priorityLabel === "string"
        ? priorityLabel.match(/priority-(\d+)/)
        : priorityLabel.name?.match(/priority-(\d+)/)
      : null;
    const priority = priorityMatch ? parseInt(priorityMatch[1], 10) : 1;

    // Extract result from comments (look for ## Result header)
    let result: string | null = null;
    // Note: Fetching comments would require an additional API call
    // For now, we'll leave result extraction as a future enhancement

    // Extract parent_id from issue body or custom field
    // For now, we'll set it to null and handle hierarchy later
    const parent_id: string | null = null;

    return {
      id: issue.number.toString(),
      parent_id,
      description: issue.title,
      context: issue.body || "",
      priority,
      status,
      result,
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      completed_at: issue.closed_at,
    };
  }

  /**
   * Create a new GitHub issue for a task
   */
  private async createIssue(task: Task): Promise<void> {
    const labels = [this.labelPrefix, `${this.labelPrefix}:priority-${task.priority}`];

    if (task.status === "completed") {
      labels.push(`${this.labelPrefix}:completed`);
    } else {
      labels.push(`${this.labelPrefix}:pending`);
    }

    const issueData: any = {
      owner: this.owner,
      repo: this.repo,
      title: task.description,
      body: task.context,
      labels,
    };

    // If task is completed, create it as closed
    if (task.status === "completed") {
      issueData.state = "closed";
    }

    const { data: issue } = await this.octokit.issues.create(issueData);

    // If there's a result, add it as a comment
    if (task.result) {
      await this.octokit.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: issue.number,
        body: `## Result\n\n${task.result}`,
      });
    }

    // Update the task ID to match the issue number
    task.id = issue.number.toString();
  }

  /**
   * Update an existing GitHub issue
   */
  private async updateIssue(task: Task): Promise<void> {
    const issueNumber = parseInt(task.id, 10);

    const labels = [this.labelPrefix, `${this.labelPrefix}:priority-${task.priority}`];

    if (task.status === "completed") {
      labels.push(`${this.labelPrefix}:completed`);
    } else {
      labels.push(`${this.labelPrefix}:pending`);
    }

    await this.octokit.issues.update({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      title: task.description,
      body: task.context,
      labels,
      state: task.status === "completed" ? "closed" : "open",
    });

    // TODO: Handle result updates (check if result comment exists, update or create)
  }
}

import { customAlphabet } from "nanoid";
import { StorageEngine } from "./storage-engine.js";
import { FileStorage } from "./storage.js";
import {
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  ListTasksInput,
} from "../types.js";
import { NotFoundError, ValidationError } from "../errors.js";

const generateId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 8);

export class TaskService {
  private storage: StorageEngine;

  constructor(storage?: StorageEngine | string) {
    // Accept either a StorageEngine instance or a path string for backward compatibility
    if (typeof storage === "string" || storage === undefined) {
      this.storage = new FileStorage(storage);
    } else {
      this.storage = storage;
    }
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const store = await this.storage.readAsync();
    const now = new Date().toISOString();

    let parentId: string | null = null;

    if (input.parent_id) {
      const parent = store.tasks.find((t) => t.id === input.parent_id);
      if (!parent) {
        throw new NotFoundError("Task", input.parent_id, "The specified parent task does not exist");
      }
      // Validate depth: maximum 3 levels (epic → task → subtask)
      const newDepth = this.getDepthFromParent(store.tasks, input.parent_id) + 1;
      if (newDepth > 3) {
        throw new ValidationError(
          "Cannot create subtask: maximum depth (3 levels) reached",
          "Tasks can only be nested 3 levels deep (epic → task → subtask)"
        );
      }
      parentId = input.parent_id;
    }

    const task: Task = {
      id: generateId(),
      parent_id: parentId,
      description: input.description,
      context: input.context,
      priority: input.priority ?? 1,
      completed: false,
      result: null,
      metadata: null,
      created_at: now,
      updated_at: now,
      completed_at: null,
    };

    store.tasks.push(task);
    await this.storage.writeAsync(store);

    return task;
  }

  async update(input: UpdateTaskInput): Promise<Task> {
    if (input.delete) {
      return await this.delete(input.id);
    }

    const store = await this.storage.readAsync();
    const index = store.tasks.findIndex((t) => t.id === input.id);

    if (index === -1) {
      throw new NotFoundError("Task", input.id);
    }

    const task = store.tasks[index];
    const now = new Date().toISOString();

    if (input.description !== undefined) task.description = input.description;
    if (input.context !== undefined) task.context = input.context;
    if (input.parent_id !== undefined) {
      if (input.parent_id !== null) {
        // Validate new parent exists and isn't self or descendant
        if (input.parent_id === input.id) {
          throw new ValidationError(
            "Task cannot be its own parent",
            "Choose a different task as the parent"
          );
        }
        const parent = store.tasks.find((t) => t.id === input.parent_id);
        if (!parent) {
          throw new NotFoundError("Task", input.parent_id, "The specified parent task does not exist");
        }
        // Check for cycles: new parent can't be a descendant
        if (this.isDescendant(store.tasks, input.parent_id, input.id)) {
          throw new ValidationError(
            "Cannot set parent: would create a cycle",
            "The selected parent is already a subtask of this task"
          );
        }
        // Validate depth: maximum 3 levels (epic → task → subtask)
        // Need to check that this task + its descendants won't exceed depth limit
        const newDepth = this.getDepthFromParent(store.tasks, input.parent_id) + 1;
        const maxDescendantDepth = this.getMaxDescendantDepth(store.tasks, input.id);
        if (newDepth + maxDescendantDepth > 3) {
          throw new ValidationError(
            "Cannot move task: would exceed maximum depth (3 levels)",
            "Tasks can only be nested 3 levels deep (epic → task → subtask)"
          );
        }
      }
      task.parent_id = input.parent_id;
    }
    if (input.priority !== undefined) task.priority = input.priority;
    if (input.completed !== undefined) {
      // Handle completed_at timestamp based on completion transition
      if (input.completed && !task.completed) {
        task.completed_at = now;
      } else if (!input.completed && task.completed) {
        task.completed_at = null;
      }
      task.completed = input.completed;
    }
    if (input.result !== undefined) task.result = input.result;
    if (input.metadata !== undefined) {
      task.metadata = input.metadata;
    }

    task.updated_at = now;
    store.tasks[index] = task;
    await this.storage.writeAsync(store);

    return task;
  }

  /**
   * Delete a task and all its descendants.
   * @param id The task ID to delete
   * @returns The deleted task
   * @throws NotFoundError if the task does not exist
   */
  async delete(id: string): Promise<Task> {
    const store = await this.storage.readAsync();
    const index = store.tasks.findIndex((t) => t.id === id);

    if (index === -1) {
      throw new NotFoundError("Task", id);
    }

    const deletedTask = store.tasks[index];

    // Cascade delete all descendants
    const toDelete = new Set<string>([id]);
    this.collectDescendants(store.tasks, id, toDelete);

    store.tasks = store.tasks.filter((t) => !toDelete.has(t.id));
    await this.storage.writeAsync(store);
    return deletedTask;
  }

  async getChildren(id: string): Promise<Task[]> {
    const store = await this.storage.readAsync();
    return store.tasks.filter((t) => t.parent_id === id);
  }

  private collectDescendants(tasks: Task[], parentId: string, result: Set<string>): void {
    for (const task of tasks) {
      if (task.parent_id === parentId && !result.has(task.id)) {
        result.add(task.id);
        this.collectDescendants(tasks, task.id, result);
      }
    }
  }

  private isDescendant(tasks: Task[], potentialDescendant: string, ancestorId: string): boolean {
    const task = tasks.find((t) => t.id === potentialDescendant);
    if (!task || !task.parent_id) return false;
    if (task.parent_id === ancestorId) return true;
    return this.isDescendant(tasks, task.parent_id, ancestorId);
  }

  /**
   * Get the ancestors of a task, from root to immediate parent.
   * Returns an empty array for root-level tasks.
   */
  async getAncestors(id: string): Promise<Task[]> {
    const store = await this.storage.readAsync();
    return this.collectAncestors(store.tasks, id);
  }

  private collectAncestors(tasks: Task[], id: string): Task[] {
    const task = tasks.find((t) => t.id === id);
    if (!task || !task.parent_id) return [];

    const parent = tasks.find((t) => t.id === task.parent_id);
    if (!parent) return [];

    // Recursively get ancestors of the parent, then append parent
    return [...this.collectAncestors(tasks, parent.id), parent];
  }

  /**
   * Get the nesting depth of a task.
   * 0 = root (epic), 1 = task under epic, 2 = subtask
   */
  async getDepth(id: string): Promise<number> {
    const ancestors = await this.getAncestors(id);
    return ancestors.length;
  }

  /**
   * Calculate depth from a parent ID (for validation during creation).
   * Returns the depth a new child would have if created under this parent.
   */
  private getDepthFromParent(tasks: Task[], parentId: string): number {
    const ancestors = this.collectAncestors(tasks, parentId);
    return ancestors.length + 1; // +1 because the new task will be one level below parent
  }

  /**
   * Get the maximum depth of descendants relative to a task.
   * Returns 0 if the task has no children, 1 if it has children but no grandchildren, etc.
   */
  private getMaxDescendantDepth(tasks: Task[], taskId: string): number {
    const children = tasks.filter((t) => t.parent_id === taskId);
    if (children.length === 0) return 0;
    return 1 + Math.max(...children.map((c) => this.getMaxDescendantDepth(tasks, c.id)));
  }

  async get(id: string): Promise<Task | null> {
    const store = await this.storage.readAsync();
    return store.tasks.find((t) => t.id === id) || null;
  }

  async list(input: ListTasksInput = {}): Promise<Task[]> {
    const store = await this.storage.readAsync();
    let tasks = store.tasks;

    if (!input.all) {
      // Default to showing non-completed (pending) tasks
      const completedFilter = input.completed ?? false;
      tasks = tasks.filter((t) => t.completed === completedFilter);
    }

    if (input.query) {
      const q = input.query.toLowerCase();
      tasks = tasks.filter(
        (t) =>
          t.description.toLowerCase().includes(q) ||
          t.context.toLowerCase().includes(q)
      );
    }

    return tasks.toSorted((a, b) => a.priority - b.priority);
  }

  async complete(id: string, result: string, metadata?: Task["metadata"]): Promise<Task> {
    const store = await this.storage.readAsync();

    // Collect all descendants, not just immediate children
    const descendants = new Set<string>();
    this.collectDescendants(store.tasks, id, descendants);

    const pendingDescendants = store.tasks.filter(
      (t) => descendants.has(t.id) && !t.completed
    );

    if (pendingDescendants.length > 0) {
      throw new ValidationError(
        `Cannot complete: ${pendingDescendants.length} subtask${pendingDescendants.length > 1 ? "s" : ""} still pending`,
        "Complete or delete all subtasks first"
      );
    }

    return await this.update({
      id,
      completed: true,
      result,
      metadata,
    });
  }

  getStoragePath(): string {
    return this.storage.getIdentifier();
  }
}

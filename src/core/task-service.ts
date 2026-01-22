import { customAlphabet } from "nanoid";
import { TaskStorage } from "./storage.js";
import {
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  ListTasksInput,
} from "../types.js";

const generateId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 8);

export class TaskService {
  private storage: TaskStorage;

  constructor(storagePath?: string) {
    this.storage = new TaskStorage(storagePath);
  }

  create(input: CreateTaskInput): Task {
    const store = this.storage.read();
    const now = new Date().toISOString();

    let parentId: string | null = null;
    let project = input.project || "default";

    if (input.parent_id) {
      const parent = store.tasks.find((t) => t.id === input.parent_id);
      if (!parent) {
        throw new Error(`Parent task ${input.parent_id} not found`);
      }
      parentId = input.parent_id;
      // Inherit project from parent if not explicitly set
      if (!input.project) {
        project = parent.project;
      }
    }

    const task: Task = {
      id: generateId(),
      parent_id: parentId,
      project,
      description: input.description,
      context: input.context,
      priority: input.priority ?? 1,
      status: "pending",
      result: null,
      created_at: now,
      updated_at: now,
    };

    store.tasks.push(task);
    this.storage.write(store);

    return task;
  }

  update(input: UpdateTaskInput): Task | null {
    const store = this.storage.read();
    const index = store.tasks.findIndex((t) => t.id === input.id);

    if (index === -1) {
      return null;
    }

    if (input.delete) {
      store.tasks.splice(index, 1);
      this.storage.write(store);
      return null;
    }

    const task = store.tasks[index];
    const now = new Date().toISOString();

    if (input.description !== undefined) task.description = input.description;
    if (input.context !== undefined) task.context = input.context;
    if (input.parent_id !== undefined) {
      if (input.parent_id !== null) {
        // Validate new parent exists and isn't self or descendant
        if (input.parent_id === input.id) {
          throw new Error("Task cannot be its own parent");
        }
        const parent = store.tasks.find((t) => t.id === input.parent_id);
        if (!parent) {
          throw new Error(`Parent task ${input.parent_id} not found`);
        }
        // Check for cycles: new parent can't be a descendant
        if (this.isDescendant(store.tasks, input.parent_id, input.id)) {
          throw new Error("Cannot set parent: would create a cycle");
        }
      }
      task.parent_id = input.parent_id;
    }
    if (input.project !== undefined) task.project = input.project;
    if (input.priority !== undefined) task.priority = input.priority;
    if (input.status !== undefined) task.status = input.status;
    if (input.result !== undefined) task.result = input.result;

    task.updated_at = now;
    store.tasks[index] = task;
    this.storage.write(store);

    return task;
  }

  delete(id: string): boolean {
    const store = this.storage.read();
    const index = store.tasks.findIndex((t) => t.id === id);

    if (index === -1) {
      return false;
    }

    // Cascade delete all descendants
    const toDelete = new Set<string>([id]);
    this.collectDescendants(store.tasks, id, toDelete);

    store.tasks = store.tasks.filter((t) => !toDelete.has(t.id));
    this.storage.write(store);
    return true;
  }

  getChildren(id: string): Task[] {
    const store = this.storage.read();
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

  get(id: string): Task | null {
    const store = this.storage.read();
    return store.tasks.find((t) => t.id === id) || null;
  }

  list(input: ListTasksInput = {}): Task[] {
    const store = this.storage.read();
    let tasks = store.tasks;

    if (!input.all) {
      const statusFilter = input.status ?? "pending";
      tasks = tasks.filter((t) => t.status === statusFilter);
    }

    if (input.project) {
      tasks = tasks.filter((t) => t.project === input.project);
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

  listProjects(): Array<{ project: string; pending: number; completed: number }> {
    const store = this.storage.read();
    const projectMap = new Map<string, { pending: number; completed: number }>();

    for (const task of store.tasks) {
      const counts = projectMap.get(task.project) || { pending: 0, completed: 0 };
      if (task.status === "pending") {
        counts.pending++;
      } else {
        counts.completed++;
      }
      projectMap.set(task.project, counts);
    }

    return Array.from(projectMap.entries()).map(([project, counts]) => ({
      project,
      ...counts,
    }));
  }

  complete(id: string, result: string): Task | null {
    const children = this.getChildren(id);
    const pendingChildren = children.filter((c) => c.status === "pending");

    if (pendingChildren.length > 0) {
      throw new Error(
        `Cannot complete: ${pendingChildren.length} subtask${pendingChildren.length > 1 ? "s" : ""} still pending`
      );
    }

    return this.update({
      id,
      status: "completed",
      result,
    });
  }

  getStoragePath(): string {
    return this.storage.getPath();
  }
}

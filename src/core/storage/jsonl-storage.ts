import * as fs from "node:fs";
import * as path from "node:path";
import { Task, TaskStore, TaskSchema } from "../../types.js";
import { DataCorruptionError, StorageError } from "../../errors.js";
import { StorageEngine } from "./engine.js";
import { getProjectKey } from "../project-key.js";
import { getDexHome, type StorageMode } from "../config.js";

function findGitRoot(startDir: string): string | null {
  let currentDir: string;
  try {
    currentDir = fs.realpathSync(startDir);
  } catch {
    // If path doesn't exist or is inaccessible, fall back to input
    currentDir = startDir;
  }

  while (currentDir !== path.dirname(currentDir)) {
    const gitPath = path.join(currentDir, ".git");
    try {
      // Check if .git exists (file for worktrees, directory for regular repos)
      fs.statSync(gitPath);
      return currentDir;
    } catch {
      // .git doesn't exist at this level, continue traversing
    }
    currentDir = path.dirname(currentDir);
  }
  return null;
}

function getDefaultStoragePath(mode: StorageMode = "in-repo"): string {
  if (mode === "centralized") {
    const projectKey = getProjectKey();
    return path.join(getDexHome(), "projects", projectKey);
  }

  // in-repo mode: use git root or dex home directory
  const gitRoot = findGitRoot(process.cwd());
  if (gitRoot) {
    return path.join(gitRoot, ".dex");
  }
  return path.join(getDexHome(), "local");
}

function getStoragePath(mode?: StorageMode): string {
  return process.env.DEX_STORAGE_PATH || getDefaultStoragePath(mode);
}

export interface JsonlStorageOptions {
  /** Explicit storage path (overrides mode) */
  path?: string;
  /** Storage mode: "in-repo" (default) or "centralized" */
  mode?: StorageMode;
}

export class JsonlStorage implements StorageEngine {
  private storagePath: string;

  constructor(options?: string | JsonlStorageOptions) {
    this.storagePath =
      typeof options === "string"
        ? options
        : (options?.path ?? getStoragePath(options?.mode));
  }

  private get tasksFile(): string {
    return path.join(this.storagePath, "tasks.jsonl");
  }

  private ensureDirectory(): void {
    fs.mkdirSync(this.storagePath, { recursive: true });
  }

  private sortTasksById(tasks: Task[]): void {
    tasks.sort((a, b) => a.id.localeCompare(b.id));
  }

  read(): TaskStore {
    if (!fs.existsSync(this.tasksFile)) {
      return { tasks: [] };
    }

    let content: string;
    try {
      content = fs.readFileSync(this.tasksFile, "utf-8");
    } catch (err) {
      const originalError = err instanceof Error ? err : undefined;
      throw new StorageError(
        `Failed to read tasks from "${this.tasksFile}"`,
        originalError,
        "Check file permissions",
      );
    }

    if (!content.trim()) {
      return { tasks: [] };
    }

    const tasks: Task[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      let data: unknown;
      try {
        data = JSON.parse(line);
      } catch (parseErr) {
        const errorMessage =
          parseErr instanceof Error ? parseErr.message : String(parseErr);
        throw new DataCorruptionError(
          this.tasksFile,
          parseErr instanceof Error ? parseErr : undefined,
          `Invalid JSON on line ${i + 1}: ${errorMessage}`,
        );
      }

      const result = TaskSchema.safeParse(data);
      if (!result.success) {
        throw new DataCorruptionError(
          this.tasksFile,
          undefined,
          `Invalid schema on line ${i + 1}: ${result.error.message}`,
        );
      }

      tasks.push(result.data);
    }

    this.sortTasksById(tasks);
    return { tasks };
  }

  write(store: TaskStore): void {
    this.ensureDirectory();

    const sortedTasks = [...store.tasks];
    this.sortTasksById(sortedTasks);

    const lines = sortedTasks.map((task) => JSON.stringify(task));
    const content = lines.join("\n") + (lines.length > 0 ? "\n" : "");

    const tempFile = `${this.tasksFile}.tmp`;
    try {
      fs.writeFileSync(tempFile, content, "utf-8");
      fs.renameSync(tempFile, this.tasksFile);
    } catch (err) {
      this.cleanupTempFile(tempFile);
      const originalError = err instanceof Error ? err : undefined;
      throw new StorageError(
        `Failed to write tasks to "${this.tasksFile}"`,
        originalError,
        "Check file permissions and available disk space",
      );
    }
  }

  private cleanupTempFile(tempFile: string): void {
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  getIdentifier(): string {
    return this.storagePath;
  }

  /**
   * Async read implementation (wraps synchronous read)
   */
  async readAsync(): Promise<TaskStore> {
    return this.read();
  }

  /**
   * Async write implementation (wraps synchronous write)
   */
  async writeAsync(store: TaskStore): Promise<void> {
    this.write(store);
  }

  /**
   * JSONL storage supports synchronous operations
   */
  isSync(): boolean {
    return true;
  }
}

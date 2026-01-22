import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import { TaskStore, TaskStoreSchema } from "../types.js";
import { DataCorruptionError, StorageError } from "../errors.js";

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

function getDefaultStoragePath(): string {
  const gitRoot = findGitRoot(process.cwd());
  if (gitRoot) {
    return path.join(gitRoot, ".dex", "tasks.json");
  }
  return path.join(os.homedir(), ".dex", "tasks.json");
}

export function getStoragePath(): string {
  return process.env.DEX_STORAGE_PATH || getDefaultStoragePath();
}

export class TaskStorage {
  private storagePath: string;

  constructor(storagePath?: string) {
    this.storagePath = storagePath || getStoragePath();
  }

  private ensureDirectory(): void {
    const dir = path.dirname(this.storagePath);
    // recursive: true handles existing directories gracefully (no TOCTOU race)
    fs.mkdirSync(dir, { recursive: true });
  }

  read(): TaskStore {
    let content: string;
    try {
      content = fs.readFileSync(this.storagePath, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { tasks: [] };
      }
      throw err;
    }

    // Handle empty files
    if (!content.trim()) {
      return { tasks: [] };
    }

    let data: unknown;
    try {
      data = JSON.parse(content);
    } catch (parseErr) {
      const errorMessage = parseErr instanceof Error ? parseErr.message : String(parseErr);
      throw new DataCorruptionError(
        this.storagePath,
        parseErr instanceof Error ? parseErr : undefined,
        `Invalid JSON: ${errorMessage}`
      );
    }

    const result = TaskStoreSchema.safeParse(data);
    if (!result.success) {
      throw new DataCorruptionError(
        this.storagePath,
        undefined,
        `Invalid schema: ${result.error.message}`
      );
    }

    return result.data;
  }

  write(store: TaskStore): void {
    this.ensureDirectory();
    const content = JSON.stringify(store, null, 2);

    // Atomic write: write to temp file, then rename
    const dir = path.dirname(this.storagePath);
    const tempPath = path.join(
      dir,
      `.tasks.${crypto.randomBytes(6).toString("hex")}.tmp`
    );

    try {
      fs.writeFileSync(tempPath, content, "utf-8");
      fs.renameSync(tempPath, this.storagePath);
    } catch (err) {
      // Clean up temp file on failure
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // Cleanup errors are acceptable to ignore - the main error is what matters
      }
      const originalError = err instanceof Error ? err : undefined;
      throw new StorageError(
        `Failed to write task data to "${this.storagePath}"`,
        originalError,
        "Check file permissions and available disk space"
      );
    }
  }

  getPath(): string {
    return this.storagePath;
  }
}

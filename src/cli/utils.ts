import { TaskService } from "../core/task-service.js";
import { StorageEngine } from "../core/storage/index.js";
import { GitHubSyncService } from "../core/github/index.js";
import { GitHubSyncConfig } from "../core/config.js";
import { Task } from "../types.js";
import { extractErrorInfo } from "../errors.js";
import * as readline from "readline";
import { colors } from "./colors.js";

export interface CliOptions {
  storage: StorageEngine;
  syncService?: GitHubSyncService | null;
  syncConfig?: GitHubSyncConfig | null;
}

// ASCII art banner for CLI headers
export const ASCII_BANNER = ` ____  _____ __ __
|    \\|   __|  |  |
|  |  |   __|-   -|
|____/|_____|__|__|`;

export function createService(options: CliOptions): TaskService {
  return new TaskService({
    storage: options.storage,
    syncService: options.syncService,
    syncConfig: options.syncConfig,
  });
}

/**
 * Exit with error if task is not found, showing a hint to list all tasks.
 * Returns the task (narrowed to non-null) if found.
 */
export async function exitIfTaskNotFound(
  task: Task | null,
  id: string,
  service: TaskService
): Promise<Task> {
  if (task) return task;
  console.error(
    `${colors.red}Error:${colors.reset} Task ${colors.bold}${id}${colors.reset} not found`
  );
  const allTasks = await service.list({ all: true });
  if (allTasks.length > 0) {
    console.error(
      `${colors.dim}Hint: Run "dex list --all" to see all tasks${colors.reset}`
    );
  }
  process.exit(1);
}

/**
 * Format an error for CLI output with proper coloring and suggestions.
 */
export function formatCliError(err: unknown): string {
  const { message, suggestion } = extractErrorInfo(err);
  let output = `${colors.red}Error:${colors.reset} ${message}`;
  if (suggestion) {
    output += `\n${colors.dim}Hint: ${suggestion}${colors.reset}`;
  }
  return output;
}

export function promptConfirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

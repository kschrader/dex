import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { getProjectKey } from "../project-key.js";

/**
 * Storage mode for file-based storage
 */
export type StorageMode = "in-repo" | "centralized";

/**
 * Get the dex home directory.
 * Priority: DEX_HOME env var > XDG_CONFIG_HOME/dex > ~/.config/dex
 * @returns Path to dex home directory
 */
export function getDexHome(): string {
  if (process.env.DEX_HOME) {
    return process.env.DEX_HOME;
  }
  const configDir =
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(configDir, "dex");
}

/**
 * Find the git root directory by traversing up from startDir.
 * Returns null if no git repository is found.
 */
export function findGitRoot(startDir: string): string | null {
  let currentDir: string;
  try {
    currentDir = fs.realpathSync(startDir);
  } catch {
    currentDir = startDir;
  }

  while (currentDir !== path.dirname(currentDir)) {
    const gitPath = path.join(currentDir, ".git");
    try {
      fs.statSync(gitPath);
      return currentDir;
    } catch {
      // .git doesn't exist at this level, continue traversing
    }
    currentDir = path.dirname(currentDir);
  }
  return null;
}

/**
 * Get the default storage path based on storage mode.
 */
export function getDefaultStoragePath(mode: StorageMode = "in-repo"): string {
  if (mode === "centralized") {
    const projectKey = getProjectKey();
    return path.join(getDexHome(), "projects", projectKey);
  }

  const gitRoot = findGitRoot(process.cwd());
  if (gitRoot) {
    return path.join(gitRoot, ".dex");
  }
  return path.join(getDexHome(), "local");
}

/**
 * Get the storage path, respecting DEX_STORAGE_PATH env var.
 */
export function getStoragePath(mode?: StorageMode): string {
  return process.env.DEX_STORAGE_PATH || getDefaultStoragePath(mode);
}

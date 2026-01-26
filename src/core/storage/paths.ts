import * as fs from "node:fs";
import * as path from "node:path";
import { getProjectKey } from "../project-key.js";
import { getDexHome, type StorageMode } from "../config.js";

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

import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Sync state tracking for auto-sync feature.
 * Stored in .dex/sync-state.json
 */
export interface SyncState {
  /** ISO timestamp of last successful sync */
  lastSync: string | null;
}

const SYNC_STATE_FILE = "sync-state.json";

/**
 * Get the path to the sync state file.
 */
function getSyncStatePath(storagePath: string): string {
  return path.join(storagePath, SYNC_STATE_FILE);
}

/**
 * Get sync state from .dex/sync-state.json
 * Returns default state if file doesn't exist.
 */
export function getSyncState(storagePath: string): SyncState {
  const filePath = getSyncStatePath(storagePath);

  if (!fs.existsSync(filePath)) {
    return { lastSync: null };
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);
    return {
      lastSync: parsed.lastSync ?? null,
    };
  } catch {
    return { lastSync: null };
  }
}

/**
 * Update sync state after successful sync.
 * Creates the file if it doesn't exist.
 */
export function updateSyncState(storagePath: string, state: Partial<SyncState>): void {
  const filePath = getSyncStatePath(storagePath);
  const current = getSyncState(storagePath);

  const updated: SyncState = {
    ...current,
    ...state,
  };

  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2) + "\n", "utf-8");
}

/**
 * Parse duration string to milliseconds.
 * Supports: "30s", "5m", "1h", "1d"
 * @returns milliseconds, or null if invalid format
 */
export function parseDuration(duration: string): number | null {
  const match = duration.match(/^(\d+)(s|m|h|d)$/);
  if (!match) {
    return null;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

/**
 * Check if sync is stale based on max_age.
 * Returns true if last sync exceeds max_age or if never synced.
 * Returns false if max_age is invalid.
 */
export function isSyncStale(storagePath: string, maxAge: string): boolean {
  const ms = parseDuration(maxAge);
  if (ms === null) {
    console.warn(`Invalid max_age format: "${maxAge}". Expected format: "30m", "1h", "1d"`);
    return false;
  }

  const state = getSyncState(storagePath);

  // Never synced = always stale
  if (!state.lastSync) {
    return true;
  }

  const lastSyncTime = new Date(state.lastSync).getTime();
  const now = Date.now();

  return now - lastSyncTime > ms;
}

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  getSyncState,
  updateSyncState,
  parseDuration,
  isSyncStale,
} from "./sync-state.js";

describe("sync-state", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dex-sync-state-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("parseDuration", () => {
    it("parses seconds", () => {
      expect(parseDuration("30s")).toBe(30 * 1000);
      expect(parseDuration("1s")).toBe(1000);
    });

    it("parses minutes", () => {
      expect(parseDuration("5m")).toBe(5 * 60 * 1000);
      expect(parseDuration("30m")).toBe(30 * 60 * 1000);
    });

    it("parses hours", () => {
      expect(parseDuration("1h")).toBe(60 * 60 * 1000);
      expect(parseDuration("24h")).toBe(24 * 60 * 60 * 1000);
    });

    it("parses days", () => {
      expect(parseDuration("1d")).toBe(24 * 60 * 60 * 1000);
      expect(parseDuration("7d")).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it("returns null for invalid format", () => {
      expect(parseDuration("")).toBeNull();
      expect(parseDuration("abc")).toBeNull();
      expect(parseDuration("10")).toBeNull();
      expect(parseDuration("10x")).toBeNull();
      expect(parseDuration("-5m")).toBeNull();
      expect(parseDuration("5.5h")).toBeNull();
    });
  });

  describe("getSyncState", () => {
    it("returns default state when file does not exist", () => {
      const state = getSyncState(tempDir);
      expect(state).toEqual({ lastSync: null });
    });

    it("reads existing state file", () => {
      const timestamp = "2025-01-25T10:30:00Z";
      fs.writeFileSync(
        path.join(tempDir, "sync-state.json"),
        JSON.stringify({ lastSync: timestamp })
      );

      const state = getSyncState(tempDir);
      expect(state.lastSync).toBe(timestamp);
    });

    it("returns default state for invalid JSON", () => {
      fs.writeFileSync(
        path.join(tempDir, "sync-state.json"),
        "not valid json"
      );

      const state = getSyncState(tempDir);
      expect(state).toEqual({ lastSync: null });
    });
  });

  describe("updateSyncState", () => {
    it("creates state file if it does not exist", () => {
      const timestamp = new Date().toISOString();
      updateSyncState(tempDir, { lastSync: timestamp });

      const content = fs.readFileSync(
        path.join(tempDir, "sync-state.json"),
        "utf-8"
      );
      const state = JSON.parse(content);
      expect(state.lastSync).toBe(timestamp);
    });

    it("updates existing state file", () => {
      const oldTimestamp = "2025-01-20T10:00:00Z";
      const newTimestamp = "2025-01-25T15:00:00Z";

      fs.writeFileSync(
        path.join(tempDir, "sync-state.json"),
        JSON.stringify({ lastSync: oldTimestamp })
      );

      updateSyncState(tempDir, { lastSync: newTimestamp });

      const state = getSyncState(tempDir);
      expect(state.lastSync).toBe(newTimestamp);
    });
  });

  describe("isSyncStale", () => {
    it("returns true when never synced", () => {
      expect(isSyncStale(tempDir, "1h")).toBe(true);
    });

    it("returns true when sync is older than max_age", () => {
      // Set lastSync to 2 hours ago
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      updateSyncState(tempDir, { lastSync: twoHoursAgo });

      expect(isSyncStale(tempDir, "1h")).toBe(true);
    });

    it("returns false when sync is newer than max_age", () => {
      // Set lastSync to 30 minutes ago
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      updateSyncState(tempDir, { lastSync: thirtyMinutesAgo });

      expect(isSyncStale(tempDir, "1h")).toBe(false);
    });

    it("returns false for invalid max_age format", () => {
      // Even with old sync, invalid format should return false
      const oldTimestamp = "2020-01-01T00:00:00Z";
      updateSyncState(tempDir, { lastSync: oldTimestamp });

      expect(isSyncStale(tempDir, "invalid")).toBe(false);
    });

    it("handles edge case at exactly max_age boundary", () => {
      // Set lastSync to just under 1 hour ago (accounts for test execution time)
      const justUnderOneHourAgo = new Date(Date.now() - 60 * 60 * 1000 + 100).toISOString();
      updateSyncState(tempDir, { lastSync: justUnderOneHourAgo });

      // At the boundary, we use > not >=, so exactly at the boundary is NOT stale
      expect(isSyncStale(tempDir, "1h")).toBe(false);
    });
  });
});

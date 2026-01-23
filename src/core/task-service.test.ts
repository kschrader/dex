import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { TaskService } from "./task-service.js";
import { FileStorage } from "./storage.js";
import { ValidationError } from "../errors.js";

describe("TaskService", () => {
  let service: TaskService;
  let tempDir: string;
  let cleanup: () => void;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dex-test-"));
    const storage = new FileStorage(tempDir);
    service = new TaskService(storage);
    cleanup = () => fs.rmSync(tempDir, { recursive: true, force: true });
  });

  afterEach(() => {
    cleanup();
  });

  describe("getAncestors", () => {
    it("returns empty array for root task", async () => {
      const task = await service.create({
        description: "Root task",
        context: "Context",
      });

      const ancestors = await service.getAncestors(task.id);
      expect(ancestors).toEqual([]);
    });

    it("returns parent for first-level child", async () => {
      const parent = await service.create({
        description: "Parent",
        context: "Context",
      });
      const child = await service.create({
        description: "Child",
        context: "Context",
        parent_id: parent.id,
      });

      const ancestors = await service.getAncestors(child.id);
      expect(ancestors).toHaveLength(1);
      expect(ancestors[0].id).toBe(parent.id);
    });

    it("returns ancestors from root to immediate parent", async () => {
      const epic = await service.create({
        description: "Epic",
        context: "Context",
      });
      const task = await service.create({
        description: "Task",
        context: "Context",
        parent_id: epic.id,
      });
      const subtask = await service.create({
        description: "Subtask",
        context: "Context",
        parent_id: task.id,
      });

      const ancestors = await service.getAncestors(subtask.id);
      expect(ancestors).toHaveLength(2);
      expect(ancestors[0].id).toBe(epic.id);
      expect(ancestors[1].id).toBe(task.id);
    });
  });

  describe("getDepth", () => {
    it("returns 0 for root task", async () => {
      const task = await service.create({
        description: "Root",
        context: "Context",
      });

      const depth = await service.getDepth(task.id);
      expect(depth).toBe(0);
    });

    it("returns 1 for task under epic", async () => {
      const epic = await service.create({
        description: "Epic",
        context: "Context",
      });
      const task = await service.create({
        description: "Task",
        context: "Context",
        parent_id: epic.id,
      });

      const depth = await service.getDepth(task.id);
      expect(depth).toBe(1);
    });

    it("returns 2 for subtask", async () => {
      const epic = await service.create({
        description: "Epic",
        context: "Context",
      });
      const task = await service.create({
        description: "Task",
        context: "Context",
        parent_id: epic.id,
      });
      const subtask = await service.create({
        description: "Subtask",
        context: "Context",
        parent_id: task.id,
      });

      const depth = await service.getDepth(subtask.id);
      expect(depth).toBe(2);
    });
  });

  describe("depth validation", () => {
    it("allows creating 3-level hierarchy", async () => {
      const epic = await service.create({
        description: "Epic",
        context: "Context",
      });
      const task = await service.create({
        description: "Task",
        context: "Context",
        parent_id: epic.id,
      });
      const subtask = await service.create({
        description: "Subtask",
        context: "Context",
        parent_id: task.id,
      });

      expect(subtask.parent_id).toBe(task.id);
    });

    it("rejects creating child of subtask (4th level)", async () => {
      const epic = await service.create({
        description: "Epic",
        context: "Context",
      });
      const task = await service.create({
        description: "Task",
        context: "Context",
        parent_id: epic.id,
      });
      const subtask = await service.create({
        description: "Subtask",
        context: "Context",
        parent_id: task.id,
      });

      await expect(
        service.create({
          description: "Too deep",
          context: "Context",
          parent_id: subtask.id,
        })
      ).rejects.toThrow(ValidationError);

      await expect(
        service.create({
          description: "Too deep",
          context: "Context",
          parent_id: subtask.id,
        })
      ).rejects.toThrow("maximum depth");
    });

    it("rejects moving task to exceed depth limit", async () => {
      // Create a task with a subtask
      const task = await service.create({
        description: "Task with subtask",
        context: "Context",
      });
      const subtask = await service.create({
        description: "Subtask",
        context: "Context",
        parent_id: task.id,
      });

      // Create an epic with a task
      const epic = await service.create({
        description: "Epic",
        context: "Context",
      });
      const epicTask = await service.create({
        description: "Epic task",
        context: "Context",
        parent_id: epic.id,
      });

      // Try to move "task with subtask" under epicTask
      // This would make subtask at depth 4 (epic -> epicTask -> task -> subtask)
      await expect(
        service.update({
          id: task.id,
          parent_id: epicTask.id,
        })
      ).rejects.toThrow("maximum depth");
    });
  });
});

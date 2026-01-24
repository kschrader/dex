import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { TaskService } from "../src/core/task-service.js";

describe("TaskService", () => {
  let tempDir: string;
  let storagePath: string;
  let service: TaskService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dex-test-"));
    storagePath = path.join(tempDir, ".dex");
    service = new TaskService(storagePath);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("create", () => {
    it("creates a task with required fields", async () => {
      const task = await service.create({
        description: "Test task",
        context: "Test context",
      });

      expect(task.id).toBeDefined();
      expect(task.description).toBe("Test task");
      expect(task.context).toBe("Test context");
      expect(task.completed).toBe(false);
      expect(task.priority).toBe(1);
      expect(task.parent_id).toBeNull();
      expect(task.result).toBeNull();
    });

    it("creates a task with custom priority", async () => {
      const task = await service.create({
        description: "Test task",
        context: "Test context",
        priority: 5,
      });

      expect(task.priority).toBe(5);
    });

    it("creates a child task with parent_id", async () => {
      const parent = await service.create({
        description: "Parent task",
        context: "Parent context",
      });

      const child = await service.create({
        description: "Child task",
        context: "Child context",
        parent_id: parent.id,
      });

      expect(child.parent_id).toBe(parent.id);
    });

    it("throws when parent task does not exist", async () => {
      await expect(async () =>
        await service.create({
          description: "Orphan task",
          context: "Context",
          parent_id: "nonexistent",
        })
      ).rejects.toThrow('Task "nonexistent" not found');
    });
  });

  describe("get", () => {
    it("returns task by id", async () => {
      const created = await service.create({
        description: "Test",
        context: "Context",
      });

      const retrieved = await service.get(created.id);
      expect(retrieved).toEqual(created);
    });

    it("returns null for nonexistent task", async () => {
      const result = await service.get("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("update", () => {
    it("updates task description", async () => {
      const task = await service.create({
        description: "Original",
        context: "Context",
      });

      const updated = await service.update({
        id: task.id,
        description: "Updated",
      });

      expect(updated.description).toBe("Updated");
      expect(updated.context).toBe("Context");
    });

    it("updates multiple fields", async () => {
      const task = await service.create({
        description: "Test",
        context: "Context",
      });

      const updated = await service.update({
        id: task.id,
        description: "New description",
        context: "New context",
        priority: 10,
      });

      expect(updated.description).toBe("New description");
      expect(updated.context).toBe("New context");
      expect(updated.priority).toBe(10);
    });

    it("throws when task does not exist", async () => {
      await expect(async () =>
        await service.update({
          id: "nonexistent",
          description: "Updated",
        })
      ).rejects.toThrow('Task "nonexistent" not found');
    });

    it("deletes task via update with delete flag", async () => {
      const task = await service.create({
        description: "To delete",
        context: "Context",
      });

      const deleted = await service.update({
        id: task.id,
        delete: true,
      });

      expect(deleted.id).toBe(task.id);
      expect(await service.get(task.id)).toBeNull();
    });

    it("updates parent_id", async () => {
      const parent = await service.create({
        description: "Parent",
        context: "Context",
      });
      const task = await service.create({
        description: "Task",
        context: "Context",
      });

      const updated = await service.update({
        id: task.id,
        parent_id: parent.id,
      });

      expect(updated.parent_id).toBe(parent.id);
    });

    it("removes parent_id by setting to null", async () => {
      const parent = await service.create({
        description: "Parent",
        context: "Context",
      });
      const child = await service.create({
        description: "Child",
        context: "Context",
        parent_id: parent.id,
      });

      const updated = await service.update({
        id: child.id,
        parent_id: null,
      });

      expect(updated.parent_id).toBeNull();
    });

    it("throws when setting parent to self", async () => {
      const task = await service.create({
        description: "Task",
        context: "Context",
      });

      await expect(async () =>
        await service.update({
          id: task.id,
          parent_id: task.id,
        })
      ).rejects.toThrow("Task cannot be its own parent");
    });

    it("throws when parent would create cycle", async () => {
      const grandparent = await service.create({
        description: "Grandparent",
        context: "Context",
      });
      const parent = await service.create({
        description: "Parent",
        context: "Context",
        parent_id: grandparent.id,
      });
      const child = await service.create({
        description: "Child",
        context: "Context",
        parent_id: parent.id,
      });

      // Try to make grandparent a child of its descendant
      await expect(async () =>
        await service.update({
          id: grandparent.id,
          parent_id: child.id,
        })
      ).rejects.toThrow("Cannot set parent: would create a cycle");
    });

    it("throws when new parent does not exist", async () => {
      const task = await service.create({
        description: "Task",
        context: "Context",
      });

      await expect(async () =>
        await service.update({
          id: task.id,
          parent_id: "nonexistent",
        })
      ).rejects.toThrow('Task "nonexistent" not found');
    });
  });

  describe("delete", () => {
    it("deletes a task and returns it", async () => {
      const task = await service.create({
        description: "Test",
        context: "Context",
      });

      const deletedTask = await service.delete(task.id);
      expect(deletedTask.id).toBe(task.id);
      expect(deletedTask.description).toBe("Test");
      expect(await service.get(task.id)).toBeNull();
    });

    it("throws for nonexistent task", async () => {
      await expect(async () => await service.delete("nonexistent")).rejects.toThrow(
        'Task "nonexistent" not found'
      );
    });

    it("cascade deletes all descendants", async () => {
      const parent = await service.create({
        description: "Parent",
        context: "Context",
      });
      const child = await service.create({
        description: "Child",
        context: "Context",
        parent_id: parent.id,
      });
      const grandchild = await service.create({
        description: "Grandchild",
        context: "Context",
        parent_id: child.id,
      });

      await service.delete(parent.id);

      expect(await service.get(parent.id)).toBeNull();
      expect(await service.get(child.id)).toBeNull();
      expect(await service.get(grandchild.id)).toBeNull();
    });

    it("only deletes descendants, not siblings", async () => {
      const parent = await service.create({
        description: "Parent",
        context: "Context",
      });
      const child1 = await service.create({
        description: "Child 1",
        context: "Context",
        parent_id: parent.id,
      });
      const child2 = await service.create({
        description: "Child 2",
        context: "Context",
        parent_id: parent.id,
      });

      await service.delete(child1.id);

      expect(await service.get(child1.id)).toBeNull();
      expect(await service.get(child2.id)).not.toBeNull();
      expect(await service.get(parent.id)).not.toBeNull();
    });
  });

  describe("getChildren", () => {
    it("returns immediate children only", async () => {
      const parent = await service.create({
        description: "Parent",
        context: "Context",
      });
      const child1 = await service.create({
        description: "Child 1",
        context: "Context",
        parent_id: parent.id,
      });
      const child2 = await service.create({
        description: "Child 2",
        context: "Context",
        parent_id: parent.id,
      });
      await service.create({
        description: "Grandchild",
        context: "Context",
        parent_id: child1.id,
      });

      const children = await service.getChildren(parent.id);
      expect(children).toHaveLength(2);
      expect(children.map((c) => c.id)).toContain(child1.id);
      expect(children.map((c) => c.id)).toContain(child2.id);
    });

    it("returns empty array for task with no children", async () => {
      const task = await service.create({
        description: "Task",
        context: "Context",
      });

      const children = await service.getChildren(task.id);
      expect(children).toEqual([]);
    });
  });

  describe("list", () => {
    it("returns pending tasks by default", async () => {
      const pending = await service.create({
        description: "Pending",
        context: "Context",
      });
      const toComplete = await service.create({
        description: "Completed",
        context: "Context",
      });
      await service.update({
        id: toComplete.id,
        completed: true,
      });

      const tasks = await service.list();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe(pending.id);
    });

    it("filters by completed", async () => {
      await service.create({ description: "Pending", context: "Context" });
      const completed = await service.create({
        description: "Completed",
        context: "Context",
      });
      await service.update({ id: completed.id, completed: true });

      const tasks = await service.list({ completed: true });
      expect(tasks).toHaveLength(1);
      expect(tasks[0].completed).toBe(true);
    });

    it("returns all tasks when all flag is true", async () => {
      await service.create({ description: "Pending", context: "Context" });
      const completed = await service.create({
        description: "Completed",
        context: "Context",
      });
      await service.update({ id: completed.id, completed: true });

      const tasks = await service.list({ all: true });
      expect(tasks).toHaveLength(2);
    });

    it("filters by query in description", async () => {
      await service.create({
        description: "Fix the bug",
        context: "Context",
      });
      await service.create({
        description: "Add feature",
        context: "Context",
      });

      const tasks = await service.list({ query: "bug" });
      expect(tasks).toHaveLength(1);
      expect(tasks[0].description).toBe("Fix the bug");
    });

    it("filters by query in context", async () => {
      await service.create({
        description: "Task 1",
        context: "Related to authentication",
      });
      await service.create({
        description: "Task 2",
        context: "Related to UI",
      });

      const tasks = await service.list({ query: "authentication" });
      expect(tasks).toHaveLength(1);
      expect(tasks[0].description).toBe("Task 1");
    });

    it("sorts by priority ascending", async () => {
      await service.create({
        description: "Low priority",
        context: "Context",
        priority: 10,
      });
      await service.create({
        description: "High priority",
        context: "Context",
        priority: 1,
      });
      await service.create({
        description: "Medium priority",
        context: "Context",
        priority: 5,
      });

      const tasks = await service.list();
      expect(tasks[0].description).toBe("High priority");
      expect(tasks[1].description).toBe("Medium priority");
      expect(tasks[2].description).toBe("Low priority");
    });

    it("returns empty array when no tasks match", async () => {
      const tasks = await service.list();
      expect(tasks).toEqual([]);
    });
  });

  describe("complete", () => {
    it("marks task as completed with result", async () => {
      const task = await service.create({
        description: "Test",
        context: "Context",
      });

      const completed = await service.complete(task.id, "Done successfully");

      expect(completed.completed).toBe(true);
      expect(completed.result).toBe("Done successfully");
    });

    it("throws when task has pending children", async () => {
      const parent = await service.create({
        description: "Parent",
        context: "Context",
      });
      await service.create({
        description: "Child",
        context: "Context",
        parent_id: parent.id,
      });

      await expect(async () => await service.complete(parent.id, "Done")).rejects.toThrow(
        "Cannot complete: 1 subtask still pending"
      );
    });

    it("throws when task has multiple pending children", async () => {
      const parent = await service.create({
        description: "Parent",
        context: "Context",
      });
      await service.create({
        description: "Child 1",
        context: "Context",
        parent_id: parent.id,
      });
      await service.create({
        description: "Child 2",
        context: "Context",
        parent_id: parent.id,
      });

      await expect(async () => await service.complete(parent.id, "Done")).rejects.toThrow(
        "Cannot complete: 2 subtasks still pending"
      );
    });

    it("throws when task has pending grandchildren", async () => {
      const grandparent = await service.create({
        description: "Grandparent",
        context: "Context",
      });
      const parent = await service.create({
        description: "Parent",
        context: "Context",
        parent_id: grandparent.id,
      });
      await service.update({ id: parent.id, completed: true });

      await service.create({
        description: "Grandchild",
        context: "Context",
        parent_id: parent.id,
      });

      await expect(async () => await service.complete(grandparent.id, "Done")).rejects.toThrow(
        "Cannot complete: 1 subtask still pending"
      );
    });

    it("allows completion when all descendants are completed", async () => {
      const parent = await service.create({
        description: "Parent",
        context: "Context",
      });
      const child = await service.create({
        description: "Child",
        context: "Context",
        parent_id: parent.id,
      });
      await service.update({ id: child.id, completed: true });

      const completed = await service.complete(parent.id, "Done");
      expect(completed.completed).toBe(true);
    });
  });

  describe("getStoragePath", () => {
    it("returns the storage path", () => {
      expect(service.getStoragePath()).toBe(storagePath);
    });
  });
});

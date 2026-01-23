import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Task } from "../types.js";
import {
  createMcpTestContext,
  parseToolResponse,
  isErrorResult,
  McpTestContext,
} from "./test-helpers.js";

describe("MCP Server", () => {
  let ctx: McpTestContext;

  beforeEach(async () => {
    ctx = await createMcpTestContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe("listTools", () => {
    it("exposes all 3 tools", async () => {
      const result = await ctx.client.listTools();

      expect(result.tools).toHaveLength(3);

      const toolNames = result.tools.map((t) => t.name).sort();
      expect(toolNames).toEqual(["create_task", "list_tasks", "update_task"]);
    });

    it("each tool has description and input schema", async () => {
      const result = await ctx.client.listTools();

      for (const tool of result.tools) {
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
      }
    });
  });

  describe("create_task", () => {
    it("creates a task with required fields", async () => {
      const result = await ctx.client.callTool({
        name: "create_task",
        arguments: {
          description: "Test task",
          context: "Test context for the task",
        },
      });

      const task = parseToolResponse<Task>(result);

      expect(task.id).toBeDefined();
      expect(task.description).toBe("Test task");
      expect(task.context).toBe("Test context for the task");
      expect(task.status).toBe("pending");
      expect(task.priority).toBe(1);
      expect(task.parent_id).toBeNull();
    });

    it("creates a task with optional priority", async () => {
      const result = await ctx.client.callTool({
        name: "create_task",
        arguments: {
          description: "High priority task",
          context: "Urgent work",
          priority: 5,
        },
      });

      const task = parseToolResponse<Task>(result);
      expect(task.priority).toBe(5);
    });

    it("creates a subtask with parent_id", async () => {
      // Create parent task
      const parentResult = await ctx.client.callTool({
        name: "create_task",
        arguments: {
          description: "Parent task",
          context: "Parent context",
        },
      });
      const parent = parseToolResponse<Task>(parentResult);

      // Create subtask
      const subtaskResult = await ctx.client.callTool({
        name: "create_task",
        arguments: {
          description: "Subtask",
          context: "Subtask context",
          parent_id: parent.id,
        },
      });
      const subtask = parseToolResponse<Task>(subtaskResult);

      expect(subtask.parent_id).toBe(parent.id);
    });

    it("returns validation error for missing description", async () => {
      const result = await ctx.client.callTool({
        name: "create_task",
        arguments: {
          context: "Only context, no description",
        },
      });

      expect(isErrorResult(result)).toBe(true);
    });

    it("returns validation error for missing context", async () => {
      const result = await ctx.client.callTool({
        name: "create_task",
        arguments: {
          description: "Only description, no context",
        },
      });

      expect(isErrorResult(result)).toBe(true);
    });

    it("returns error for non-existent parent_id", async () => {
      const result = await ctx.client.callTool({
        name: "create_task",
        arguments: {
          description: "Orphan subtask",
          context: "Context",
          parent_id: "nonexistent123",
        },
      });

      expect(isErrorResult(result)).toBe(true);
      const response = parseToolResponse<{ error: string }>(result);
      expect(response.error).toContain("not found");
    });
  });

  describe("list_tasks", () => {
    it("returns empty list when no tasks exist", async () => {
      const result = await ctx.client.callTool({
        name: "list_tasks",
        arguments: {},
      });

      const tasks = parseToolResponse<Task[]>(result);
      expect(tasks).toEqual([]);
    });

    it("returns pending tasks by default", async () => {
      // Create a pending and a completed task
      await ctx.client.callTool({
        name: "create_task",
        arguments: { description: "Pending task", context: "Context" },
      });

      const createResult = await ctx.client.callTool({
        name: "create_task",
        arguments: { description: "To be completed", context: "Context" },
      });
      const toComplete = parseToolResponse<Task>(createResult);

      await ctx.client.callTool({
        name: "update_task",
        arguments: { id: toComplete.id, status: "completed", result: "Done" },
      });

      // List without filters (should only show pending)
      const result = await ctx.client.callTool({
        name: "list_tasks",
        arguments: {},
      });

      const tasks = parseToolResponse<Task[]>(result);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].description).toBe("Pending task");
    });

    it("filters by status", async () => {
      // Create tasks
      const createResult = await ctx.client.callTool({
        name: "create_task",
        arguments: { description: "Task to complete", context: "Context" },
      });
      const task = parseToolResponse<Task>(createResult);

      await ctx.client.callTool({
        name: "update_task",
        arguments: { id: task.id, status: "completed", result: "Done" },
      });

      // Filter by completed status
      const result = await ctx.client.callTool({
        name: "list_tasks",
        arguments: { status: "completed" },
      });

      const tasks = parseToolResponse<Task[]>(result);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].status).toBe("completed");
    });

    it("returns all tasks with all flag", async () => {
      // Create one pending and one completed
      const createResult = await ctx.client.callTool({
        name: "create_task",
        arguments: { description: "Pending", context: "Context" },
      });
      const pending = parseToolResponse<Task>(createResult);

      const createResult2 = await ctx.client.callTool({
        name: "create_task",
        arguments: { description: "Completed", context: "Context" },
      });
      const toComplete = parseToolResponse<Task>(createResult2);

      await ctx.client.callTool({
        name: "update_task",
        arguments: { id: toComplete.id, status: "completed", result: "Done" },
      });

      // List all
      const result = await ctx.client.callTool({
        name: "list_tasks",
        arguments: { all: true },
      });

      const tasks = parseToolResponse<Task[]>(result);
      expect(tasks).toHaveLength(2);
    });

    it("searches by query", async () => {
      await ctx.client.callTool({
        name: "create_task",
        arguments: { description: "Fix authentication bug", context: "Auth context" },
      });
      await ctx.client.callTool({
        name: "create_task",
        arguments: { description: "Add new feature", context: "Feature context" },
      });

      const result = await ctx.client.callTool({
        name: "list_tasks",
        arguments: { query: "authentication" },
      });

      const tasks = parseToolResponse<Task[]>(result);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].description).toContain("authentication");
    });
  });

  describe("update_task", () => {
    it("updates task description", async () => {
      const createResult = await ctx.client.callTool({
        name: "create_task",
        arguments: { description: "Original", context: "Context" },
      });
      const task = parseToolResponse<Task>(createResult);

      const updateResult = await ctx.client.callTool({
        name: "update_task",
        arguments: { id: task.id, description: "Updated" },
      });

      const updated = parseToolResponse<Task>(updateResult);
      expect(updated.description).toBe("Updated");
    });

    it("updates task context", async () => {
      const createResult = await ctx.client.callTool({
        name: "create_task",
        arguments: { description: "Task", context: "Original context" },
      });
      const task = parseToolResponse<Task>(createResult);

      const updateResult = await ctx.client.callTool({
        name: "update_task",
        arguments: { id: task.id, context: "Updated context" },
      });

      const updated = parseToolResponse<Task>(updateResult);
      expect(updated.context).toBe("Updated context");
    });

    it("updates task priority", async () => {
      const createResult = await ctx.client.callTool({
        name: "create_task",
        arguments: { description: "Task", context: "Context" },
      });
      const task = parseToolResponse<Task>(createResult);

      const updateResult = await ctx.client.callTool({
        name: "update_task",
        arguments: { id: task.id, priority: 10 },
      });

      const updated = parseToolResponse<Task>(updateResult);
      expect(updated.priority).toBe(10);
    });

    it("completes a task with result", async () => {
      const createResult = await ctx.client.callTool({
        name: "create_task",
        arguments: { description: "Task to complete", context: "Context" },
      });
      const task = parseToolResponse<Task>(createResult);

      const updateResult = await ctx.client.callTool({
        name: "update_task",
        arguments: {
          id: task.id,
          status: "completed",
          result: "Task completed successfully with these changes...",
        },
      });

      const completed = parseToolResponse<Task>(updateResult);
      expect(completed.status).toBe("completed");
      expect(completed.result).toBe("Task completed successfully with these changes...");
      expect(completed.completed_at).toBeTruthy();
    });

    it("deletes a task", async () => {
      const createResult = await ctx.client.callTool({
        name: "create_task",
        arguments: { description: "Task to delete", context: "Context" },
      });
      const task = parseToolResponse<Task>(createResult);

      const deleteResult = await ctx.client.callTool({
        name: "update_task",
        arguments: { id: task.id, delete: true },
      });

      const response = parseToolResponse<{ deleted: boolean; id: string }>(deleteResult);
      expect(response.deleted).toBe(true);
      expect(response.id).toBe(task.id);

      // Verify task is gone
      const listResult = await ctx.client.callTool({
        name: "list_tasks",
        arguments: { all: true },
      });
      const tasks = parseToolResponse<Task[]>(listResult);
      expect(tasks).toHaveLength(0);
    });

    it("returns error for non-existent task", async () => {
      const result = await ctx.client.callTool({
        name: "update_task",
        arguments: { id: "nonexistent123", description: "New description" },
      });

      expect(isErrorResult(result)).toBe(true);
      const response = parseToolResponse<{ error: string }>(result);
      expect(response.error).toContain("not found");
    });

    it("returns validation error for missing id", async () => {
      const result = await ctx.client.callTool({
        name: "update_task",
        arguments: { description: "No ID provided" },
      });

      expect(isErrorResult(result)).toBe(true);
    });

    it("updates parent_id to create subtask relationship", async () => {
      const parentResult = await ctx.client.callTool({
        name: "create_task",
        arguments: { description: "Parent", context: "Context" },
      });
      const parent = parseToolResponse<Task>(parentResult);

      const childResult = await ctx.client.callTool({
        name: "create_task",
        arguments: { description: "Child", context: "Context" },
      });
      const child = parseToolResponse<Task>(childResult);

      const updateResult = await ctx.client.callTool({
        name: "update_task",
        arguments: { id: child.id, parent_id: parent.id },
      });

      const updated = parseToolResponse<Task>(updateResult);
      expect(updated.parent_id).toBe(parent.id);
    });

    it("removes parent_id by setting to null", async () => {
      const parentResult = await ctx.client.callTool({
        name: "create_task",
        arguments: { description: "Parent", context: "Context" },
      });
      const parent = parseToolResponse<Task>(parentResult);

      const childResult = await ctx.client.callTool({
        name: "create_task",
        arguments: { description: "Child", context: "Context", parent_id: parent.id },
      });
      const child = parseToolResponse<Task>(childResult);

      const updateResult = await ctx.client.callTool({
        name: "update_task",
        arguments: { id: child.id, parent_id: null },
      });

      const updated = parseToolResponse<Task>(updateResult);
      expect(updated.parent_id).toBeNull();
    });
  });
});

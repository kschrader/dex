import { z } from "zod";
import { TaskService } from "../core/task-service.js";
import { TaskStatusSchema, UpdateTaskInput } from "../types.js";
import { jsonResponse, McpToolResponse } from "./response.js";

export const UpdateTaskArgsSchema = z.object({
  id: z.string().min(1).describe("Task ID"),
  description: z.string().min(1).optional().describe("Updated description"),
  context: z.string().min(1).optional().describe("Updated context"),
  parent_id: z.string().min(1).nullable().optional().describe("Parent task ID (null to remove parent)"),
  project: z.string().min(1).optional().describe("Updated project"),
  priority: z.number().int().min(0).optional().describe("Updated priority"),
  status: TaskStatusSchema.optional().describe("Updated status"),
  result: z.string().optional().describe("Final output when completing task"),
  delete: z.boolean().optional().describe("Set to true to delete the task"),
});

export type UpdateTaskArgs = UpdateTaskInput;

export function handleUpdateTask(args: UpdateTaskArgs, service: TaskService): McpToolResponse {
  try {
    if (args.delete) {
      const deleted = service.delete(args.id);
      if (!deleted) {
        return jsonResponse({ error: `Task ${args.id} not found` });
      }
      return jsonResponse({ deleted: true, id: args.id });
    }

    const task = service.update(args);
    return jsonResponse(task);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) });
  }
}

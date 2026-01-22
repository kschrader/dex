import { z } from "zod";
import { TaskService } from "../core/task-service.js";
import { TaskStatusSchema, UpdateTaskInput } from "../types.js";
import { jsonResponse, McpToolResponse } from "./response.js";

export const UpdateTaskArgsSchema = z.object({
  id: z.string().min(1).describe("Task ID"),
  description: z.string().min(1).optional().describe("Updated description"),
  context: z.string().min(1).optional().describe("Updated context"),
  parent_id: z.string().min(1).nullable().optional().describe("Parent task ID (null to remove parent)"),
  priority: z.number().int().min(0).optional().describe("Updated priority"),
  status: TaskStatusSchema.optional().describe("Updated status"),
  result: z.string().optional().describe("Implementation summary like a PR description. Explain what was implemented and how the solution works, key decisions made and their rationale, trade-offs or alternatives you considered, and any follow-up work or tech debt. Write naturally so anyone can understand the solution without reading code. See .dex/tasks/c2w75okn.json for a real example."),
  delete: z.boolean().optional().describe("Set to true to delete the task"),
});

export async function handleUpdateTask(args: UpdateTaskInput, service: TaskService): Promise<McpToolResponse> {
  if (args.delete) {
    const deletedTask = await service.update(args);
    return jsonResponse({ deleted: true, id: args.id, task: deletedTask });
  }
  return jsonResponse(await service.update(args));
}

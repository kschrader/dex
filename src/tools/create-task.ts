import { z } from "zod";
import { TaskService } from "../core/task-service.js";
import { CreateTaskInput } from "../types.js";
import { jsonResponse, McpToolResponse } from "./response.js";

export const CreateTaskArgsSchema = z.object({
  description: z.string().min(1).describe("One-line summary of the task"),
  context: z.string().min(1).describe("Full implementation context and details"),
  parent_id: z.string().min(1).optional().describe("Parent task ID to create as subtask"),
  project: z.string().min(1).optional().describe("Project grouping (default: 'default', inherited from parent if subtask)"),
  priority: z.number().int().min(0).optional().describe("Priority level - lower number = higher priority (default: 1)"),
});

export type CreateTaskArgs = CreateTaskInput;

export function handleCreateTask(args: CreateTaskArgs, service: TaskService): McpToolResponse {
  try {
    const task = service.create({
      description: args.description,
      context: args.context,
      parent_id: args.parent_id,
      project: args.project,
      priority: args.priority,
    });

    return jsonResponse(task);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) });
  }
}

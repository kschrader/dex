import { z } from "zod";
import { TaskService } from "../core/task-service.js";
import { jsonResponse, McpToolResponse } from "./response.js";

export const CreateTaskArgsSchema = z.object({
  description: z.string().describe("One-line summary of the task"),
  context: z.string().describe("Full implementation context and details"),
  parent_id: z.string().optional().describe("Parent task ID to create as subtask"),
  project: z.string().optional().describe("Project grouping (default: 'default', inherited from parent if subtask)"),
  priority: z.number().optional().describe("Priority level - lower number = higher priority (default: 1)"),
});

export type CreateTaskArgs = z.infer<typeof CreateTaskArgsSchema>;

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

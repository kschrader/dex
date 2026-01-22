import { z } from "zod";
import { TaskService } from "../core/task-service.js";
import { TaskStatusSchema, ListTasksInput } from "../types.js";
import { jsonResponse, McpToolResponse } from "./response.js";

export const ListTasksArgsSchema = z.object({
  status: TaskStatusSchema.optional().describe("Filter by status"),
  project: z.string().optional().describe("Filter by project"),
  query: z.string().optional().describe("Search in description and context"),
  all: z.boolean().optional().describe("Show all tasks (pending and completed)"),
});

export type ListTasksArgs = ListTasksInput;

export function handleListTasks(args: ListTasksArgs, service: TaskService): McpToolResponse {
  try {
    const tasks = service.list(args);
    return jsonResponse(tasks);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) });
  }
}

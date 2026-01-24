import { z } from "zod";
import { TaskService } from "../core/task-service.js";
import { ListTasksInput } from "../types.js";
import { jsonResponse, McpToolResponse } from "./response.js";

export const ListTasksArgsSchema = z.object({
  completed: z.boolean().optional().describe("Filter by completion status (true = completed, false = pending)"),
  query: z.string().optional().describe("Search in description and context"),
  all: z.boolean().optional().describe("Show all tasks (pending and completed)"),
});

export async function handleListTasks(args: ListTasksInput, service: TaskService): Promise<McpToolResponse> {
  return jsonResponse(await service.list(args));
}

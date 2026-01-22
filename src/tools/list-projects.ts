import { z } from "zod";
import { TaskService } from "../core/task-service.js";
import { jsonResponse, McpToolResponse } from "./response.js";

export const ListProjectsArgsSchema = z.object({});

export function handleListProjects(service: TaskService): McpToolResponse {
  try {
    const projects = service.listProjects();
    return jsonResponse(projects);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) });
  }
}

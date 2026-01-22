import { z } from "zod";
import { TaskService } from "../core/task-service.js";
import { jsonResponse, McpToolResponse } from "./response.js";

export const ListProjectsArgsSchema = z.object({});

/**
 * Handle the list_projects MCP tool call.
 * Errors are propagated to the MCP server layer for consistent handling.
 */
export function handleListProjects(service: TaskService): McpToolResponse {
  const projects = service.listProjects();
  return jsonResponse(projects);
}

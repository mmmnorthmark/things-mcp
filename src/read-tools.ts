import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  queryTodos,
  queryTodoById,
  queryProjects,
  queryProjectById,
  queryAreas,
  queryTags,
} from "./db.js";
import type { TodoList, PaginatedResult } from "./db.js";

export function registerReadTools(server: McpServer): void {
  registerGetTodos(server);
  registerGetTodo(server);
  registerGetProjects(server);
  registerGetProject(server);
  registerGetAreas(server);
  registerGetTags(server);
}

function paginatedResponse<T>(result: PaginatedResult<T>, limit: number, offset: number): object {
  return {
    items: result.items,
    totalCount: result.totalCount,
    limit,
    offset,
    hasMore: offset + result.items.length < result.totalCount,
  };
}

// --- get-todos ---

function registerGetTodos(server: McpServer): void {
  server.registerTool(
    "get-todos",
    {
      description:
        "Get to-dos from Things 3 by reading the database directly. " +
        "Returns paginated results — use offset and limit to page through large result sets. " +
        "When hasMore is true, increase offset by limit to fetch the next page. " +
        "Filter by list (inbox, today, anytime, someday, upcoming, logbook, trash), project, area, tag, or search text.",
      inputSchema: {
        list: z
          .enum(["inbox", "today", "anytime", "someday", "upcoming", "logbook", "trash"])
          .optional()
          .describe("Filter by built-in list view"),
        projectId: z.string().optional().describe("Filter by project UUID"),
        areaId: z.string().optional().describe("Filter by area UUID"),
        tag: z.string().optional().describe("Filter by tag name"),
        status: z
          .enum(["open", "completed", "canceled"])
          .optional()
          .describe("Filter by status (default: depends on list)"),
        search: z.string().optional().describe("Search in title and notes"),
        limit: z.number().optional().describe("Max results per page (default 20). Use with offset to paginate."),
        offset: z.number().optional().describe("Number of results to skip (default 0). Set to offset + limit from a previous call to get the next page."),
      },
    },
    async (params) => {
      try {
        const limit = params.limit ?? 20;
        const offset = params.offset ?? 0;
        const result = queryTodos({
          list: params.list as TodoList | undefined,
          projectId: params.projectId,
          areaId: params.areaId,
          tag: params.tag,
          search: params.search,
          status: params.status as "open" | "completed" | "canceled" | undefined,
          limit,
          offset,
        });

        return {
          content: [{ type: "text" as const, text: JSON.stringify(paginatedResponse(result, limit, offset), null, 2) }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to query todos: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

// --- get-todo ---

function registerGetTodo(server: McpServer): void {
  server.registerTool(
    "get-todo",
    {
      description:
        "Get a single to-do from Things 3 by UUID. " +
        "Returns full details including notes, checklist items, tags, project, and area.",
      inputSchema: {
        id: z.string().describe("UUID of the to-do"),
      },
    },
    async (params) => {
      try {
        const todo = queryTodoById(params.id);
        if (!todo) {
          return {
            content: [{ type: "text" as const, text: `No to-do found with ID: ${params.id}` }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(todo, null, 2) }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to query todo: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

// --- get-projects ---

function registerGetProjects(server: McpServer): void {
  server.registerTool(
    "get-projects",
    {
      description:
        "Get projects from Things 3. " +
        "Returns paginated results with open/total to-do counts. " +
        "When hasMore is true, increase offset by limit to fetch the next page. " +
        "Filter by status, area, or search text.",
      inputSchema: {
        status: z
          .enum(["open", "completed", "canceled"])
          .optional()
          .describe("Filter by project status"),
        areaId: z.string().optional().describe("Filter by area UUID"),
        search: z.string().optional().describe("Search in title and notes"),
        limit: z.number().optional().describe("Max results per page (default 20). Use with offset to paginate."),
        offset: z.number().optional().describe("Number of results to skip (default 0). Set to offset + limit from a previous call to get the next page."),
      },
    },
    async (params) => {
      try {
        const limit = params.limit ?? 20;
        const offset = params.offset ?? 0;
        const result = queryProjects({
          status: params.status as "open" | "completed" | "canceled" | undefined,
          areaId: params.areaId,
          search: params.search,
          limit,
          offset,
        });

        return {
          content: [{ type: "text" as const, text: JSON.stringify(paginatedResponse(result, limit, offset), null, 2) }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to query projects: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

// --- get-project ---

function registerGetProject(server: McpServer): void {
  server.registerTool(
    "get-project",
    {
      description:
        "Get a single project from Things 3 by UUID. " +
        "Returns full details including headings and to-dos organized by heading.",
      inputSchema: {
        id: z.string().describe("UUID of the project"),
      },
    },
    async (params) => {
      try {
        const project = queryProjectById(params.id);
        if (!project) {
          return {
            content: [{ type: "text" as const, text: `No project found with ID: ${params.id}` }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(project, null, 2) }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to query project: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

// --- get-areas ---

function registerGetAreas(server: McpServer): void {
  server.registerTool(
    "get-areas",
    {
      description: "Get all areas from Things 3.",
      inputSchema: {},
    },
    async () => {
      try {
        const areas = queryAreas();
        return {
          content: [{ type: "text" as const, text: JSON.stringify(areas, null, 2) }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to query areas: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

// --- get-tags ---

function registerGetTags(server: McpServer): void {
  server.registerTool(
    "get-tags",
    {
      description: "Get all tags from Things 3.",
      inputSchema: {},
    },
    async () => {
      try {
        const tags = queryTags();
        return {
          content: [{ type: "text" as const, text: JSON.stringify(tags, null, 2) }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to query tags: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

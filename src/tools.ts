import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  buildUrl,
  buildJsonUrl,
  executeUrl,
  requireAuthToken,
  getAuthToken,
  jsonPayloadRequiresAuthToken,
  type ExecuteResult,
} from "./url.js";
import { validateThingsJsonItems } from "./things-json-validate.js";

export function registerTools(server: McpServer): void {
  registerAddTodo(server);
  registerAddProject(server);
  registerUpdateTodo(server);
  registerUpdateProject(server);
  registerShow(server);
  registerSearch(server);
  registerGetVersion(server);
  registerBatchJson(server);
}

// --- add-todo ---

function registerAddTodo(server: McpServer): void {
  server.registerTool(
    "add-todo",
    {
      description:
        "Create one or more to-dos in Things 3. " +
        "When the user mentions multiple items, extract each item as a separate to-do and use 'titles' (newline-separated) instead of putting everything in one to-do. " +
        "Each title should be a short, actionable phrase — not the user's raw prompt.",
      inputSchema: {
        title: z.string().optional().describe(
          "Title for a single to-do (max 4,000 chars). Use a short, actionable phrase — not the user's raw prompt. Ignored when 'titles' is set.",
        ),
        titles: z
          .string()
          .optional()
          .describe(
            "Create multiple to-dos at once — one title per line (newline-separated). " +
            "Use this when the user asks to add several items. " +
            "Example: 'add milk, eggs, and bread' → titles='Milk\\nEggs\\nBread'. " +
            "When set, 'title' is ignored.",
          ),
        notes: z.string().optional().describe("Notes for the to-do (max 10,000 chars). Markdown supported."),
        when: z
          .string()
          .optional()
          .describe(
            "Schedule: 'today', 'tomorrow', 'evening', 'anytime', 'someday', a date (YYYY-MM-DD), or datetime (YYYY-MM-DD@HH:MM)",
          ),
        deadline: z.string().optional().describe("Deadline date (YYYY-MM-DD). Empty string clears it."),
        tags: z
          .array(z.string())
          .optional()
          .describe("Tag names to apply (must already exist in Things)"),
        checklistItems: z
          .array(z.string())
          .optional()
          .describe("Checklist items to add (max 100)"),
        list: z
          .string()
          .optional()
          .describe("Name of the project or area to add the to-do to"),
        listId: z
          .string()
          .optional()
          .describe("ID of the project or area (takes precedence over 'list')"),
        heading: z
          .string()
          .optional()
          .describe("Heading name within the project"),
        headingId: z
          .string()
          .optional()
          .describe("Heading ID (takes precedence over 'heading')"),
        completed: z.boolean().optional().describe("Create as already completed"),
        canceled: z.boolean().optional().describe("Create as canceled (overrides 'completed')"),
        reveal: z.boolean().optional().describe("Navigate Things to the created to-do"),
        showQuickEntry: z
          .boolean()
          .optional()
          .describe("Show the Quick Entry dialog instead of adding directly"),
        useClipboard: z
          .enum(["replace-title", "replace-notes", "replace-checklist-items"])
          .optional()
          .describe(
            "Fill a field from the system clipboard. " +
            "'replace-title' sets the title, 'replace-notes' sets the notes, 'replace-checklist-items' sets the checklist. " +
            "Ignored when title/titles are set.",
          ),
        creationDate: z
          .string()
          .optional()
          .describe("Override creation date (ISO8601, e.g. 2026-01-15T09:00:00Z). Cannot be in the future."),
        completionDate: z
          .string()
          .optional()
          .describe("Set completion date (ISO8601). Only for completed/canceled items."),
      },
    },
    async (params) => {
      const urlParams: Record<string, string | boolean | undefined> = {
        title: params.title,
        titles: params.titles,
        notes: params.notes,
        when: params.when,
        deadline: params.deadline,
        tags: params.tags?.join(","),
        "checklist-items": params.checklistItems?.join("\n"),
        list: params.list,
        "list-id": params.listId,
        heading: params.heading,
        "heading-id": params.headingId,
        completed: params.completed,
        canceled: params.canceled,
        reveal: params.reveal,
        "show-quick-entry": params.showQuickEntry,
        "use-clipboard": params.useClipboard,
        "creation-date": params.creationDate,
        "completion-date": params.completionDate,
      };

      const url = buildUrl("add", urlParams);
      const result = await executeUrl(url);

      const label = params.titles
        ? "to-dos"
        : params.title
          ? `to-do "${params.title}"`
          : params.useClipboard
            ? "to-do from clipboard"
            : params.showQuickEntry
              ? "to-do via Quick Entry"
              : "to-do";
      const idInfo = result.thingsId ? ` (ID: ${result.thingsId})` : "";
      return {
        content: [{ type: "text" as const, text: `Created ${label}${idInfo}` }],
      };
    },
  );
}

// --- add-project ---

function registerAddProject(server: McpServer): void {
  server.registerTool(
    "add-project",
    {
      description: "Create a new project in Things 3, optionally with child to-dos.",
      inputSchema: {
        title: z.string().describe("Project title"),
        notes: z.string().optional().describe("Project notes (max 10,000 chars). Markdown supported."),
        when: z
          .string()
          .optional()
          .describe(
            "Schedule: 'today', 'tomorrow', 'evening', 'anytime', 'someday', a date (YYYY-MM-DD), or datetime (YYYY-MM-DD@HH:MM)",
          ),
        deadline: z.string().optional().describe("Deadline date (YYYY-MM-DD)"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Tag names to apply (must already exist in Things)"),
        area: z.string().optional().describe("Area name to add the project to"),
        areaId: z.string().optional().describe("Area ID (takes precedence over 'area')"),
        todos: z
          .array(z.string())
          .optional()
          .describe("To-do titles to create inside the project"),
        completed: z.boolean().optional().describe("Create as already completed"),
        canceled: z.boolean().optional().describe("Create as canceled"),
        reveal: z.boolean().optional().describe("Navigate Things into the new project"),
        creationDate: z.string().optional().describe("Override creation date (ISO8601)"),
        completionDate: z.string().optional().describe("Completion date (ISO8601)"),
      },
    },
    async (params) => {
      const urlParams: Record<string, string | boolean | undefined> = {
        title: params.title,
        notes: params.notes,
        when: params.when,
        deadline: params.deadline,
        tags: params.tags?.join(","),
        area: params.area,
        "area-id": params.areaId,
        "to-dos": params.todos?.join("\n"),
        completed: params.completed,
        canceled: params.canceled,
        reveal: params.reveal,
        "creation-date": params.creationDate,
        "completion-date": params.completionDate,
      };

      const url = buildUrl("add-project", urlParams);
      const result = await executeUrl(url);

      const idInfo = result.thingsId ? ` (ID: ${result.thingsId})` : "";
      return {
        content: [
          { type: "text" as const, text: `Created project "${params.title}"${idInfo}` },
        ],
      };
    },
  );
}

// --- update-todo ---

function registerUpdateTodo(server: McpServer): void {
  server.registerTool(
    "update-todo",
    {
      description:
        "Update an existing to-do in Things 3. Requires THINGS_AUTH_TOKEN.",
      inputSchema: {
        id: z.string().describe("ID of the to-do to update"),
        title: z.string().optional().describe("New title"),
        notes: z.string().optional().describe("Replace notes entirely"),
        prependNotes: z.string().optional().describe("Prepend text to existing notes"),
        appendNotes: z.string().optional().describe("Append text to existing notes"),
        when: z
          .string()
          .optional()
          .describe(
            "Schedule: 'today', 'tomorrow', 'evening', 'someday', a date, or datetime",
          ),
        deadline: z.string().optional().describe("Deadline (YYYY-MM-DD). Empty string clears it."),
        tags: z
          .array(z.string())
          .optional()
          .describe("Replace all tags with these"),
        addTags: z
          .array(z.string())
          .optional()
          .describe("Add these tags without removing existing ones"),
        checklistItems: z
          .array(z.string())
          .optional()
          .describe("Replace the entire checklist"),
        prependChecklistItems: z
          .array(z.string())
          .optional()
          .describe("Add items to the beginning of the checklist"),
        appendChecklistItems: z
          .array(z.string())
          .optional()
          .describe("Add items to the end of the checklist"),
        list: z.string().optional().describe("Move to this project or area (by name)"),
        listId: z.string().optional().describe("Move to this project or area (by ID)"),
        heading: z.string().optional().describe("Move under this heading (by name)"),
        headingId: z.string().optional().describe("Move under this heading (by ID)"),
        completed: z.boolean().optional().describe("Mark as completed"),
        canceled: z.boolean().optional().describe("Mark as canceled (overrides 'completed')"),
        reveal: z.boolean().optional().describe("Navigate to the updated to-do"),
        duplicate: z
          .boolean()
          .optional()
          .describe("Duplicate the to-do before applying changes"),
        creationDate: z.string().optional().describe("Override creation date (ISO8601)"),
        completionDate: z.string().optional().describe("Set completion date (ISO8601)"),
      },
    },
    async (params) => {
      const authToken = requireAuthToken();

      const urlParams: Record<string, string | boolean | undefined> = {
        id: params.id,
        title: params.title,
        notes: params.notes,
        "prepend-notes": params.prependNotes,
        "append-notes": params.appendNotes,
        when: params.when,
        deadline: params.deadline,
        tags: params.tags?.join(","),
        "add-tags": params.addTags?.join(","),
        "checklist-items": params.checklistItems?.join("\n"),
        "prepend-checklist-items": params.prependChecklistItems?.join("\n"),
        "append-checklist-items": params.appendChecklistItems?.join("\n"),
        list: params.list,
        "list-id": params.listId,
        heading: params.heading,
        "heading-id": params.headingId,
        completed: params.completed,
        canceled: params.canceled,
        reveal: params.reveal,
        duplicate: params.duplicate,
        "creation-date": params.creationDate,
        "completion-date": params.completionDate,
      };

      const url = buildUrl("update", urlParams, authToken);
      const result = await executeUrl(url);

      const idInfo = result.thingsId ? ` (ID: ${result.thingsId})` : "";
      return {
        content: [{ type: "text" as const, text: `Updated to-do ${params.id}${idInfo}` }],
      };
    },
  );
}

// --- update-project ---

function registerUpdateProject(server: McpServer): void {
  server.registerTool(
    "update-project",
    {
      description:
        "Update an existing project in Things 3. Requires THINGS_AUTH_TOKEN.",
      inputSchema: {
        id: z.string().describe("ID of the project to update"),
        title: z.string().optional().describe("New title"),
        notes: z.string().optional().describe("Replace notes entirely"),
        prependNotes: z.string().optional().describe("Prepend text to existing notes"),
        appendNotes: z.string().optional().describe("Append text to existing notes"),
        when: z
          .string()
          .optional()
          .describe(
            "Schedule: 'today', 'tomorrow', 'evening', 'someday', a date, or datetime",
          ),
        deadline: z.string().optional().describe("Deadline (YYYY-MM-DD). Empty string clears it."),
        tags: z
          .array(z.string())
          .optional()
          .describe("Replace all tags with these"),
        addTags: z
          .array(z.string())
          .optional()
          .describe("Add these tags without removing existing ones"),
        area: z.string().optional().describe("Move to this area (by name)"),
        areaId: z.string().optional().describe("Move to this area (by ID)"),
        completed: z.boolean().optional().describe("Mark project as completed"),
        canceled: z.boolean().optional().describe("Mark project as canceled"),
        reveal: z.boolean().optional().describe("Navigate to the updated project"),
        duplicate: z
          .boolean()
          .optional()
          .describe("Duplicate the project before applying changes"),
        creationDate: z.string().optional().describe("Override creation date (ISO8601)"),
        completionDate: z.string().optional().describe("Set completion date (ISO8601)"),
      },
    },
    async (params) => {
      const authToken = requireAuthToken();

      const urlParams: Record<string, string | boolean | undefined> = {
        id: params.id,
        title: params.title,
        notes: params.notes,
        "prepend-notes": params.prependNotes,
        "append-notes": params.appendNotes,
        when: params.when,
        deadline: params.deadline,
        tags: params.tags?.join(","),
        "add-tags": params.addTags?.join(","),
        area: params.area,
        "area-id": params.areaId,
        completed: params.completed,
        canceled: params.canceled,
        reveal: params.reveal,
        duplicate: params.duplicate,
        "creation-date": params.creationDate,
        "completion-date": params.completionDate,
      };

      const url = buildUrl("update-project", urlParams, authToken);
      const result = await executeUrl(url);

      const idInfo = result.thingsId ? ` (ID: ${result.thingsId})` : "";
      return {
        content: [{ type: "text" as const, text: `Updated project ${params.id}${idInfo}` }],
      };
    },
  );
}

// --- show ---

function registerShow(server: McpServer): void {
  server.registerTool(
    "show",
    {
      description:
        "Navigate Things 3 to a specific item, project, area, tag, or built-in list. " +
        "Built-in list IDs: inbox, today, anytime, upcoming, someday, logbook, tomorrow, deadlines, repeating, all-projects, logged-projects.",
      inputSchema: {
        id: z
          .string()
          .optional()
          .describe(
            "Item/project/area ID, or a built-in list: inbox, today, anytime, upcoming, someday, logbook, tomorrow, deadlines, repeating, all-projects, logged-projects",
          ),
        query: z
          .string()
          .optional()
          .describe("Search for area/project/tag/list by name (used if 'id' is not set)"),
        filter: z
          .string()
          .optional()
          .describe("Comma-separated tag names to filter the displayed items"),
      },
    },
    async (params) => {
      if (!params.id && !params.query) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Either 'id' or 'query' is required for show.",
            },
          ],
          isError: true,
        };
      }

      const urlParams: Record<string, string | boolean | undefined> = {
        id: params.id,
        query: params.query,
        filter: params.filter,
      };

      const url = buildUrl("show", urlParams);
      await executeUrl(url);

      const target = params.id ?? params.query ?? "Things";
      return {
        content: [{ type: "text" as const, text: `Navigated to ${target}` }],
      };
    },
  );
}

// --- search ---

function registerSearch(server: McpServer): void {
  server.registerTool(
    "search",
    {
      description: "Open the Things 3 search screen with an optional query.",
      inputSchema: {
        query: z.string().optional().describe("Search text"),
      },
    },
    async (params) => {
      const urlParams: Record<string, string | boolean | undefined> = {
        query: params.query,
      };

      const url = buildUrl("search", urlParams);
      await executeUrl(url);

      return {
        content: [
          {
            type: "text" as const,
            text: params.query
              ? `Opened search for "${params.query}"`
              : "Opened Things search",
          },
        ],
      };
    },
  );
}

// --- get-version ---

function registerGetVersion(server: McpServer): void {
  server.registerTool(
    "get-version",
    {
      description:
        "Get Things URL scheme/client version info. Uses the Things 'version' URL command (xcall recommended), with AppleScript fallback for app version.",
      inputSchema: {},
    },
    async () => {
      try {
        const result = await executeUrl(buildUrl("version", {}));
        const schemeVersion = result.callbackParams?.["x-things-scheme-version"];
        const clientVersion = result.callbackParams?.["x-things-client-version"];

        if (schemeVersion || clientVersion) {
          const parts: string[] = [];
          if (schemeVersion) parts.push(`scheme ${schemeVersion}`);
          if (clientVersion) parts.push(`client ${clientVersion}`);
          return {
            content: [{ type: "text" as const, text: `Things version info: ${parts.join(", ")}` }],
          };
        }

        const appVersion = await getAppVersion();
        return {
          content: [
            {
              type: "text" as const,
              text:
                `Things app version: ${appVersion}. ` +
                "Install xcall to also return URL scheme/client version fields.",
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to get version: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

// --- batch-json ---

function registerBatchJson(server: McpServer): void {
  server.registerTool(
    "batch-json",
    {
      description:
        "Bulk create, update, or restructure data in Things 3 using the official `things:///json` command (JSON in the `data` parameter). " +
        "Use this for multi-item or batch changes: projects with headings and nested to-dos, checklist updates, many to-dos at once, or mixed create/update operations. " +
        "THINGS_AUTH_TOKEN is required if any object in the payload uses operation `update` (anywhere in the tree). " +
        "With xcall installed, x-success returns `x-things-ids` (JSON array of top-level created IDs). " +
        "See resource `things://docs/things-json-schema` and https://culturedcode.com/things/support/articles/2803573/#json",
      inputSchema: {
        items: z
          .array(z.record(z.string(), z.any()))
          .describe(
            "Array for Things `data` — each object has `type`, `attributes`, and optional `operation` / `id` for updates. " +
            "Top-level types are only `to-do` and `project` (ThingsJSONCoder). See resource things://docs/things-json-schema.",
          ),
        reveal: z
          .boolean()
          .optional()
          .describe(
            "Maps to Things `reveal` — navigate to the first created to-do or project when true",
          ),
      },
    },
    async (params) => {
      const validation = validateThingsJsonItems(params.items);
      if (!validation.ok) {
        return {
          content: [
            {
              type: "text" as const,
              text: formatThingsJsonValidationErrors(validation.errors),
            },
          ],
          isError: true,
        };
      }

      try {
        const hasUpdates = jsonPayloadRequiresAuthToken(params.items);
        const authToken = hasUpdates ? requireAuthToken() : getAuthToken();

        const url = buildJsonUrl(params.items, authToken ?? undefined, params.reveal);
        const result = await executeUrl(url);

        return {
          content: [
            {
              type: "text" as const,
              text: formatBatchJsonToolResponse(result, params.items.length),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: err instanceof Error ? err.message : String(err),
            },
          ],
          isError: true,
        };
      }
    },
  );
}

function formatThingsJsonValidationErrors(errors: string[]): string {
  return (
    "Things JSON validation failed before sending to Things. " +
      "Fix the payload so it matches ThingsJSONCoder / the official `json` command (see resource things://docs/things-json-schema):\n\n" +
    errors.map((e) => `- ${e}`).join("\n")
  );
}

function formatBatchJsonToolResponse(result: ExecuteResult, topLevelCount: number): string {
  const lines: string[] = [];
  lines.push(
    `Processed ${topLevelCount} top-level object${topLevelCount === 1 ? "" : "s"} via the json command.`,
  );
  const xParams = result.callbackParams
    ? Object.entries(result.callbackParams).filter(([key]) => key.startsWith("x-"))
    : [];
  if (xParams.length > 0) {
    lines.push("", "x-callback parameters:");
    for (const [key, value] of xParams.sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`  ${key}: ${value}`);
    }
  } else if (result.thingsId) {
    lines.push(`Things callback: ${result.thingsId}`);
  } else {
    lines.push(
      "(No x-callback data — install xcall to capture x-things-ids and other callback fields.)",
    );
  }
  return lines.join("\n");
}

async function getAppVersion(): Promise<string> {
  const { spawn } = await import("node:child_process");
  return await new Promise<string>((resolve, reject) => {
    const proc = spawn("osascript", [
      "-e",
      'tell application "Things3" to return version',
    ]);
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`osascript failed: ${stderr.trim()}`));
      else resolve(stdout.trim());
    });
    proc.on("error", reject);
  });
}

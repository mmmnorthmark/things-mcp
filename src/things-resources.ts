import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Static MCP resources (documentation for agents).
 */
export function registerThingsResources(server: McpServer): void {
  const schemaPath = path.join(
    fileURLToPath(new URL(".", import.meta.url)),
    "..",
    "resources",
    "things-json-schema.md",
  );

  server.registerResource(
    "things-json-schema",
    "things://docs/things-json-schema",
    {
      title: "Things JSON command schema (batch-json)",
      description:
        "Agent-oriented summary of the Things `json` URL payload, aligned with ThingsJSONCoder and the official URL scheme docs",
      mimeType: "text/markdown",
    },
    async (uri) => {
      const text = await readFile(schemaPath, "utf8");
      return {
        contents: [{ uri: uri.href, text }],
      };
    },
  );
}

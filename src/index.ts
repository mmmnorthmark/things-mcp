#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";
import { registerReadTools } from "./read-tools.js";
import { registerThingsResources } from "./things-resources.js";
import { initSql } from "./sqlite-adapter.js";

await initSql();

const server = new McpServer({
  name: "things-mcp",
  version: "0.1.0",
});

registerThingsResources(server);
registerTools(server);
registerReadTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);

console.error("things-mcp server running on stdio");

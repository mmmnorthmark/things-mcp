---
description: Repository guidance for the Things MCP server.
globs: "src/**/*.ts,test/**/*.ts,README.md,package.json"
alwaysApply: false
---

# Things MCP Server Guidelines

This repository implements an MCP server that maps tool calls to the Things URL scheme.

## Core focus

- Preserve 1:1 behavior with the official Things URL documentation.
- Keep URL construction pure and testable (`src/url.ts`).
- Keep tool schemas and parameter mapping explicit (`src/tools.ts`).
- Keep docs aligned with implementation (`README.md`).

## `json` command (batch-updates / primary goal)

In this project, **“batch updates”** means the Things URL **`json`** command: bulk create/update of to-dos, projects, headings, and checklist items via a single `data` payload — **not** npm or dependency batch upgrades unless explicitly stated.

The **`batch-updates` branch** is scoped around that command, documented here:

**[Things URL Scheme — json (for Developers)](https://culturedcode.com/things/support/articles/2803573/#json)**

### What the official command specifies

- **URL:** `things:///json?` with query parameters:
  - **`data`** — JSON string: a **top-level array** of Things objects (`to-do`, `project`, and nested types such as `heading` and `checklist-item` per the article). Structure follows Cultured Code’s JSON format (including optional `operation`: `create` | `update`, and `id` for updates).
  - **`auth-token`** — Required when the JSON contains any **`update`** operation.
  - **`reveal`** — Optional boolean; whether to navigate to the first created item.
- **x-success:** Returns **`x-things-ids`** — a JSON string of IDs for top-level created items (nested to-do IDs inside projects are not listed separately in the doc).

### How this repo maps to it

- **`buildJsonUrl()`** (`src/url.ts`) builds `things:///x-callback-url/json?data=...` (plus `auth-token` and `reveal` when set). The x-callback form is used so **`xcall`** can receive callbacks; **`toDirectUrl()`** strips the wrapper to `things:///json?...` for **`open`**.
- **MCP tool `batch-json`** (`src/tools.ts`) accepts the payload as **`items`** (the same array that goes in `data`), optional **`reveal`**, and supplies **`THINGS_AUTH_TOKEN`** when updates are present (or when a token is available for authenticated flows).
- Callback parsing should preserve **`x-things-ids`** (and related fields) from Things, consistent with other tools.

Work on this feature means **staying aligned with that documentation** (parameters, encoding, auth rules, and callback fields) — not inventing a parallel format.

## MCP and Things behavior

- Tool names should stay stable (`add-todo`, `update-todo`, `show`, etc.).
- Use camelCase input names in tool schemas and map to Things kebab-case URL params.
- Do not silently drop supported Things parameters.
- For commands that require `auth-token`, fail fast with a clear `THINGS_AUTH_TOKEN` error.
- For commands with required mutually dependent inputs (for example `show` requiring `id` or `query`), validate and return a clear error.
- Prefer x-callback behavior when available and preserve callback fields returned by Things.

## Node workflow

Use Node.js and npm for all workflows.

- Install: `npm install`
- Dev: `npm run dev`
- Test: `npm test`
- Build: `npm run build`

## Testing expectations

- Add or update tests for every behavior change.
- Keep unit tests focused on URL generation and callback parsing.
- Use `vitest` only.
- Before finishing work, run:

```bash
npm test
npm run build
```

## Documentation expectations

When tool parameters or behavior changes:

- Update `README.md` tool descriptions and parameter lists.
- Keep examples and caveats (xcall, auth token requirements) accurate.

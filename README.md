# things-mcp

MCP server for [Things 3](https://culturedcode.com/things/) on macOS. Exposes the full [Things URL scheme](https://culturedcode.com/things/support/articles/2803573/) as tools — create to-dos, projects, bulk operations, and more. Also reads directly from the Things SQLite database so an AI assistant can query your tasks, projects, areas, and tags without opening the app.

Published as: `@nkootstra/things-mcp`

## Requirements

- macOS (Things 3 is macOS-only)
- [Things 3](https://culturedcode.com/things/) installed
- Node.js 22+

## Setup

### Claude Desktop

Add to your `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "things": {
      "command": "npx",
      "args": ["-y", "@nkootstra/things-mcp"],
      "env": {
        "THINGS_AUTH_TOKEN": "your-auth-token-here"
      }
    }
  }
}
```

Then restart Claude Desktop.

> **Tip:** You can also use `bunx` instead of `npx` if you have Bun installed.

### Claude Code

```bash
claude mcp add things -- npx -y @nkootstra/things-mcp
```

Set the auth token in your environment:

```bash
export THINGS_AUTH_TOKEN="your-auth-token-here"
```

### Other MCP clients

Run directly:

```bash
THINGS_AUTH_TOKEN="your-token" npx -y @nkootstra/things-mcp
```

Or install globally:

```bash
npm install -g @nkootstra/things-mcp
THINGS_AUTH_TOKEN="your-token" things-mcp
```

## Run and install examples

### 1) Run without installing globally

```bash
THINGS_AUTH_TOKEN="your-token" npx -y @nkootstra/things-mcp
```

### 2) Install globally and run

```bash
npm install -g @nkootstra/things-mcp
things-mcp
```

### 3) Claude Desktop config example

```json
{
  "mcpServers": {
    "things": {
      "command": "npx",
      "args": ["-y", "@nkootstra/things-mcp"],
      "env": {
        "THINGS_AUTH_TOKEN": "your-auth-token-here"
      }
    }
  }
}
```

### 4) What usage looks like in an MCP client

- "What's on my today list?"
- "Show me all my projects and their progress"
- "Search for tasks about groceries"
- "Add a to-do to buy groceries with a checklist for milk, eggs, and bread"
- "Create a project called Home Renovation with tasks for each room"
- "Mark task XYZ as completed" (requires `THINGS_AUTH_TOKEN`)

## Getting your auth token

The auth token is only needed for **updating** existing items (not for creating or reading).

1. Open **Things 3**
2. Go to **Settings** → **General**
3. Enable **Things URLs**
4. Click **Manage** to reveal your authorization token
5. Copy the token and add it to your MCP client config

## Available tools

### Reading (from SQLite database)

| Tool | Description |
|---|---|
| `get-todos` | Get to-dos with flexible filtering by list (inbox, today, anytime, someday, upcoming, logbook, trash), project, area, tag, status, or search text |
| `get-todo` | Get a single to-do by UUID with full details (notes, checklist, tags, project, area) |
| `get-projects` | List projects with open/total to-do counts, filterable by status, area, or search |
| `get-project` | Get a single project by UUID with headings and organized to-dos |
| `get-areas` | List all areas |
| `get-tags` | List all tags with parent relationships |

### Creating

| Tool | Description |
|---|---|
| `add-todo` | Create a to-do with title, notes, tags, checklist, scheduling, and more |
| `add-project` | Create a project with optional child to-dos |
| `batch-json` | Bulk create/update via the [`json` URL command](https://culturedcode.com/things/support/articles/2803573/#json) — structured batch changes (see resource `things://docs/things-json-schema`) |

### Updating (requires auth token)

| Tool | Description |
|---|---|
| `update-todo` | Modify any aspect of an existing to-do by ID |
| `update-project` | Modify any aspect of an existing project by ID |

### Navigating

| Tool | Description |
|---|---|
| `show` | Navigate Things to any item, project, area, or built-in list (inbox, today, upcoming, etc.) |
| `search` | Open the Things search screen with a query |
| `get-version` | Get Things URL scheme/client version info (with app-version fallback) |

## Examples

Here are some things you can ask an AI assistant to do:

- "What's on my today list?" (uses `get-todos` with `list: "today"`)
- "Show me all my projects" (uses `get-projects`)
- "Search for tasks about groceries" (uses `get-todos` with `search: "groceries"`)
- "What tasks are in my Work area?" (uses `get-todos` with `areaId`)
- "Add milk, eggs, and bread to my inbox" (creates three separate to-dos)
- "Add a to-do to buy groceries with a checklist for milk, eggs, and bread"
- "Create a project called 'Home Renovation' with tasks for each room"
- "Schedule my task for tomorrow evening with a deadline of Friday"
- "Mark task XYZ as completed" (needs auth token)
- "Create 10 tasks for my weekly review using the JSON tool"

## How it works

**Reading data**: The read tools (`get-todos`, `get-projects`, etc.) query the Things 3 SQLite database directly in read-only mode. The database is auto-detected at `~/Library/Group Containers/JLMPQHK86H.com.culturedcode.ThingsMac/ThingsData-*/Things Database.thingsdatabase/main.sqlite`. You can override the path with the `THINGS_DB_PATH` environment variable.

**Writing data**: The write tools map each [Things URL scheme command](https://culturedcode.com/things/support/articles/2803573/) to an MCP tool:

1. The AI assistant calls a tool (e.g., `add-todo` with `title: "Buy milk"`)
2. The server builds a Things URL with the right parameters
3. If [xcall](https://github.com/martinfinke/xcall) is available, the URL is executed with x-callback-url format to capture response data; otherwise, the URL is executed via the macOS `open` command in direct format (`things:///add?...`)
4. Things processes the command and creates/updates the item

### Security notes

- Normal runtime is local-only: the server uses stdio, reads the local Things SQLite database, and invokes local macOS tools such as `open`, optional `xcall`, `sqlite3`, and `osascript`.
- The server does not make outbound network requests during normal runtime.
- Things requires `auth-token` in URL parameters for update operations. This implementation keeps token-bearing URLs scoped to the process-launch boundary, redacts them from error messages, and avoids shell interpolation for SQLite snapshotting.
- Residual risk remains that local OS/process inspection may observe child-process argv while an update command is executing.

### Response capture with xcall (optional)

By default, commands are fire-and-forget — Things processes them but doesn't return data to the server. If you install [xcall](https://github.com/martinfinke/xcall), the server will automatically use it to capture callback data like `x-things-id`, `x-things-ids`, and version fields.

## All parameters

Every parameter from the [Things URL scheme documentation](https://culturedcode.com/things/support/articles/2803573/) is supported. The tools use camelCase naming (e.g., `checklistItems` instead of `checklist-items`) which gets mapped to the correct URL parameters automatically.

### get-todos parameters

`list` (inbox, today, anytime, someday, upcoming, logbook, trash), `projectId`, `areaId`, `tag`, `status` (open, completed, canceled), `search`, `limit`

### get-todo parameters

`id` (required)

### get-projects parameters

`status` (open, completed, canceled), `areaId`, `search`, `limit`

### get-project parameters

`id` (required)

### add-todo parameters

`title`, `titles`, `notes`, `when`, `deadline`, `tags`, `checklistItems`, `list`, `listId`, `heading`, `headingId`, `completed`, `canceled`, `reveal`, `showQuickEntry`, `useClipboard`, `creationDate`, `completionDate`

### add-project parameters

`title`, `notes`, `when`, `deadline`, `tags`, `area`, `areaId`, `todos`, `completed`, `canceled`, `reveal`, `creationDate`, `completionDate`

### update-todo parameters

`id`, `title`, `notes`, `prependNotes`, `appendNotes`, `when`, `deadline`, `tags`, `addTags`, `checklistItems`, `prependChecklistItems`, `appendChecklistItems`, `list`, `listId`, `heading`, `headingId`, `completed`, `canceled`, `reveal`, `duplicate`, `creationDate`, `completionDate`

### update-project parameters

`id`, `title`, `notes`, `prependNotes`, `appendNotes`, `when`, `deadline`, `tags`, `addTags`, `area`, `areaId`, `completed`, `canceled`, `reveal`, `duplicate`, `creationDate`, `completionDate`

### show parameters

`id`, `query`, `filter` (either `id` or `query` is required)

### search parameters

`query`

### batch-json parameters

`items` (array of [Things JSON objects](https://culturedcode.com/things/support/articles/2803573/#json)), `reveal`

The MCP resource **`things://docs/things-json-schema`** summarizes the structure expected by Things (aligned with [ThingsJSONCoder](https://github.com/culturedcode/ThingsJSONCoder)).

## Development

```bash
# Install dependencies
npm install

# Run with hot reload
npm run dev

# Run tests
npm test

# Build for npm
npm run build
```

## CI and npm release automation

- CI runs on GitHub Actions for all pushes to `main` and all pull requests:
  - `npm ci`
  - `npm test`
  - `npm run build`
- Versioning and tagging are automated via `.github/workflows/release-please.yml`:
  - Runs on pushes to `main`
  - Opens/updates a Release PR with version bump + changelog
  - When the Release PR is merged, it creates the version tag and GitHub Release
- npm publishing runs as part of the same `release-please.yml` workflow:
  - When the Release PR is merged and a GitHub Release is created, the workflow continues to build and publish
  - Publishes with provenance to npm (`npm publish --access public --provenance`)

### One-time setup

1. Ensure GitHub Actions are enabled for this repository.
2. Choose one publish auth method:
   - Recommended: npm Trusted Publishing for `@nkootstra/things-mcp`
     - npm → Package Settings → Trusted publishers → add this GitHub repository/workflow.
   - Token fallback: add repository secret `NPM_TOKEN`
     - Create an npm automation token with publish access to scope `@nkootstra`.
     - Add it in GitHub: Settings → Secrets and variables → Actions → New repository secret.

### Normal release flow (fully automated)

1. Merge changes into `main`.
2. Review and merge the automated Release PR from Release Please.
3. The same workflow creates the GitHub Release, builds the package, and publishes to npm.

### Commit message examples for Release Please

Use Conventional Commit style so release notes/versioning stay clean:

- `feat: add quick-entry support to add-todo`
- `fix: handle x-things-ids callback from json command`
- `chore: update docs for npm install examples`

## License

MIT

# Things `json` command — payload schema (agent summary)

This document summarizes the JSON array passed as the `data` query parameter to **`things:///json`** (MCP tool **`batch-json`**, field **`items`**). It aligns with Cultured Code’s reference types in [**ThingsJSONCoder**](https://github.com/culturedcode/ThingsJSONCoder) (`ThingsJSON.swift`) and the [Things URL scheme — json](https://culturedcode.com/things/support/articles/2803573/#json) article.

## Top level

- The payload is a **JSON array** of objects.
- Each top-level element must have **`type`** `"to-do"` or **`project`** only (see `TJSContainer.Item` in ThingsJSONCoder). **`heading`** and **`checklist-item`** must not appear at the root.

## Every object (all levels)

Each encoded item is an object with:

| Field | Required | Notes |
|-------|----------|--------|
| `type` | yes | Discriminator string (see below per context). |
| `attributes` | yes | Object holding fields for that type (may be empty `{}`). |
| `operation` | no | `"create"` (default) or `"update"`. |
| `id` | if updating | Non-empty string when `operation` is `"update"`. |

No other keys should appear on these objects (matches the Swift coders).

## `to-do`

`attributes` may include (all optional unless noted), using **kebab-case** keys as in Things / ThingsJSONCoder:

- `title`, `notes`, `prepend-notes`, `append-notes`, `when`, `deadline`
- `tag-ids` (array of strings), `tags` (array of strings), `add-tags` (array of strings)
- `checklist-items`, `prepend-checklist-items`, `append-checklist-items` — arrays of **`checklist-item`** objects (each has `type`: `"checklist-item"` and `attributes`)
- `list-id`, `list`, `heading-id`, `heading`
- `completed`, `canceled` (booleans)
- `creation-date`, `completion-date` — ISO8601 strings / dates as in Things

## `project`

- Same scheduling/tag/notes fields as to-dos where applicable: `title`, `notes`, `prepend-notes`, `append-notes`, `when`, `deadline`, `tag-ids`, `tags`, `add-tags`, `area-id`, `area`, `completed`, `canceled`, `creation-date`, `completion-date`
- **`items`** — optional array of **`to-do`** or **`heading`** objects only (`TJSProject.Item`). Nested **`project`** is not allowed here.

## `heading`

- Use **inside** `project.attributes.items` only.
- `attributes`: e.g. `title`, `archived`, `creation-date`, `completion-date`

## `checklist-item`

- Use **inside** a to-do’s `checklist-items` (or prepend/append) arrays only.
- `attributes`: e.g. `title`, `completed`, `canceled`, `creation-date`, `completion-date`

## Auth and URL

- If **any** object in the tree has `"operation": "update"`, Things requires **`auth-token`** — set **`THINGS_AUTH_TOKEN`** for the MCP server.
- Optional URL flag: **`reveal`** (boolean) — open the first created item.

## Callbacks (xcall)

On success, Things may return **`x-things-ids`** (JSON array of IDs for top-level created items). Nested IDs inside a project are not all returned separately — see the official article.

## Deprecated naming

Cultured Code’s older examples used **`things:///add-json`**; use the **`json`** command with **`data`** instead.

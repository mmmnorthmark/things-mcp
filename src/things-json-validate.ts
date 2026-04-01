/**
 * Validates payloads for Things’ `json` URL command against the structure
 * encoded/decoded by Cultured Code’s [ThingsJSONCoder](https://github.com/culturedcode/ThingsJSONCoder)
 * (Swift reference implementation).
 */

export type ThingsJsonValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

const MAX_ERRORS = 40;

/** Top-level array: only `to-do` and `project` (TJSContainer.Item). */
const TOP_LEVEL_TYPES = new Set(["to-do", "project"]);

/** Inside `project.attributes.items`: only `to-do` and `heading` (TJSProject.Item). */
const PROJECT_ITEM_TYPES = new Set(["to-do", "heading"]);

const THING_OBJECT_KEYS = new Set(["type", "operation", "id", "attributes"]);

type Context = "top" | "project" | "checklist";

/**
 * Validates the `items` array passed to the `batch-json` tool (same as the `data` JSON array for `things:///json`).
 */
export function validateThingsJsonItems(items: unknown): ThingsJsonValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(items)) {
    return { ok: false, errors: ["Expected a JSON array at the root (top-level `items`)."] };
  }

  items.forEach((entry, i) => {
    validateThingObject(entry, `items[${i}]`, "top", errors);
  });

  if (errors.length === 0) {
    return { ok: true };
  }
  return { ok: false, errors };
}

function push(errors: string[], path: string, message: string): void {
  if (errors.length >= MAX_ERRORS) {
    return;
  }
  errors.push(`${path}: ${message}`);
}

function validateThingObject(
  value: unknown,
  path: string,
  context: Context,
  errors: string[],
): void {
  if (errors.length >= MAX_ERRORS) {
    return;
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    push(errors, path, "expected an object with `type` and `attributes`");
    return;
  }

  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!THING_OBJECT_KEYS.has(key)) {
      push(
        errors,
        path,
        `unknown key "${key}" — each object may only include type, operation, id, and attributes (ThingsJSONCoder model)`,
      );
    }
  }

  const type = obj["type"];
  if (typeof type !== "string" || type.length === 0) {
    push(errors, path, '`type` must be a non-empty string (e.g. "to-do", "project", "heading", "checklist-item")');
    return;
  }

  const op = obj["operation"];
  if (op !== undefined && op !== "create" && op !== "update") {
    push(errors, path, '`operation` must be "create", "update", or omitted (defaults to create)');
  }

  if (op === "update") {
    const id = obj["id"];
    if (typeof id !== "string" || id.length === 0) {
      push(errors, path, '`operation`: "update" requires a non-empty string `id`');
    }
  }

  if (!("attributes" in obj)) {
    push(errors, path, 'missing `attributes` object (required by the Things JSON format)');
    return;
  }

  const attributes = obj["attributes"];
  if (attributes === null || typeof attributes !== "object" || Array.isArray(attributes)) {
    push(errors, path, "`attributes` must be an object");
    return;
  }

  if (context === "top") {
    if (!TOP_LEVEL_TYPES.has(type)) {
      if (type === "heading") {
        push(
          errors,
          path,
          'type "heading" is not valid at the top level — headings belong inside `project.attributes.items` (see ThingsJSONCoder TJSContainer.Item)',
        );
      } else if (type === "checklist-item") {
        push(
          errors,
          path,
          'type "checklist-item" is not valid at the top level — use it inside `to-do.attributes["checklist-items"]`',
        );
      } else {
        push(
          errors,
          path,
          `type "${type}" is not valid at the top level — only "to-do" and "project" are allowed (ThingsJSONCoder)`,
        );
      }
      return;
    }
  } else if (context === "project") {
    if (!PROJECT_ITEM_TYPES.has(type)) {
      if (type === "project") {
        push(errors, path, 'nested "project" is not allowed inside `project.attributes.items`');
      } else if (type === "checklist-item") {
        push(
          errors,
          path,
          'type "checklist-item" is not valid here — use it under a to-do\'s `checklist-items` array',
        );
      } else {
        push(
          errors,
          path,
          `type "${type}" is not valid inside a project — only "to-do" and "heading" are allowed`,
        );
      }
      return;
    }
  } else if (context === "checklist") {
    if (type !== "checklist-item") {
      push(errors, path, `expected type "checklist-item" (got "${type}")`);
      return;
    }
  }

  const attrPath = `${path}.attributes`;

  if (type === "to-do") {
    validateTodoAttributes(attributes as Record<string, unknown>, attrPath, errors);
  } else if (type === "project") {
    validateProjectAttributes(attributes as Record<string, unknown>, attrPath, errors);
  } else if (type === "heading") {
    validateHeadingAttributes(attributes as Record<string, unknown>, attrPath, errors);
  } else if (type === "checklist-item") {
    validateChecklistItemAttributes(attributes as Record<string, unknown>, attrPath, errors);
  }
}

function validateTodoAttributes(
  attrs: Record<string, unknown>,
  path: string,
  errors: string[],
): void {
  const checklists = [
    "checklist-items",
    "prepend-checklist-items",
    "append-checklist-items",
  ] as const;

  for (const key of checklists) {
    const arr = attrs[key];
    if (arr === undefined) continue;
    if (!Array.isArray(arr)) {
      push(errors, path, '`' + key + "` must be an array of checklist-item objects");
      continue;
    }
    arr.forEach((item, j) => {
      validateThingObject(item, `${path}.${key}[${j}]`, "checklist", errors);
    });
  }
}

function validateProjectAttributes(
  attrs: Record<string, unknown>,
  path: string,
  errors: string[],
): void {
  const items = attrs["items"];
  if (items === undefined) return;
  if (!Array.isArray(items)) {
    push(errors, path, "`items` must be an array of to-do and heading objects");
    return;
  }
  items.forEach((item, i) => {
    validateThingObject(item, `${path}.items[${i}]`, "project", errors);
  });
}

function validateHeadingAttributes(_attrs: Record<string, unknown>, _path: string, _errors: string[]): void {
  // Optional fields only; structure is enforced at object level.
}

function validateChecklistItemAttributes(_attrs: Record<string, unknown>, _path: string, _errors: string[]): void {
  // Optional fields only.
}

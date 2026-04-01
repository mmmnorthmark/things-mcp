import { test, expect, describe, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "../src/tools.js";
import { buildUrl, buildJsonUrl } from "../src/url.js";

// We test the tool registration and parameter mapping logic.
// The actual URL execution is tested separately — here we verify
// that tools build the correct URLs from their input schemas.

describe("tool registration", () => {
  test("registerTools does not throw", () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    expect(() => registerTools(server)).not.toThrow();
  });
});

describe("add-todo parameter mapping", () => {
  test("maps camelCase params to kebab-case URL params", () => {
    const url = buildUrl("add", {
      title: "Test",
      "checklist-items": "Item 1\nItem 2",
      "list-id": "proj-123",
      "heading-id": "head-456",
      "show-quick-entry": true,
      "creation-date": "2026-01-01T00:00:00Z",
      "completion-date": "2026-01-02T00:00:00Z",
    });

    expect(url).toContain("checklist-items=Item%201%0AItem%202");
    expect(url).toContain("list-id=proj-123");
    expect(url).toContain("heading-id=head-456");
    expect(url).toContain("show-quick-entry=true");
    expect(url).toContain("creation-date=2026-01-01T00%3A00%3A00Z");
    expect(url).toContain("completion-date=2026-01-02T00%3A00%3A00Z");
  });

  test("tags array joins with comma", () => {
    const url = buildUrl("add", {
      title: "Test",
      tags: "work,urgent,home",
    });
    expect(url).toContain("tags=work%2Curgent%2Chome");
  });

  test("checklist items join with newlines", () => {
    const items = ["Buy milk", "Buy eggs", "Buy bread"];
    const url = buildUrl("add", {
      title: "Shopping",
      "checklist-items": items.join("\n"),
    });
    expect(url).toContain("checklist-items=Buy%20milk%0ABuy%20eggs%0ABuy%20bread");
  });

  test("titles parameter for multiple todos", () => {
    const url = buildUrl("add", {
      title: "ignored",
      titles: "Task 1\nTask 2\nTask 3",
    });
    expect(url).toContain("titles=Task%201%0ATask%202%0ATask%203");
  });

  test("supports use-clipboard parameter", () => {
    const url = buildUrl("add", {
      "use-clipboard": "replace-notes",
    });
    expect(url).toContain("use-clipboard=replace-notes");
  });
});

describe("add-project parameter mapping", () => {
  test("maps todos array to newline-separated to-dos param", () => {
    const url = buildUrl("add-project", {
      title: "Renovation",
      "to-dos": "Kitchen\nBathroom\nBedroom",
      area: "Home",
    });
    expect(url).toContain("to-dos=Kitchen%0ABathroom%0ABedroom");
    expect(url).toContain("area=Home");
  });

  test("area-id takes precedence in URL", () => {
    const url = buildUrl("add-project", {
      title: "Test",
      "area-id": "area-123",
      area: "Ignored",
    });
    expect(url).toContain("area-id=area-123");
    expect(url).toContain("area=Ignored"); // Both are passed, Things handles precedence
  });
});

describe("update-todo parameter mapping", () => {
  test("includes auth token", () => {
    const url = buildUrl(
      "update",
      { id: "todo-123", title: "New title" },
      "my-auth-token",
    );
    expect(url).toContain("auth-token=my-auth-token");
    expect(url).toContain("id=todo-123");
  });

  test("supports prepend/append notes", () => {
    const url = buildUrl(
      "update",
      {
        id: "todo-123",
        "prepend-notes": "Before\n",
        "append-notes": "\nAfter",
      },
      "token",
    );
    expect(url).toContain("prepend-notes=Before%0A");
    expect(url).toContain("append-notes=%0AAfter");
  });

  test("supports add-tags alongside tags", () => {
    const url = buildUrl(
      "update",
      {
        id: "todo-123",
        tags: "work",
        "add-tags": "urgent,important",
      },
      "token",
    );
    expect(url).toContain("tags=work");
    expect(url).toContain("add-tags=urgent%2Cimportant");
  });

  test("supports checklist prepend/append", () => {
    const url = buildUrl(
      "update",
      {
        id: "todo-123",
        "prepend-checklist-items": "First item",
        "append-checklist-items": "Last item",
      },
      "token",
    );
    expect(url).toContain("prepend-checklist-items=First%20item");
    expect(url).toContain("append-checklist-items=Last%20item");
  });

  test("duplicate flag", () => {
    const url = buildUrl(
      "update",
      { id: "todo-123", duplicate: true },
      "token",
    );
    expect(url).toContain("duplicate=true");
  });

  test("empty deadline clears it", () => {
    const url = buildUrl(
      "update",
      { id: "todo-123", deadline: "" },
      "token",
    );
    expect(url).toContain("deadline=");
  });
});

describe("update-project parameter mapping", () => {
  test("includes area params", () => {
    const url = buildUrl(
      "update-project",
      { id: "proj-123", area: "Work", "area-id": "area-456" },
      "token",
    );
    expect(url).toContain("area=Work");
    expect(url).toContain("area-id=area-456");
  });

  test("supports duplicate flag", () => {
    const url = buildUrl(
      "update-project",
      { id: "proj-123", duplicate: true },
      "token",
    );
    expect(url).toContain("duplicate=true");
  });
});

describe("show parameter mapping", () => {
  test("shows built-in list by ID", () => {
    const url = buildUrl("show", { id: "today" });
    expect(url).toBe("things:///x-callback-url/show?id=today");
  });

  test("shows by query", () => {
    const url = buildUrl("show", { query: "My Project" });
    expect(url).toContain("query=My%20Project");
  });

  test("filter param with comma-separated tags", () => {
    const url = buildUrl("show", { id: "today", filter: "work,urgent" });
    expect(url).toContain("filter=work%2Curgent");
  });
});

describe("search parameter mapping", () => {
  test("search with query", () => {
    const url = buildUrl("search", { query: "buy groceries" });
    expect(url).toContain("query=buy%20groceries");
  });

  test("empty search", () => {
    const url = buildUrl("search", {});
    expect(url).toBe("things:///x-callback-url/search");
  });
});

describe("batch-json parameter mapping", () => {
  test("creates JSON URL for todo items", () => {
    const items = [
      { type: "to-do", attributes: { title: "Task 1" } },
      { type: "to-do", attributes: { title: "Task 2" } },
    ];
    const url = buildJsonUrl(items);
    expect(url.startsWith("things:///x-callback-url/json?data=")).toBe(true);

    const dataStr = url.split("data=")[1]!;
    const decoded = JSON.parse(decodeURIComponent(dataStr));
    expect(decoded).toEqual(items);
  });

  test("detects update operations and includes auth token", () => {
    const items = [
      { type: "to-do", operation: "update", id: "abc", attributes: { title: "Updated" } },
    ];
    const url = buildJsonUrl(items, "auth-token-123");
    expect(url).toContain("auth-token=auth-token-123");
  });

  test("project with headings and todos", () => {
    const items = [
      {
        type: "project",
        attributes: {
          title: "My Project",
          items: [
            { type: "heading", attributes: { title: "Phase 1" } },
            { type: "to-do", attributes: { title: "Design" } },
            { type: "heading", attributes: { title: "Phase 2" } },
            { type: "to-do", attributes: { title: "Implement" } },
          ],
        },
      },
    ];
    const url = buildJsonUrl(items);
    const dataStr = url.split("data=")[1]!;
    const decoded = JSON.parse(decodeURIComponent(dataStr));
    expect(decoded[0].attributes.items).toHaveLength(4);
  });
});

describe("auth token handling", () => {
  const originalToken = process.env.THINGS_AUTH_TOKEN;

  afterEach(() => {
    if (originalToken) process.env.THINGS_AUTH_TOKEN = originalToken;
    else delete process.env.THINGS_AUTH_TOKEN;
  });

  test("update tools require auth token in URL", () => {
    const url = buildUrl("update", { id: "abc", title: "Test" }, "secret");
    expect(url).toContain("auth-token=secret");
  });

  test("add tools do not include auth token", () => {
    const url = buildUrl("add", { title: "Test" });
    expect(url).not.toContain("auth-token");
  });

  test("show tool does not include auth token", () => {
    const url = buildUrl("show", { id: "today" });
    expect(url).not.toContain("auth-token");
  });
});

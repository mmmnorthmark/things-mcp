import { test, expect, describe } from "vitest";
import {
  _parseXcallOutput,
  _buildProcessError,
  buildUrl,
  buildJsonUrl,
  redactAuthToken,
  requireAuthToken,
  toDirectUrl,
  jsonPayloadRequiresAuthToken,
  MAX_THINGS_JSON_URL_LENGTH,
} from "../src/url.js";

describe("buildUrl", () => {
  test("simple add with title", () => {
    const url = buildUrl("add", { title: "Buy milk" });
    expect(url).toBe("things:///x-callback-url/add?title=Buy%20milk");
  });

  test("add with multiple params", () => {
    const url = buildUrl("add", {
      title: "Meeting notes",
      notes: "Discuss Q1 goals",
      when: "today",
    });
    expect(url).toContain("title=Meeting%20notes");
    expect(url).toContain("notes=Discuss%20Q1%20goals");
    expect(url).toContain("when=today");
  });

  test("omits undefined values", () => {
    const url = buildUrl("add", {
      title: "Test",
      notes: undefined,
      deadline: undefined,
    });
    expect(url).toBe("things:///x-callback-url/add?title=Test");
  });

  test("handles boolean true", () => {
    const url = buildUrl("add", { title: "Done", completed: true });
    expect(url).toContain("completed=true");
  });

  test("handles boolean false", () => {
    const url = buildUrl("add", { title: "Not done", completed: false });
    expect(url).toContain("completed=false");
  });

  test("includes auth token when provided", () => {
    const url = buildUrl("update", { id: "abc123", title: "Updated" }, "my-token");
    expect(url).toContain("auth-token=my-token");
    expect(url).toContain("id=abc123");
    expect(url).toContain("title=Updated");
  });

  test("auth token appears first in URL", () => {
    const url = buildUrl("update", { id: "abc" }, "token123");
    expect(url).toMatch(/\?auth-token=token123&/);
  });

  test("encodes special characters in values", () => {
    const url = buildUrl("add", { title: "Buy milk & eggs" });
    expect(url).toContain("title=Buy%20milk%20%26%20eggs");
  });

  test("encodes newlines in checklist items", () => {
    const items = "Item 1\nItem 2\nItem 3";
    const url = buildUrl("add", { "checklist-items": items });
    expect(url).toContain("checklist-items=Item%201%0AItem%202%0AItem%203");
  });

  test("encodes comma-separated tags", () => {
    const url = buildUrl("add", { title: "Test", tags: "work,urgent" });
    expect(url).toContain("tags=work%2Curgent");
  });

  test("show command with built-in list ID", () => {
    const url = buildUrl("show", { id: "today" });
    expect(url).toBe("things:///x-callback-url/show?id=today");
  });

  test("show command with all built-in list IDs", () => {
    const lists = [
      "inbox", "today", "anytime", "upcoming", "someday",
      "logbook", "tomorrow", "deadlines", "repeating",
      "all-projects", "logged-projects",
    ];
    for (const id of lists) {
      const url = buildUrl("show", { id });
      expect(url).toContain(`id=${id}`);
    }
  });

  test("search command", () => {
    const url = buildUrl("search", { query: "groceries" });
    expect(url).toBe("things:///x-callback-url/search?query=groceries");
  });

  test("version command with no params", () => {
    const url = buildUrl("version", {});
    expect(url).toBe("things:///x-callback-url/version");
  });

  test("add-project command", () => {
    const url = buildUrl("add-project", {
      title: "Home Renovation",
      "to-dos": "Kitchen\nBathroom\nBedroom",
      area: "Home",
    });
    expect(url).toContain("title=Home%20Renovation");
    expect(url).toContain("to-dos=Kitchen%0ABathroom%0ABedroom");
    expect(url).toContain("area=Home");
  });

  test("update command requires auth token in params", () => {
    const url = buildUrl(
      "update",
      { id: "xyz", "append-notes": "Added later" },
      "secret-token",
    );
    expect(url).toContain("auth-token=secret-token");
    expect(url).toContain("append-notes=Added%20later");
  });

  test("encodes unicode characters", () => {
    const url = buildUrl("add", { title: "Acheter du lait" });
    expect(url).toContain("title=Acheter%20du%20lait");
  });

  test("handles empty string values", () => {
    const url = buildUrl("update", { id: "abc", deadline: "" }, "token");
    expect(url).toContain("deadline=");
  });

  test("datetime when parameter", () => {
    const url = buildUrl("add", { title: "Meeting", when: "2026-03-15@14:00" });
    expect(url).toContain("when=2026-03-15%4014%3A00");
  });

  test("ISO8601 creation-date parameter", () => {
    const url = buildUrl("add", {
      title: "Old task",
      "creation-date": "2026-01-01T09:00:00Z",
    });
    expect(url).toContain("creation-date=2026-01-01T09%3A00%3A00Z");
  });

  test("add supports use-clipboard without title", () => {
    const url = buildUrl("add", {
      "use-clipboard": "replace-title",
      "show-quick-entry": true,
    });
    expect(url).toContain("use-clipboard=replace-title");
    expect(url).toContain("show-quick-entry=true");
    expect(url).not.toContain("title=");
  });
});

describe("buildJsonUrl", () => {
  test("encodes single todo item", () => {
    const items = [
      {
        type: "to-do",
        attributes: { title: "Buy milk" },
      },
    ];
    const url = buildJsonUrl(items);
    expect(url.startsWith("things:///x-callback-url/json?data=")).toBe(true);
    // Verify the data can be decoded back
    const dataParam = url.split("data=")[1]!;
    const decoded = JSON.parse(decodeURIComponent(dataParam));
    expect(decoded).toEqual(items);
  });

  test("encodes multiple items", () => {
    const items = [
      { type: "to-do", attributes: { title: "Task 1" } },
      { type: "to-do", attributes: { title: "Task 2" } },
    ];
    const url = buildJsonUrl(items);
    const dataParam = url.split("data=")[1]!;
    const decoded = JSON.parse(decodeURIComponent(dataParam));
    expect(decoded).toHaveLength(2);
  });

  test("includes auth token", () => {
    const items = [{ type: "to-do", operation: "update", id: "abc" }];
    const url = buildJsonUrl(items, "my-token");
    expect(url).toContain("auth-token=my-token");
  });

  test("includes reveal flag", () => {
    const items = [{ type: "to-do", attributes: { title: "Test" } }];
    const url = buildJsonUrl(items, undefined, true);
    expect(url).toContain("reveal=true");
  });

  test("includes both auth token and reveal", () => {
    const items = [{ type: "to-do", attributes: { title: "Test" } }];
    const url = buildJsonUrl(items, "token", true);
    expect(url).toContain("auth-token=token");
    expect(url).toContain("reveal=true");
  });

  test("no auth token or reveal produces clean URL", () => {
    const items = [{ type: "to-do", attributes: { title: "Test" } }];
    const url = buildJsonUrl(items);
    expect(url).not.toContain("auth-token");
    expect(url).not.toContain("reveal");
  });

  test("encodes project with nested items", () => {
    const items = [
      {
        type: "project",
        attributes: {
          title: "Renovation",
          items: [
            { type: "to-do", attributes: { title: "Kitchen" } },
            { type: "heading", attributes: { title: "Phase 2" } },
            { type: "to-do", attributes: { title: "Bathroom" } },
          ],
        },
      },
    ];
    const url = buildJsonUrl(items);
    const dataParam = url.split("data=")[1]!;
    const decoded = JSON.parse(decodeURIComponent(dataParam));
    expect(decoded[0].attributes.items).toHaveLength(3);
  });

  test("encodes checklist items within todo", () => {
    const items = [
      {
        type: "to-do",
        attributes: {
          title: "Shopping",
          "checklist-items": [
            { type: "checklist-item", attributes: { title: "Milk", completed: false } },
            { type: "checklist-item", attributes: { title: "Eggs", completed: true } },
          ],
        },
      },
    ];
    const url = buildJsonUrl(items);
    const dataParam = url.split("data=")[1]!;
    const decoded = JSON.parse(decodeURIComponent(dataParam));
    expect(decoded[0].attributes["checklist-items"]).toHaveLength(2);
  });

  test("encodes unicode titles and round-trips", () => {
    const items = [{ type: "to-do", attributes: { title: "Buy crépes" } }];
    const url = buildJsonUrl(items);
    const dataParam = url.split("data=")[1]!.split("&")[0]!;
    const decoded = JSON.parse(decodeURIComponent(dataParam));
    expect(decoded[0].attributes.title).toBe("Buy crépes");
  });

  test("throws when json URL exceeds maximum length", () => {
    const items = [
      {
        type: "to-do",
        attributes: { title: "x".repeat(MAX_THINGS_JSON_URL_LENGTH) },
      },
    ];
    expect(() => buildJsonUrl(items)).toThrow(/exceeds maximum length/);
  });
});

describe("jsonPayloadRequiresAuthToken", () => {
  test("false for create-only top-level array", () => {
    expect(
      jsonPayloadRequiresAuthToken([
        { type: "to-do", attributes: { title: "A" } },
        { type: "project", attributes: { title: "P" } },
      ]),
    ).toBe(false);
  });

  test("true when top-level item has operation update", () => {
    expect(
      jsonPayloadRequiresAuthToken([
        { type: "to-do", operation: "update", id: "abc", attributes: {} },
      ]),
    ).toBe(true);
  });

  test("true when nested project item has operation update", () => {
    expect(
      jsonPayloadRequiresAuthToken([
        {
          type: "project",
          attributes: {
            title: "P",
            items: [{ type: "to-do", operation: "update", id: "nested", attributes: {} }],
          },
        },
      ]),
    ).toBe(true);
  });
});

describe("toDirectUrl", () => {
  test("converts x-callback-url format to direct format", () => {
    expect(toDirectUrl("things:///x-callback-url/add?title=Buy%20milk"))
      .toBe("things:///add?title=Buy%20milk");
  });

  test("converts command without query params", () => {
    expect(toDirectUrl("things:///x-callback-url/version"))
      .toBe("things:///version");
  });

  test("converts json command URL", () => {
    expect(toDirectUrl("things:///x-callback-url/json?data=%5B%5D"))
      .toBe("things:///json?data=%5B%5D");
  });

  test("preserves all query parameters", () => {
    const url = "things:///x-callback-url/add?auth-token=tok&title=Test&when=today";
    expect(toDirectUrl(url)).toBe("things:///add?auth-token=tok&title=Test&when=today");
  });

  test("returns direct URL unchanged", () => {
    expect(toDirectUrl("things:///add?title=Test"))
      .toBe("things:///add?title=Test");
  });
});

describe("redactAuthToken", () => {
  test("redacts auth token from update URL", () => {
    const url = buildUrl("update", { id: "abc123", title: "Updated" }, "secret-token");
    expect(redactAuthToken(url)).toContain("auth-token=[REDACTED]");
    expect(redactAuthToken(url)).not.toContain("secret-token");
  });

  test("redacts auth token from json URL", () => {
    const url = buildJsonUrl([{ type: "to-do", operation: "update", id: "abc" }], "secret-token");
    expect(redactAuthToken(url)).toContain("auth-token=[REDACTED]");
    expect(redactAuthToken(url)).not.toContain("secret-token");
  });

  test("leaves URLs without auth token unchanged", () => {
    const url = buildUrl("show", { id: "today" });
    expect(redactAuthToken(url)).toBe(url);
  });
});

describe("requireAuthToken", () => {
  const originalEnv = process.env.THINGS_AUTH_TOKEN;

  test("returns token when set", () => {
    process.env.THINGS_AUTH_TOKEN = "test-token";
    expect(requireAuthToken()).toBe("test-token");
    // Restore
    if (originalEnv) process.env.THINGS_AUTH_TOKEN = originalEnv;
    else delete process.env.THINGS_AUTH_TOKEN;
  });

  test("throws when not set", () => {
    const saved = process.env.THINGS_AUTH_TOKEN;
    delete process.env.THINGS_AUTH_TOKEN;
    expect(() => requireAuthToken()).toThrow("THINGS_AUTH_TOKEN");
    // Restore
    if (saved) process.env.THINGS_AUTH_TOKEN = saved;
  });

  test("error message includes setup instructions", () => {
    const saved = process.env.THINGS_AUTH_TOKEN;
    delete process.env.THINGS_AUTH_TOKEN;
    try {
      requireAuthToken();
    } catch (e) {
      expect((e as Error).message).toContain("Settings");
      expect((e as Error).message).toContain("Enable Things URLs");
    }
    if (saved) process.env.THINGS_AUTH_TOKEN = saved;
  });
});

describe("_parseXcallOutput", () => {
  test("parses callback JSON with single x-things-id", () => {
    const result = _parseXcallOutput('{"x-things-id":"abc123"}');
    expect(result.callbackParams?.["x-things-id"]).toBe("abc123");
    expect(result.thingsId).toBe("abc123");
  });

  test("parses callback JSON with x-things-ids string", () => {
    const result = _parseXcallOutput('{"x-things-ids":"one,two"}');
    expect(result.callbackParams?.["x-things-ids"]).toBe("one,two");
    expect(result.thingsId).toBe("one,two");
  });

  test("parses callback JSON with x-things-ids as JSON array", () => {
    const result = _parseXcallOutput('{"x-things-ids":["a","b"]}');
    expect(result.callbackParams?.["x-things-ids"]).toBe('["a","b"]');
    expect(result.thingsId).toBe('["a","b"]');
  });

  test("falls back to raw output", () => {
    const result = _parseXcallOutput("abc123");
    expect(result.thingsId).toBe("abc123");
    expect(result.callbackParams).toBeUndefined();
  });
});

describe("_buildProcessError", () => {
  test("does not leak auth token in error message", () => {
    const url = buildUrl("update", { id: "abc123" }, "secret-token");
    const message = _buildProcessError("xcall", 1, `failed to open ${url}`, url);
    expect(message).not.toContain("secret-token");
    expect(message).not.toContain("auth-token=");
    expect(message).toContain("xcall failed with code 1");
  });
});

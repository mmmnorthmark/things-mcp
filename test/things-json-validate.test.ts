import { test, expect, describe } from "vitest";
import { validateThingsJsonItems } from "../src/things-json-validate.js";

describe("validateThingsJsonItems", () => {
  test("accepts valid top-level to-do and project", () => {
    expect(
      validateThingsJsonItems([
        { type: "to-do", attributes: { title: "A" } },
        { type: "project", attributes: { title: "P", items: [] } },
      ]),
    ).toEqual({ ok: true });
  });

  test("rejects non-array root", () => {
    const r = validateThingsJsonItems({ type: "to-do", attributes: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain("JSON array");
  });

  test("rejects heading at top level", () => {
    const r = validateThingsJsonItems([{ type: "heading", attributes: { title: "H" } }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.includes("heading"))).toBe(true);
  });

  test("rejects project nested inside project items", () => {
    const r = validateThingsJsonItems([
      {
        type: "project",
        attributes: {
          title: "Outer",
          items: [{ type: "project", attributes: { title: "Bad" } }],
        },
      },
    ]);
    expect(r.ok).toBe(false);
  });

  test("rejects unknown keys on object", () => {
    const r = validateThingsJsonItems([
      Object.assign({ type: "to-do", attributes: {} }, { extra: 1 }),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.includes("unknown key"))).toBe(true);
  });

  test("requires id for update operation", () => {
    const r = validateThingsJsonItems([
      { type: "to-do", operation: "update", attributes: { title: "x" } },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.includes("id"))).toBe(true);
  });

  test("accepts nested update with id", () => {
    expect(
      validateThingsJsonItems([
        {
          type: "project",
          attributes: {
            title: "P",
            items: [
              { type: "to-do", operation: "update", id: "abc", attributes: { title: "T" } },
            ],
          },
        },
      ]),
    ).toEqual({ ok: true });
  });
});

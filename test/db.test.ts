import { test, expect, describe, beforeAll, beforeEach, afterEach } from "vitest";
import { initSql, createAdapter, type SqliteAdapter } from "../src/sqlite-adapter.js";
import {
  coreDataTimestampToISO,
  dateToThingsDate,
  thingsDateToISO,
  todayAsThingsDate,
  _buildSqliteBackupCommand,
  _setDb,
  queryTodos,
  queryTodoById,
  queryProjects,
  queryProjectById,
  queryAreas,
  queryTags,
} from "../src/db.js";

// --- Date Utilities ---

describe("coreDataTimestampToISO", () => {
  test("converts Core Data epoch (0) to 2001-01-01T00:00:00.000Z", () => {
    expect(coreDataTimestampToISO(0)).toBe("2001-01-01T00:00:00.000Z");
  });

  test("converts a known timestamp", () => {
    // 2024-01-15T12:00:00Z: Unix 1705320000 - Core Data epoch 978307200 = 727012800
    const result = coreDataTimestampToISO(727012800);
    expect(result).toBe("2024-01-15T12:00:00.000Z");
  });
});

describe("dateToThingsDate", () => {
  test("encodes 2021-03-28 to 132464128", () => {
    expect(dateToThingsDate(2021, 3, 28)).toBe(132464128);
  });

  test("encodes year/month/day using bit-packing", () => {
    expect(dateToThingsDate(2026, 3, 23)).toBe((2026 << 16) | (3 << 12) | (23 << 7));
  });
});

describe("thingsDateToISO", () => {
  test("decodes 132464128 to 2021-03-28", () => {
    expect(thingsDateToISO(132464128)).toBe("2021-03-28");
  });

  test("round-trips through dateToThingsDate", () => {
    expect(thingsDateToISO(dateToThingsDate(2026, 3, 23))).toBe("2026-03-23");
  });

  test("handles single-digit month and day with zero-padding", () => {
    expect(thingsDateToISO(dateToThingsDate(2024, 1, 5))).toBe("2024-01-05");
  });
});

describe("todayAsThingsDate", () => {
  test("returns a positive integer", () => {
    expect(todayAsThingsDate()).toBeGreaterThan(0);
  });

  test("round-trips to today's date", () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(thingsDateToISO(todayAsThingsDate())).toBe(expected);
  });
});

describe("_buildSqliteBackupCommand", () => {
  test("treats the backup path as literal command data", () => {
    const tmpFile = "/tmp/backup'\";touch /tmp/pwned;echo '.sqlite";
    expect(_buildSqliteBackupCommand(tmpFile)).toBe(`.backup ${tmpFile}`);
  });
});

// --- Database Query Tests ---

beforeAll(async () => {
  await initSql();
});

let testDb: SqliteAdapter;

function seedDatabase(db: SqliteAdapter): void {
  const todayThingsDate = todayAsThingsDate();
  const pastThingsDate = dateToThingsDate(2020, 1, 1);
  const futureThingsDate = dateToThingsDate(2040, 12, 31);

  // Create schema matching Things 3
  db.exec(`
    CREATE TABLE TMArea (
      uuid TEXT PRIMARY KEY,
      title TEXT,
      visible INTEGER DEFAULT 1,
      "index" INTEGER DEFAULT 0
    );

    CREATE TABLE TMTag (
      uuid TEXT PRIMARY KEY,
      title TEXT,
      shortcut TEXT,
      parent TEXT
    );

    CREATE TABLE TMTask (
      uuid TEXT PRIMARY KEY,
      title TEXT,
      notes TEXT,
      type INTEGER DEFAULT 0,
      status INTEGER DEFAULT 0,
      start INTEGER DEFAULT 0,
      startDate INTEGER,
      deadline INTEGER,
      todayIndex INTEGER DEFAULT 0,
      project TEXT,
      area TEXT,
      heading TEXT,
      trashed INTEGER DEFAULT 0,
      creationDate REAL DEFAULT 0,
      userModificationDate REAL,
      stopDate REAL,
      "index" INTEGER DEFAULT 0,
      rt1_recurrenceRule TEXT,
      deadlineSuppressionDate REAL
    );

    CREATE TABLE TMTaskTag (
      tasks TEXT,
      tags TEXT
    );

    CREATE TABLE TMChecklistItem (
      uuid TEXT PRIMARY KEY,
      title TEXT,
      status INTEGER DEFAULT 0,
      task TEXT,
      "index" INTEGER DEFAULT 0
    );
  `);

  // Seed areas
  db.exec(`
    INSERT INTO TMArea (uuid, title, visible, "index") VALUES
      ('area-work', 'Work', 1, 0),
      ('area-personal', 'Personal', 1, 1),
      ('area-hidden', 'Hidden', 0, 2);
  `);

  // Seed tags
  db.exec(`
    INSERT INTO TMTag (uuid, title, shortcut, parent) VALUES
      ('tag-urgent', 'urgent', 'u', NULL),
      ('tag-errand', 'errand', NULL, NULL),
      ('tag-subtag', 'sub-errand', NULL, 'tag-errand');
  `);

  // Seed projects (type=1)
  db.exec(`
    INSERT INTO TMTask (uuid, title, notes, type, status, start, area, creationDate, todayIndex, "index") VALUES
      ('proj-1', 'Home Renovation', 'Renovate the house', 1, 0, 1, 'area-personal', 700000000, 0, 0),
      ('proj-2', 'Work Project', 'Important work', 1, 0, 1, 'area-work', 700000100, 0, 1),
      ('proj-done', 'Completed Project', '', 1, 3, 1, 'area-work', 700000200, 0, 2);
  `);

  // Seed headings (type=2)
  db.exec(`
    INSERT INTO TMTask (uuid, title, type, project, "index") VALUES
      ('heading-1', 'Phase 1', 2, 'proj-1', 0),
      ('heading-2', 'Phase 2', 2, 'proj-1', 1);
  `);

  // Seed todos (type=0)
  db.exec(`
    INSERT INTO TMTask (uuid, title, notes, type, status, start, startDate, deadline, todayIndex, project, area, heading, trashed, creationDate, userModificationDate, stopDate, "index", rt1_recurrenceRule, deadlineSuppressionDate) VALUES
      ('todo-inbox-1', 'Buy groceries', 'Need milk and eggs', 0, 0, 0, NULL, NULL, 0, NULL, NULL, NULL, 0, 700000000, 700000100, NULL, 0, NULL, NULL),
      ('todo-inbox-2', 'Call dentist', '', 0, 0, 0, NULL, NULL, 0, NULL, NULL, NULL, 0, 700000200, NULL, NULL, 1, NULL, NULL),
      ('todo-today-1', 'Review PR', 'Check the code', 0, 0, 1, ${todayThingsDate}, NULL, 1, 'proj-2', 'area-work', NULL, 0, 700000300, NULL, NULL, 0, NULL, NULL),
      ('todo-today-2', 'Send email', '', 0, 0, 1, ${todayThingsDate}, NULL, 0, NULL, 'area-work', NULL, 0, 700000400, NULL, NULL, 1, NULL, NULL),
      ('todo-anytime-1', 'Read book', 'Finish chapter 5', 0, 0, 1, NULL, NULL, 0, NULL, 'area-personal', NULL, 0, 700000500, NULL, NULL, 0, NULL, NULL),
      ('todo-someday-1', 'Learn piano', '', 0, 0, 2, NULL, NULL, 0, NULL, NULL, NULL, 0, 700000600, NULL, NULL, 0, NULL, NULL),
      ('todo-upcoming-1', 'Future task', '', 0, 0, 2, ${futureThingsDate}, NULL, 0, NULL, NULL, NULL, 0, 700000700, NULL, NULL, 0, NULL, NULL),
      ('todo-completed-1', 'Done task', '', 0, 3, 1, NULL, NULL, 0, NULL, NULL, NULL, 0, 700000800, NULL, 700001000, 0, NULL, NULL),
      ('todo-trashed-1', 'Trashed task', '', 0, 0, 1, NULL, NULL, 0, NULL, NULL, NULL, 1, 700000900, NULL, NULL, 0, NULL, NULL),
      ('todo-proj-1', 'Kitchen remodel', '', 0, 0, 1, NULL, ${futureThingsDate}, 0, 'proj-1', 'area-personal', 'heading-1', 0, 700001000, NULL, NULL, 0, NULL, NULL),
      ('todo-proj-2', 'Bathroom remodel', '', 0, 0, 1, NULL, NULL, 0, 'proj-1', 'area-personal', 'heading-2', 0, 700001100, NULL, NULL, 1, NULL, NULL),
      ('todo-someday-scheduled', 'Scheduled someday', '', 0, 0, 2, ${pastThingsDate}, NULL, 0, NULL, NULL, NULL, 0, 700001200, NULL, NULL, 0, NULL, NULL),
      ('todo-overdue-1', 'Overdue deadline', '', 0, 0, 1, NULL, ${pastThingsDate}, 0, NULL, NULL, NULL, 0, 700001400, NULL, NULL, 0, NULL, NULL),
      ('todo-canceled-1', 'Canceled task', '', 0, 2, 1, NULL, NULL, 0, NULL, NULL, NULL, 0, 700001500, NULL, 700001600, 0, NULL, NULL),
      ('todo-suppressed-1', 'Suppressed deadline', '', 0, 0, 1, NULL, ${pastThingsDate}, 0, NULL, NULL, NULL, 0, 700001700, NULL, NULL, 0, NULL, 700001700),
      ('todo-recurring-1', 'Recurring template', '', 0, 0, 1, NULL, NULL, 0, NULL, NULL, NULL, 0, 700002000, NULL, NULL, 0, 'RRULE:FREQ=DAILY', NULL);
  `);

  // Seed task-tag associations
  db.exec(`
    INSERT INTO TMTaskTag (tasks, tags) VALUES
      ('todo-today-1', 'tag-urgent'),
      ('todo-inbox-1', 'tag-errand'),
      ('todo-proj-1', 'tag-urgent');
  `);

  // Seed checklist items
  db.exec(`
    INSERT INTO TMChecklistItem (uuid, title, status, task, "index") VALUES
      ('cl-1', 'Milk', 0, 'todo-inbox-1', 0),
      ('cl-2', 'Eggs', 3, 'todo-inbox-1', 1),
      ('cl-3', 'Bread', 0, 'todo-inbox-1', 2);
  `);
}

beforeEach(() => {
  testDb = createAdapter();
  seedDatabase(testDb);
  _setDb(testDb);
});

afterEach(() => {
  _setDb(null);
  testDb.close();
});

// --- queryTodos ---

describe("queryTodos", () => {
  test("inbox returns tasks with start=0", () => {
    const todos = queryTodos({ list: "inbox" });
    expect(todos.length).toBe(2);
    expect(todos.every((t) => t.start === "inbox")).toBe(true);
  });

  test("today returns regular today, scheduled-someday, and overdue-deadline tasks", () => {
    const todos = queryTodos({ list: "today" });
    const uuids = todos.map((t) => t.uuid);
    // Regular today: start=1 + startDate set
    expect(uuids).toContain("todo-today-1");
    expect(uuids).toContain("todo-today-2");
    // Unconfirmed scheduled: start=2 + past startDate
    expect(uuids).toContain("todo-someday-scheduled");
    // Overdue deadline: no startDate + past deadline + no suppression
    expect(uuids).toContain("todo-overdue-1");
    // Should NOT include suppressed overdue
    expect(uuids).not.toContain("todo-suppressed-1");
    // Should NOT include anytime tasks without startDate
    expect(uuids).not.toContain("todo-anytime-1");
  });

  test("anytime returns open tasks with start=1", () => {
    const todos = queryTodos({ list: "anytime" });
    const uuids = todos.map((t) => t.uuid);
    expect(todos.every((t) => t.start === "anytime")).toBe(true);
    expect(uuids).toContain("todo-anytime-1");
    // Today tasks also appear in anytime (lists are not mutually exclusive)
    expect(uuids).toContain("todo-today-1");
    expect(uuids).toContain("todo-today-2");
    // Should not include someday or upcoming tasks
    expect(uuids).not.toContain("todo-someday-1");
    expect(uuids).not.toContain("todo-upcoming-1");
  });

  test("someday returns tasks with start=2 and no startDate", () => {
    const todos = queryTodos({ list: "someday" });
    const uuids = todos.map((t) => t.uuid);
    expect(uuids).toContain("todo-someday-1");
    // Scheduled someday tasks should NOT appear (they belong in today or upcoming)
    expect(uuids).not.toContain("todo-someday-scheduled");
    expect(uuids).not.toContain("todo-upcoming-1");
  });

  test("upcoming returns tasks with start=2 and future startDate", () => {
    const todos = queryTodos({ list: "upcoming" });
    const uuids = todos.map((t) => t.uuid);
    expect(uuids).toContain("todo-upcoming-1");
    // Past-scheduled someday should NOT appear (belongs in today)
    expect(uuids).not.toContain("todo-someday-scheduled");
  });

  test("logbook returns completed and canceled tasks", () => {
    const todos = queryTodos({ list: "logbook" });
    const uuids = todos.map((t) => t.uuid);
    expect(uuids).toContain("todo-completed-1");
    expect(uuids).toContain("todo-canceled-1");
  });

  test("trash returns trashed tasks", () => {
    const todos = queryTodos({ list: "trash" });
    expect(todos.length).toBe(1);
    expect(todos[0]!.uuid).toBe("todo-trashed-1");
  });

  test("excludes trashed tasks by default", () => {
    const todos = queryTodos({});
    const uuids = todos.map((t) => t.uuid);
    expect(uuids).not.toContain("todo-trashed-1");
  });

  test("excludes recurring task templates", () => {
    const todos = queryTodos({});
    const uuids = todos.map((t) => t.uuid);
    expect(uuids).not.toContain("todo-recurring-1");
  });

  test("excludes headings (type=2)", () => {
    const todos = queryTodos({});
    const uuids = todos.map((t) => t.uuid);
    expect(uuids).not.toContain("heading-1");
    expect(uuids).not.toContain("heading-2");
  });

  test("filter by projectId", () => {
    const todos = queryTodos({ projectId: "proj-1" });
    expect(todos.length).toBe(2);
    expect(todos.every((t) => t.projectId === "proj-1")).toBe(true);
  });

  test("filter by areaId", () => {
    const todos = queryTodos({ areaId: "area-work" });
    expect(todos.length).toBeGreaterThanOrEqual(1);
    // Should include todo-today-1 which is in proj-2 (area-work)
    const uuids = todos.map((t) => t.uuid);
    expect(uuids).toContain("todo-today-1");
  });

  test("filter by search", () => {
    const todos = queryTodos({ search: "groceries" });
    expect(todos.length).toBe(1);
    expect(todos[0]!.uuid).toBe("todo-inbox-1");
  });

  test("search also matches notes", () => {
    const todos = queryTodos({ search: "chapter 5" });
    expect(todos.length).toBe(1);
    expect(todos[0]!.uuid).toBe("todo-anytime-1");
  });

  test("limit constrains results", () => {
    const todos = queryTodos({ limit: 2 });
    expect(todos.length).toBeLessThanOrEqual(2);
  });

  test("includes tags via batch loading", () => {
    const todos = queryTodos({ list: "inbox" });
    const grocery = todos.find((t) => t.uuid === "todo-inbox-1");
    expect(grocery!.tags).toContain("errand");
  });

  test("includes checklist items via batch loading", () => {
    const todos = queryTodos({ list: "inbox" });
    const grocery = todos.find((t) => t.uuid === "todo-inbox-1");
    expect(grocery!.checklistItems.length).toBe(3);
    expect(grocery!.checklistItems[0]!.title).toBe("Milk");
    expect(grocery!.checklistItems[0]!.completed).toBe(false);
    expect(grocery!.checklistItems[1]!.title).toBe("Eggs");
    expect(grocery!.checklistItems[1]!.completed).toBe(true);
  });

  test("includes project and area info", () => {
    const todos = queryTodos({ list: "today" });
    const review = todos.find((t) => t.uuid === "todo-today-1");
    expect(review!.projectId).toBe("proj-2");
    expect(review!.projectTitle).toBe("Work Project");
  });
});

// --- queryTodoById ---

describe("queryTodoById", () => {
  test("returns full details for existing todo", () => {
    const todo = queryTodoById("todo-inbox-1");
    expect(todo).not.toBeNull();
    expect(todo!.uuid).toBe("todo-inbox-1");
    expect(todo!.title).toBe("Buy groceries");
    expect(todo!.notes).toBe("Need milk and eggs");
    expect(todo!.status).toBe("open");
    expect(todo!.tags).toContain("errand");
    expect(todo!.checklistItems.length).toBe(3);
  });

  test("returns null for missing UUID", () => {
    const todo = queryTodoById("nonexistent");
    expect(todo).toBeNull();
  });

  test("does not return projects (type=1)", () => {
    const todo = queryTodoById("proj-1");
    expect(todo).toBeNull();
  });

  test("includes heading info", () => {
    const todo = queryTodoById("todo-proj-1");
    expect(todo).not.toBeNull();
    expect(todo!.headingId).toBe("heading-1");
    expect(todo!.headingTitle).toBe("Phase 1");
  });

  test("includes deadline as date string", () => {
    const todo = queryTodoById("todo-proj-1");
    expect(todo).not.toBeNull();
    expect(todo!.deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// --- queryProjects ---

describe("queryProjects", () => {
  test("returns open projects by default (no status filter)", () => {
    const projects = queryProjects();
    // Returns all non-trashed projects (open + completed)
    expect(projects.length).toBeGreaterThanOrEqual(2);
  });

  test("filter by status=open", () => {
    const projects = queryProjects({ status: "open" });
    expect(projects.every((p) => p.status === "open")).toBe(true);
    expect(projects.length).toBe(2);
  });

  test("filter by status=completed", () => {
    const projects = queryProjects({ status: "completed" });
    expect(projects.length).toBe(1);
    expect(projects[0]!.uuid).toBe("proj-done");
  });

  test("filter by areaId", () => {
    const projects = queryProjects({ areaId: "area-work" });
    const uuids = projects.map((p) => p.uuid);
    expect(uuids).toContain("proj-2");
  });

  test("filter by search", () => {
    const projects = queryProjects({ search: "Renovation" });
    expect(projects.length).toBe(1);
    expect(projects[0]!.uuid).toBe("proj-1");
  });

  test("includes todo counts", () => {
    const projects = queryProjects({ search: "Renovation" });
    expect(projects[0]!.openTodoCount).toBe(2);
    expect(projects[0]!.totalTodoCount).toBe(2);
  });

  test("limit constrains results", () => {
    const projects = queryProjects({ limit: 1 });
    expect(projects.length).toBe(1);
  });
});

// --- queryProjectById ---

describe("queryProjectById", () => {
  test("returns full project details", () => {
    const project = queryProjectById("proj-1");
    expect(project).not.toBeNull();
    expect(project!.uuid).toBe("proj-1");
    expect(project!.title).toBe("Home Renovation");
    expect(project!.notes).toBe("Renovate the house");
    expect(project!.areaId).toBe("area-personal");
  });

  test("includes headings", () => {
    const project = queryProjectById("proj-1");
    expect(project!.headings.length).toBe(2);
    expect(project!.headings[0]!.title).toBe("Phase 1");
    expect(project!.headings[1]!.title).toBe("Phase 2");
  });

  test("includes todos", () => {
    const project = queryProjectById("proj-1");
    expect(project!.todos.length).toBe(2);
    const kitchen = project!.todos.find((t) => t.uuid === "todo-proj-1");
    expect(kitchen).toBeDefined();
    expect(kitchen!.headingId).toBe("heading-1");
  });

  test("returns null for missing UUID", () => {
    const project = queryProjectById("nonexistent");
    expect(project).toBeNull();
  });

  test("does not return todos (type=0) as projects", () => {
    const project = queryProjectById("todo-inbox-1");
    expect(project).toBeNull();
  });
});

// --- queryAreas ---

describe("queryAreas", () => {
  test("returns all areas ordered by index", () => {
    const areas = queryAreas();
    expect(areas.length).toBe(3);
    expect(areas[0]!.title).toBe("Work");
    expect(areas[1]!.title).toBe("Personal");
    expect(areas[2]!.title).toBe("Hidden");
  });

  test("includes visibility flag", () => {
    const areas = queryAreas();
    const hidden = areas.find((a) => a.title === "Hidden");
    expect(hidden!.visible).toBe(false);
  });
});

// --- queryTags ---

describe("queryTags", () => {
  test("returns all tags ordered by title", () => {
    const tags = queryTags();
    expect(tags.length).toBe(3);
    // Alphabetical: errand, sub-errand, urgent
    expect(tags[0]!.title).toBe("errand");
    expect(tags[1]!.title).toBe("sub-errand");
    expect(tags[2]!.title).toBe("urgent");
  });

  test("includes shortcut", () => {
    const tags = queryTags();
    const urgent = tags.find((t) => t.title === "urgent");
    expect(urgent!.shortcut).toBe("u");
  });

  test("includes parent relationship", () => {
    const tags = queryTags();
    const sub = tags.find((t) => t.title === "sub-errand");
    expect(sub!.parentTag).toBe("tag-errand");
  });

  test("null parent for top-level tags", () => {
    const tags = queryTags();
    const errand = tags.find((t) => t.title === "errand");
    expect(errand!.parentTag).toBeNull();
  });
});

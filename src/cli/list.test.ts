import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FileStorage } from "../core/storage/index.js";
import { runCli } from "./index.js";
import type { CapturedOutput } from "./test-helpers.js";
import {
  captureOutput,
  createTempStorage,
  createArchivedTask,
  TASK_ID_REGEX,
} from "./test-helpers.js";
import { ArchiveStorage } from "../core/storage/archive-storage.js";

describe("list command", () => {
  let storage: FileStorage;
  let cleanup: () => void;
  let output: CapturedOutput;
  let mockExit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    const temp = createTempStorage();
    storage = temp.storage;
    cleanup = temp.cleanup;
    output = captureOutput();
    mockExit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as () => never);
  });

  afterEach(() => {
    output.restore();
    cleanup();
    mockExit.mockRestore();
  });

  it("shows empty state when no tasks", async () => {
    await runCli(["list"], { storage });
    expect(output.stdout.join("\n")).toContain("No tasks found");
  });

  it("lists created tasks", async () => {
    await runCli(["create", "-n", "Task one", "--description", "Context one"], {
      storage,
    });
    output.stdout.length = 0;

    await runCli(["list"], { storage });
    expect(output.stdout.join("\n")).toContain("Task one");
  });

  it("outputs JSON with --json flag", async () => {
    await runCli(["create", "-n", "JSON task", "--description", "Context"], {
      storage,
    });
    output.stdout.length = 0;

    await runCli(["list", "--json"], { storage });

    const parsed = JSON.parse(output.stdout.join("\n"));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].name).toBe("JSON task");
  });

  it("filters by query", async () => {
    await runCli(["create", "-n", "Fix bug", "--description", "ctx"], {
      storage,
    });
    await runCli(["create", "-n", "Add feature", "--description", "ctx"], {
      storage,
    });
    output.stdout.length = 0;

    await runCli(["list", "-q", "bug"], { storage });

    const out = output.stdout.join("\n");
    expect(out).toContain("Fix bug");
    expect(out).not.toContain("Add feature");
  });

  it("filters by positional query argument", async () => {
    await runCli(["create", "-n", "Fix bug", "--description", "ctx"], {
      storage,
    });
    await runCli(["create", "-n", "Add feature", "--description", "ctx"], {
      storage,
    });
    output.stdout.length = 0;

    await runCli(["list", "bug"], { storage });

    const out = output.stdout.join("\n");
    expect(out).toContain("Fix bug");
    expect(out).not.toContain("Add feature");
  });

  it("shows subtree when given task ID", async () => {
    // Create parent with children
    await runCli(["create", "-n", "Parent task", "--description", "ctx"], {
      storage,
    });
    const parentId = output.stdout.join("\n").match(TASK_ID_REGEX)?.[1];
    expect(parentId).toBeDefined();

    await runCli(
      [
        "create",
        "-n",
        "Child one",
        "--description",
        "ctx",
        "--parent",
        parentId!,
      ],
      { storage },
    );
    await runCli(
      [
        "create",
        "-n",
        "Child two",
        "--description",
        "ctx",
        "--parent",
        parentId!,
      ],
      { storage },
    );

    // Create unrelated task
    await runCli(["create", "-n", "Unrelated task", "--description", "ctx"], {
      storage,
    });
    output.stdout.length = 0;

    await runCli(["list", parentId!], { storage });

    const out = output.stdout.join("\n");
    expect(out).toContain("Parent task");
    expect(out).toContain("Child one");
    expect(out).toContain("Child two");
    expect(out).not.toContain("Unrelated task");
  });

  it("shows full tree with 3 levels", async () => {
    // Create epic -> task -> subtask hierarchy
    await runCli(["create", "-n", "Epic", "--description", "ctx"], { storage });
    const epicId = output.stdout.join("\n").match(TASK_ID_REGEX)?.[1];

    await runCli(
      [
        "create",
        "-n",
        "Task under epic",
        "--description",
        "ctx",
        "--parent",
        epicId!,
      ],
      { storage },
    );
    const taskId = output.stdout.join("\n").match(TASK_ID_REGEX)?.[1];

    await runCli(
      ["create", "-n", "Subtask", "--description", "ctx", "--parent", taskId!],
      { storage },
    );
    output.stdout.length = 0;

    await runCli(["list"], { storage });

    const out = output.stdout.join("\n");
    expect(out).toContain("Epic");
    expect(out).toContain("Task under epic");
    expect(out).toContain("Subtask");
  });

  it("shows blocked indicator for tasks with blockers", async () => {
    // Create blocker task
    await runCli(["create", "-n", "Task A", "--description", "ctx"], {
      storage,
    });
    const blockerMatch = output.stdout.join("\n").match(TASK_ID_REGEX);
    const blockerId = blockerMatch?.[1];
    expect(blockerId).toBeDefined();

    // Create blocked task
    await runCli(
      [
        "create",
        "-n",
        "Task B",
        "--description",
        "ctx",
        "--blocked-by",
        blockerId!,
      ],
      { storage },
    );
    output.stdout.length = 0;

    await runCli(["list"], { storage });

    const out = output.stdout.join("\n");
    expect(out).toContain("Task A");
    expect(out).toContain("Task B");
    expect(out).toContain(`[B: ${blockerId}]`);
  });

  it("filters to only blocked tasks with --blocked", async () => {
    // Create blocker task
    await runCli(["create", "-n", "Task A", "--description", "ctx"], {
      storage,
    });
    const blockerMatch = output.stdout.join("\n").match(TASK_ID_REGEX);
    const blockerId = blockerMatch?.[1];

    // Create blocked task
    await runCli(
      [
        "create",
        "-n",
        "Task B",
        "--description",
        "ctx",
        "--blocked-by",
        blockerId!,
      ],
      { storage },
    );
    output.stdout.length = 0;

    await runCli(["list", "--blocked"], { storage });

    const out = output.stdout.join("\n");
    expect(out).toContain("Task B");
    expect(out).not.toContain("Task A");
  });

  it("filters to only ready tasks with --ready", async () => {
    // Create blocker task
    await runCli(["create", "-n", "Task A", "--description", "ctx"], {
      storage,
    });
    const blockerMatch = output.stdout.join("\n").match(TASK_ID_REGEX);
    const blockerId = blockerMatch?.[1];

    // Create blocked task
    await runCli(
      [
        "create",
        "-n",
        "Task B",
        "--description",
        "ctx",
        "--blocked-by",
        blockerId!,
      ],
      { storage },
    );
    output.stdout.length = 0;

    await runCli(["list", "--ready"], { storage });

    const out = output.stdout.join("\n");
    expect(out).toContain("Task A");
    expect(out).not.toContain("Task B");
  });

  it("shows GitHub indicator for task linked to GitHub issue", async () => {
    // Create task
    await runCli(["create", "-n", "GitHub task", "--description", "ctx"], {
      storage,
    });
    const taskId = output.stdout.join("\n").match(TASK_ID_REGEX)?.[1];
    expect(taskId).toBeDefined();

    // Add GitHub metadata via store read/write
    const store = storage.read();
    const task = store.tasks.find((t) => t.id === taskId);
    expect(task).toBeDefined();
    task!.metadata = {
      github: {
        issueNumber: 123,
        issueUrl: "https://github.com/owner/repo/issues/123",
        repo: "owner/repo",
      },
    };
    storage.write(store);

    output.stdout.length = 0;
    await runCli(["list"], { storage });

    const out = output.stdout.join("\n");
    expect(out).toContain("[GH-123]");
  });

  it("shows GitHub indicator for subtask via parent", async () => {
    // Create parent task
    await runCli(["create", "-n", "Parent task", "--description", "ctx"], {
      storage,
    });
    const parentId = output.stdout.join("\n").match(TASK_ID_REGEX)?.[1];
    expect(parentId).toBeDefined();

    // Add GitHub metadata to parent via store read/write
    const store = storage.read();
    const parentTask = store.tasks.find((t) => t.id === parentId);
    expect(parentTask).toBeDefined();
    parentTask!.metadata = {
      github: {
        issueNumber: 456,
        issueUrl: "https://github.com/owner/repo/issues/456",
        repo: "owner/repo",
      },
    };
    storage.write(store);

    // Create subtask
    output.stdout.length = 0;
    await runCli(
      [
        "create",
        "-n",
        "Subtask",
        "--description",
        "ctx",
        "--parent",
        parentId!,
      ],
      { storage },
    );

    output.stdout.length = 0;
    await runCli(["list"], { storage });

    const out = output.stdout.join("\n");
    // Both parent and subtask should show the GitHub indicator
    expect(out).toContain("[GH-456]");
  });

  describe("--archived flag", () => {
    it("lists archived tasks with --archived flag", async () => {
      // Add archived task directly to archive storage
      const archiveStorage = new ArchiveStorage({
        path: storage.getIdentifier(),
      });
      const archivedTask = createArchivedTask({
        id: "arch1234",
        name: "Old completed task",
        result: "Was done successfully",
      });
      archiveStorage.appendArchive([archivedTask]);

      await runCli(["list", "--archived"], { storage });

      const out = output.stdout.join("\n");
      expect(out).toContain("Old completed task");
      expect(out).toContain("arch1234");
    });

    it("shows empty state when no archived tasks", async () => {
      await runCli(["list", "--archived"], { storage });

      const out = output.stdout.join("\n");
      expect(out).toContain("No archived tasks");
    });

    it("filters archived tasks by query", async () => {
      const archiveStorage = new ArchiveStorage({
        path: storage.getIdentifier(),
      });
      archiveStorage.appendArchive([
        createArchivedTask({ id: "auth1234", name: "Fix authentication bug" }),
        createArchivedTask({ id: "feat5678", name: "Add new feature" }),
      ]);

      await runCli(["list", "--archived", "-q", "auth"], { storage });

      const out = output.stdout.join("\n");
      expect(out).toContain("Fix authentication bug");
      expect(out).not.toContain("Add new feature");
    });

    it("outputs archived tasks as JSON with --json flag", async () => {
      const archiveStorage = new ArchiveStorage({
        path: storage.getIdentifier(),
      });
      const archivedTask = createArchivedTask({
        id: "json1234",
        name: "JSON archived task",
        result: "Done",
      });
      archiveStorage.appendArchive([archivedTask]);

      await runCli(["list", "--archived", "--json"], { storage });

      const parsed = JSON.parse(output.stdout.join("\n"));
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].name).toBe("JSON archived task");
      expect(parsed[0].archived_at).toBeDefined();
    });

    it("does not mix active and archived tasks", async () => {
      // Create an active task
      await runCli(["create", "-n", "Active task", "--description", "ctx"], {
        storage,
      });
      output.stdout.length = 0;

      // Create an archived task
      const archiveStorage = new ArchiveStorage({
        path: storage.getIdentifier(),
      });
      archiveStorage.appendArchive([
        createArchivedTask({ id: "arch0001", name: "Archived task" }),
      ]);

      // List active tasks (no --archived)
      await runCli(["list"], { storage });
      let out = output.stdout.join("\n");
      expect(out).toContain("Active task");
      expect(out).not.toContain("Archived task");

      // List archived tasks
      output.stdout.length = 0;
      await runCli(["list", "--archived"], { storage });
      out = output.stdout.join("\n");
      expect(out).toContain("Archived task");
      expect(out).not.toContain("Active task");
    });

    it("shows archived children count for parent tasks", async () => {
      const archiveStorage = new ArchiveStorage({
        path: storage.getIdentifier(),
      });
      archiveStorage.appendArchive([
        createArchivedTask({
          id: "parent01",
          name: "Epic with children",
          archived_children: [
            {
              id: "child-1",
              name: "Subtask 1",
              description: "",
              result: "Done",
            },
            {
              id: "child-2",
              name: "Subtask 2",
              description: "",
              result: "Done",
            },
          ],
        }),
      ]);

      await runCli(["list", "--archived"], { storage });

      const out = output.stdout.join("\n");
      expect(out).toContain("Epic with children");
      // Should indicate it has children
      expect(out).toMatch(/2\s*(subtask|children)/i);
    });

    it("includes all archived tasks with --all flag", async () => {
      const archiveStorage = new ArchiveStorage({
        path: storage.getIdentifier(),
      });
      archiveStorage.appendArchive([
        createArchivedTask({ id: "task0001", name: "First archived" }),
        createArchivedTask({ id: "task0002", name: "Second archived" }),
      ]);

      await runCli(["list", "--archived", "--all"], { storage });

      const out = output.stdout.join("\n");
      expect(out).toContain("First archived");
      expect(out).toContain("Second archived");
    });
  });
});

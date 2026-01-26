import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runCli } from "./index.js";
import {
  createCliTestFixture,
  createTaskAndGetId,
  CliTestFixture,
} from "./test-helpers.js";

describe("complete command", () => {
  let fixture: CliTestFixture;

  beforeEach(() => {
    fixture = createCliTestFixture();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it("marks task as completed with result", async () => {
    const taskId = await createTaskAndGetId(fixture, "To complete");

    await runCli(["complete", taskId, "-r", "Done successfully"], {
      storage: fixture.storage,
    });

    const out = fixture.output.stdout.join("\n");
    expect(out).toContain("Completed");
    expect(out).toContain("Done successfully");
  });

  it("requires --result", async () => {
    const taskId = await createTaskAndGetId(fixture, "Task");

    await expect(
      runCli(["complete", taskId], { storage: fixture.storage }),
    ).rejects.toThrow("process.exit");
    expect(fixture.output.stderr.join("\n")).toContain("--result");
  });

  it("warns when completing a blocked task but still completes", async () => {
    const blockerId = await createTaskAndGetId(fixture, "Task A");
    const blockedId = await createTaskAndGetId(fixture, "Task B", {
      blockedBy: blockerId,
    });

    await runCli(["complete", blockedId, "-r", "Done anyway"], {
      storage: fixture.storage,
    });

    const out = fixture.output.stdout.join("\n");
    expect(out).toContain("Warning:");
    expect(out).toContain("blocked by");
    expect(out).toContain("Task A");
    expect(out).toContain("Completed");
  });

  it("fails when completing a task with pending children", async () => {
    const parentId = await createTaskAndGetId(fixture, "Parent task");
    await createTaskAndGetId(fixture, "Child task", { parent: parentId });

    await expect(
      runCli(["complete", parentId, "-r", "Done"], {
        storage: fixture.storage,
      }),
    ).rejects.toThrow("process.exit");

    expect(fixture.output.stderr.join("\n")).toContain("subtask");
    expect(fixture.output.stderr.join("\n")).toContain("pending");
  });

  it("fails for nonexistent task", async () => {
    await expect(
      runCli(["complete", "nonexist", "-r", "Done"], {
        storage: fixture.storage,
      }),
    ).rejects.toThrow("process.exit");
    expect(fixture.output.stderr.join("\n")).toContain("not found");
  });

  it("requires task ID", async () => {
    await expect(
      runCli(["complete", "-r", "Done"], { storage: fixture.storage }),
    ).rejects.toThrow("process.exit");
    expect(fixture.output.stderr.join("\n")).toContain("Task ID is required");
  });

  it("persists completion to storage", async () => {
    const taskId = await createTaskAndGetId(fixture, "Task to complete");

    await runCli(["complete", taskId, "-r", "Done with verification"], {
      storage: fixture.storage,
    });

    const tasks = await fixture.storage.readAsync();
    const task = tasks.tasks.find((t) => t.id === taskId);
    expect(task).toBeDefined();
    expect(task?.completed).toBe(true);
    expect(task?.result).toBe("Done with verification");
    expect(task?.completed_at).toBeTruthy();
  });

  it("allows completing parent after all children are completed", async () => {
    const parentId = await createTaskAndGetId(fixture, "Parent task");
    const childId = await createTaskAndGetId(fixture, "Child task", {
      parent: parentId,
    });

    await runCli(["complete", childId, "-r", "Child done"], {
      storage: fixture.storage,
    });
    fixture.output.stdout.length = 0;

    await runCli(["complete", parentId, "-r", "Parent done"], {
      storage: fixture.storage,
    });

    const out = fixture.output.stdout.join("\n");
    expect(out).toContain("Completed");
  });

  it("shows help with --help flag", async () => {
    await runCli(["complete", "--help"], { storage: fixture.storage });

    const out = fixture.output.stdout.join("\n");
    expect(out).toContain("dex complete");
    expect(out).toContain("--result");
    expect(out).toContain("--commit");
  });

  it("accepts commit SHA with -c flag", async () => {
    const taskId = await createTaskAndGetId(fixture, "Task with commit");

    await runCli(["complete", taskId, "-r", "Done", "-c", "abc1234"], {
      storage: fixture.storage,
    });

    const tasks = await fixture.storage.readAsync();
    const task = tasks.tasks.find((t) => t.id === taskId);
    expect(task?.metadata?.commit).toBeDefined();
    expect(task?.metadata?.commit?.sha).toBe("abc1234");
  });
});

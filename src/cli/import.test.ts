import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FileStorage } from "../core/storage.js";
import { runCli } from "./index.js";
import {
  captureOutput,
  createTempStorage,
  CapturedOutput,
  setupGitHubMock,
  cleanupGitHubMock,
  createIssueFixture,
  createDexIssueBody,
  GitHubMock,
} from "./test-helpers.js";

// Mock git remote detection to return a consistent repo
vi.mock("../core/git-remote.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../core/git-remote.js")>();
  return {
    ...original,
    getGitHubRepo: () => ({ owner: "test-owner", repo: "test-repo" }),
  };
});

describe("import command", () => {
  let storage: FileStorage;
  let cleanup: () => void;
  let output: CapturedOutput;
  let mockExit: ReturnType<typeof vi.spyOn>;
  let githubMock: GitHubMock;
  let originalEnv: string | undefined;

  beforeEach(() => {
    const temp = createTempStorage();
    storage = temp.storage;
    cleanup = temp.cleanup;
    output = captureOutput();
    mockExit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as () => never);

    // Set up GitHub token
    originalEnv = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = "test-token";

    // Set up GitHub API mock
    githubMock = setupGitHubMock();
  });

  afterEach(() => {
    output.restore();
    cleanup();
    mockExit.mockRestore();
    cleanupGitHubMock();

    // Restore env
    if (originalEnv !== undefined) {
      process.env.GITHUB_TOKEN = originalEnv;
    } else {
      delete process.env.GITHUB_TOKEN;
    }
  });

  describe("help", () => {
    it("shows help with --help flag", async () => {
      await runCli(["import", "--help"], { storage });

      const out = output.stdout.join("\n");
      expect(out).toContain("dex import");
      expect(out).toContain("--update");
      expect(out).toContain("--all");
      expect(out).toContain("--dry-run");
    });
  });

  describe("single issue import", () => {
    it("imports a GitHub issue as a task", async () => {
      githubMock.getIssue("test-owner", "test-repo", 123, createIssueFixture({
        number: 123,
        title: "Test Issue",
        body: "Issue description",
        state: "open",
      }));

      await runCli(["import", "#123"], { storage });

      const out = output.stdout.join("\n");
      expect(out).toContain("Imported");
      expect(out).toContain("#123");
      expect(out).toContain("Test Issue");

      // Verify task was created
      const tasks = await storage.readAsync();
      expect(tasks.tasks).toHaveLength(1);
      expect(tasks.tasks[0].description).toBe("Test Issue");
      expect(tasks.tasks[0].metadata?.github?.issueNumber).toBe(123);
    });

    it("imports a closed issue as completed task", async () => {
      githubMock.getIssue("test-owner", "test-repo", 456, createIssueFixture({
        number: 456,
        title: "Closed Issue",
        state: "closed",
      }));

      await runCli(["import", "#456"], { storage });

      const tasks = await storage.readAsync();
      expect(tasks.tasks[0].completed).toBe(true);
      expect(tasks.tasks[0].result).toContain("completed");
    });

    it("imports issue with subtasks", async () => {
      githubMock.getIssue("test-owner", "test-repo", 789, createIssueFixture({
        number: 789,
        title: "Parent Issue",
        body: createDexIssueBody({
          context: "Main task context",
          subtasks: [
            { id: "sub1", description: "Subtask 1" },
            { id: "sub2", description: "Subtask 2", completed: true },
          ],
        }),
      }));

      await runCli(["import", "#789"], { storage });

      const out = output.stdout.join("\n");
      expect(out).toContain("2 subtask(s)");

      const tasks = await storage.readAsync();
      expect(tasks.tasks).toHaveLength(3); // 1 parent + 2 subtasks
    });

    it("skips already imported issues", async () => {
      // First import
      githubMock.getIssue("test-owner", "test-repo", 111, createIssueFixture({
        number: 111,
        title: "Already Imported",
      }));
      await runCli(["import", "#111"], { storage });

      // Second import attempt
      githubMock.getIssue("test-owner", "test-repo", 111, createIssueFixture({
        number: 111,
        title: "Already Imported",
      }));
      await runCli(["import", "#111"], { storage });

      const out = output.stdout.join("\n");
      expect(out).toContain("Skipped");
      expect(out).toContain("already imported");
      expect(out).toContain("--update");

      // Should still have only 1 task
      const tasks = await storage.readAsync();
      expect(tasks.tasks).toHaveLength(1);
    });
  });

  describe("--update flag", () => {
    it("updates existing task from GitHub", async () => {
      // First import
      githubMock.getIssue("test-owner", "test-repo", 222, createIssueFixture({
        number: 222,
        title: "Original Title",
        body: "Original body",
      }));
      await runCli(["import", "#222"], { storage });

      // Update with changed title
      githubMock.getIssue("test-owner", "test-repo", 222, createIssueFixture({
        number: 222,
        title: "Updated Title",
        body: "Updated body",
      }));
      await runCli(["import", "#222", "--update"], { storage });

      const out = output.stdout.join("\n");
      expect(out).toContain("Updated");

      const tasks = await storage.readAsync();
      expect(tasks.tasks).toHaveLength(1);
      expect(tasks.tasks[0].description).toBe("Updated Title");
    });

    it("updates completion status from GitHub", async () => {
      // Import open issue
      githubMock.getIssue("test-owner", "test-repo", 333, createIssueFixture({
        number: 333,
        title: "Open Issue",
        state: "open",
      }));
      await runCli(["import", "#333"], { storage });

      let tasks = await storage.readAsync();
      expect(tasks.tasks[0].completed).toBe(false);

      // Update with closed issue
      githubMock.getIssue("test-owner", "test-repo", 333, createIssueFixture({
        number: 333,
        title: "Open Issue",
        state: "closed",
      }));
      await runCli(["import", "#333", "--update"], { storage });

      tasks = await storage.readAsync();
      expect(tasks.tasks[0].completed).toBe(true);
    });
  });

  describe("--dry-run flag", () => {
    it("shows what would be imported without making changes", async () => {
      githubMock.getIssue("test-owner", "test-repo", 444, createIssueFixture({
        number: 444,
        title: "Dry Run Test",
      }));

      await runCli(["import", "#444", "--dry-run"], { storage });

      const out = output.stdout.join("\n");
      expect(out).toContain("Would import");
      expect(out).toContain("#444");
      expect(out).toContain("Dry Run Test");

      // No tasks should be created
      const tasks = await storage.readAsync();
      expect(tasks.tasks).toHaveLength(0);
    });

    it("dry-run with --update shows what would be updated", async () => {
      // First import
      githubMock.getIssue("test-owner", "test-repo", 555, createIssueFixture({
        number: 555,
        title: "Original",
      }));
      await runCli(["import", "#555"], { storage });

      // Dry run update
      githubMock.getIssue("test-owner", "test-repo", 555, createIssueFixture({
        number: 555,
        title: "Updated",
      }));
      await runCli(["import", "#555", "--update", "--dry-run"], { storage });

      const out = output.stdout.join("\n");
      expect(out).toContain("Would update");

      // Task should still have original title
      const tasks = await storage.readAsync();
      expect(tasks.tasks[0].description).toBe("Original");
    });
  });

  describe("--all flag", () => {
    it("imports all issues with dex label", async () => {
      githubMock.listIssues("test-owner", "test-repo", [
        createIssueFixture({ number: 1, title: "Issue 1", labels: [{ name: "dex" }] }),
        createIssueFixture({ number: 2, title: "Issue 2", labels: [{ name: "dex" }] }),
      ]);

      await runCli(["import", "--all"], { storage });

      const out = output.stdout.join("\n");
      expect(out).toContain("Imported");
      expect(out).toContain("#1");
      expect(out).toContain("#2");

      const tasks = await storage.readAsync();
      expect(tasks.tasks).toHaveLength(2);
    });

    it("skips pull requests when importing all", async () => {
      githubMock.listIssues("test-owner", "test-repo", [
        createIssueFixture({ number: 1, title: "Issue" }),
        { ...createIssueFixture({ number: 2, title: "PR" }), pull_request: {} },
      ]);

      await runCli(["import", "--all"], { storage });

      const tasks = await storage.readAsync();
      expect(tasks.tasks).toHaveLength(1);
      expect(tasks.tasks[0].description).toBe("Issue");
    });
  });

  describe("error handling", () => {
    it("errors without GitHub token", async () => {
      delete process.env.GITHUB_TOKEN;

      await expect(
        runCli(["import", "#123"], { storage })
      ).rejects.toThrow("process.exit");

      expect(output.stderr.join("\n")).toContain("GitHub token");
    });

    it("errors with invalid issue reference", async () => {
      await expect(
        runCli(["import", "invalid"], { storage })
      ).rejects.toThrow("process.exit");

      expect(output.stderr.join("\n")).toContain("Invalid issue reference");
    });

    it("requires issue reference or --all", async () => {
      await expect(
        runCli(["import"], { storage })
      ).rejects.toThrow("process.exit");

      expect(output.stderr.join("\n")).toContain("required");
    });
  });
});

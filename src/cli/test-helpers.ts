/**
 * Shared test utilities for CLI command tests.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import nock from "nock";
import { FileStorage } from "../core/storage.js";

// Task IDs are 8 lowercase alphanumeric characters
export const TASK_ID_REGEX = /\b([a-z0-9]{8})\b/;

export interface CapturedOutput {
  stdout: string[];
  stderr: string[];
  restore: () => void;
}

export function captureOutput(): CapturedOutput {
  const stdout: string[] = [];
  const stderr: string[] = [];

  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args: unknown[]) => stdout.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => stderr.push(args.map(String).join(" "));

  return {
    stdout,
    stderr,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
    },
  };
}

export function createTempStorage(): { storage: FileStorage; cleanup: () => void } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dex-cli-test-"));
  const storage = new FileStorage(tempDir);

  return {
    storage,
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true }),
  };
}

// ============ GitHub API Mocking ============

export interface GitHubIssueFixture {
  number: number;
  title: string;
  body?: string | null;
  state: "open" | "closed";
  labels?: Array<{ name: string }>;
  pull_request?: unknown;
}

export interface GitHubMock {
  scope: nock.Scope;
  getIssue: (owner: string, repo: string, number: number, response: GitHubIssueFixture) => void;
  getIssue404: (owner: string, repo: string, number: number) => void;
  listIssues: (owner: string, repo: string, response: GitHubIssueFixture[]) => void;
  done: () => void;
}

/**
 * Set up nock interceptors for GitHub API.
 * Call mock.done() in afterEach to verify all expected requests were made.
 */
export function setupGitHubMock(): GitHubMock {
  const scope = nock("https://api.github.com");

  return {
    scope,

    getIssue(owner: string, repo: string, number: number, response: GitHubIssueFixture) {
      scope
        .get(`/repos/${owner}/${repo}/issues/${number}`)
        .reply(200, response);
    },

    getIssue404(owner: string, repo: string, number: number) {
      scope
        .get(`/repos/${owner}/${repo}/issues/${number}`)
        .reply(404, { message: "Not Found" });
    },

    listIssues(owner: string, repo: string, response: GitHubIssueFixture[]) {
      scope
        .get(`/repos/${owner}/${repo}/issues`)
        .query(true) // Match any query params
        .reply(200, response);
    },

    done() {
      scope.done();
    },
  };
}

/**
 * Clean up all nock interceptors.
 * Call in afterEach to reset state between tests.
 */
export function cleanupGitHubMock(): void {
  nock.cleanAll();
}

/**
 * Create a minimal GitHub issue fixture.
 */
export function createIssueFixture(
  overrides: Partial<GitHubIssueFixture> & { number: number }
): GitHubIssueFixture {
  return {
    title: `Test Issue #${overrides.number}`,
    body: null,
    state: "open",
    labels: [],
    ...overrides,
  };
}

/**
 * Create an issue body with dex metadata for testing import round-trip.
 */
interface Subtask {
  id: string;
  description: string;
  completed?: boolean;
}

function formatCheckbox(completed?: boolean): string {
  return completed ? "x" : " ";
}

export function createDexIssueBody(options: {
  context?: string;
  taskId?: string;
  priority?: number;
  completed?: boolean;
  subtasks?: Subtask[];
}): string {
  const lines: string[] = [];

  if (options.context) {
    lines.push(options.context);
  }

  if (options.taskId) {
    lines.push(`<!-- dex:task:id:${options.taskId} -->`);
  }
  if (options.priority !== undefined) {
    lines.push(`<!-- dex:task:priority:${options.priority} -->`);
  }
  if (options.completed !== undefined) {
    lines.push(`<!-- dex:task:completed:${options.completed} -->`);
  }

  if (options.subtasks?.length) {
    lines.push("");
    lines.push("## Task Tree");
    lines.push("");
    for (const st of options.subtasks) {
      lines.push(`- [${formatCheckbox(st.completed)}] **${st.description}** \`${st.id}\``);
    }
    lines.push("");
    lines.push("## Task Details");
    lines.push("");
    for (const st of options.subtasks) {
      const checkbox = formatCheckbox(st.completed);
      lines.push("<details>");
      lines.push(`<summary>[${checkbox}] <b>${st.description}</b> <code>${st.id}</code></summary>`);
      lines.push(`<!-- dex:subtask:id:${st.id} -->`);
      lines.push(`<!-- dex:subtask:completed:${st.completed ?? false} -->`);
      lines.push("</details>");
      lines.push("");
    }
  }

  return lines.join("\n");
}

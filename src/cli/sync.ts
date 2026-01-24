import {
  CliOptions,
  colors,
  createService,
  formatCliError,
  getBooleanFlag,
  parseArgs,
} from "./utils.js";
import {
  createGitHubSyncServiceOrThrow,
  getGitHubIssueNumber,
  GitHubSyncService,
} from "../core/github-sync.js";
import { loadConfig } from "../core/config.js";
import { Task } from "../types.js";

export async function syncCommand(
  args: string[],
  options: CliOptions
): Promise<void> {
  const { positional, flags } = parseArgs(
    args,
    {
      "dry-run": { hasValue: false },
      help: { short: "h", hasValue: false },
    },
    "sync"
  );

  if (getBooleanFlag(flags, "help")) {
    console.log(`${colors.bold}dex sync${colors.reset} - Push tasks to GitHub Issues

${colors.bold}USAGE:${colors.reset}
  dex sync              # Sync all root tasks
  dex sync <task-id>    # Sync specific task
  dex sync --dry-run    # Preview without syncing

${colors.bold}ARGUMENTS:${colors.reset}
  <task-id>             Optional task ID to sync (syncs all if omitted)

${colors.bold}OPTIONS:${colors.reset}
  --dry-run             Show what would be synced without making changes
  -h, --help            Show this help message

${colors.bold}REQUIREMENTS:${colors.reset}
  - Git repository with GitHub remote
  - GITHUB_TOKEN environment variable

${colors.bold}EXAMPLE:${colors.reset}
  dex sync                    # Sync all tasks to GitHub
  dex sync abc123             # Sync specific task
  dex sync --dry-run          # Preview sync
`);
    return;
  }

  const taskId = positional[0];
  const dryRun = getBooleanFlag(flags, "dry-run");
  const config = loadConfig(options.storage.getIdentifier());

  let syncService: GitHubSyncService;
  try {
    syncService = createGitHubSyncServiceOrThrow(config.sync?.github);
  } catch (err) {
    console.error(formatCliError(err));
    process.exit(1);
  }

  const service = createService(options);
  const repo = syncService.getRepo();

  try {
    if (taskId) {
      // Sync specific task
      const task = await service.get(taskId);
      if (!task) {
        console.error(
          `${colors.red}Error:${colors.reset} Task ${taskId} not found`
        );
        process.exit(1);
      }

      // Find root task if this is a subtask
      const rootTask = await findRootTask(service, task);

      if (dryRun) {
        const action = getGitHubIssueNumber(rootTask) ? "update" : "create";
        console.log(
          `Would sync to ${colors.cyan}${repo.owner}/${repo.repo}${colors.reset}:`
        );
        console.log(
          `  [${action}] ${colors.bold}${rootTask.id}${colors.reset}: ${rootTask.description}`
        );
        return;
      }

      const store = await options.storage.readAsync();
      await syncService.syncTask(rootTask, store);

      console.log(
        `${colors.green}Synced${colors.reset} task ${colors.bold}${rootTask.id}${colors.reset} to ${colors.cyan}${repo.owner}/${repo.repo}${colors.reset}`
      );
    } else {
      // Sync all root tasks
      const allTasks = await service.list({ all: true });
      const rootTasks = allTasks.filter((t) => !t.parent_id);

      if (rootTasks.length === 0) {
        console.log("No tasks to sync.");
        return;
      }

      if (dryRun) {
        console.log(
          `Would sync ${rootTasks.length} task(s) to ${colors.cyan}${repo.owner}/${repo.repo}${colors.reset}:`
        );
        for (const task of rootTasks) {
          const action = getGitHubIssueNumber(task) ? "update" : "create";
          console.log(
            `  [${action}] ${colors.bold}${task.id}${colors.reset}: ${task.description}`
          );
        }
        return;
      }

      const store = await options.storage.readAsync();
      let created = 0;
      let updated = 0;

      for (const task of rootTasks) {
        const isUpdate = !!getGitHubIssueNumber(task);
        await syncService.syncTask(task, store);
        if (isUpdate) {
          updated++;
        } else {
          created++;
        }
      }

      console.log(
        `${colors.green}Synced${colors.reset} ${rootTasks.length} task(s) to ${colors.cyan}${repo.owner}/${repo.repo}${colors.reset}`
      );
      if (created > 0 || updated > 0) {
        const parts = [];
        if (created > 0) parts.push(`${created} created`);
        if (updated > 0) parts.push(`${updated} updated`);
        console.log(`  (${parts.join(", ")})`);
      }
    }
  } catch (err) {
    console.error(formatCliError(err));
    process.exit(1);
  }
}

/**
 * Find the root task (no parent) for a given task.
 */
async function findRootTask(
  service: ReturnType<typeof createService>,
  task: Task
): Promise<Task> {
  if (!task.parent_id) {
    return task;
  }
  const parent = await service.get(task.parent_id);
  if (!parent) {
    return task; // Orphaned subtask, treat as root
  }
  return findRootTask(service, parent);
}

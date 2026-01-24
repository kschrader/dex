import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { parse as parseToml } from "smol-toml";

/**
 * Storage mode for file-based storage
 */
export type StorageMode = "in-repo" | "centralized";

/**
 * GitHub sync configuration.
 * Note: owner/repo are always inferred from git remote, not configured.
 */
export interface GitHubSyncConfig {
  /** Enable automatic GitHub sync on task create/update (default: false) */
  enabled?: boolean;
  /** Environment variable containing GitHub token (default: "GITHUB_TOKEN") */
  token_env?: string;
  /** Label prefix for dex tasks (default: "dex") */
  label_prefix?: string;
}

/**
 * Sync configuration
 */
export interface SyncConfig {
  /** GitHub sync settings */
  github?: GitHubSyncConfig;
}

/**
 * Storage engine configuration
 */
export interface StorageConfig {
  /** Storage engine type (github-issues and github-projects are deprecated, use sync.github instead) */
  engine: "file" | "github-issues" | "github-projects";

  /** File storage settings */
  file?: {
    /** Path to storage directory */
    path?: string;
    /** Storage mode: "in-repo" (default) or "centralized" */
    mode?: StorageMode;
  };

  /** GitHub Issues storage settings */
  "github-issues"?: {
    /** Repository owner */
    owner: string;
    /** Repository name */
    repo: string;
    /** Environment variable containing GitHub token */
    token_env?: string;
    /** Label prefix for dex tasks */
    label_prefix?: string;
  };

  /** GitHub Projects v2 storage settings */
  "github-projects"?: {
    /** Repository/organization owner */
    owner: string;
    /** Project number (e.g., #3) */
    project_number?: number;
    /** Project ID (alternative to project_number) */
    project_id?: string;
    /** Environment variable containing GitHub token */
    token_env?: string;
    /** Custom field name mappings */
    field_names?: {
      status?: string;
      priority?: string;
      result?: string;
      parent?: string;
      completed_at?: string;
    };
  };
}

/**
 * Dex configuration
 */
export interface Config {
  /** Storage configuration */
  storage: StorageConfig;
  /** Sync configuration */
  sync?: SyncConfig;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Config = {
  storage: {
    engine: "file",
    file: {
      path: undefined, // Will use auto-detected path
    },
  },
};

/**
 * Get the global config file path
 * @returns Path to config file (~/.config/dex/dex.toml)
 */
export function getConfigPath(): string {
  const configDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(configDir, "dex", "dex.toml");
}

/**
 * Get the per-project config file path
 * @param storagePath The .dex storage directory
 * @returns Path to project config file (.dex/config.toml)
 */
export function getProjectConfigPath(storagePath: string): string {
  return path.join(storagePath, "config.toml");
}

/**
 * Parse a TOML config file into a partial config object.
 */
function parseConfigFile(configPath: string): Partial<Config> | null {
  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const parsed = parseToml(content) as any;
    return {
      storage: parsed.storage,
      sync: parsed.sync,
    };
  } catch (err) {
    console.warn(`Warning: Failed to parse config file at ${configPath}: ${err}`);
    return null;
  }
}

/**
 * Deep merge two config objects, with b taking precedence over a.
 */
function mergeConfig(a: Config, b: Partial<Config> | null): Config {
  if (!b) return a;

  return {
    storage: {
      engine: b.storage?.engine ?? a.storage.engine,
      file: b.storage?.file ?? a.storage.file,
      "github-issues": b.storage?.["github-issues"] ?? a.storage["github-issues"],
      "github-projects": b.storage?.["github-projects"] ?? a.storage["github-projects"],
    },
    sync: b.sync !== undefined ? {
      github: {
        ...a.sync?.github,
        ...b.sync?.github,
      },
    } : a.sync,
  };
}

/**
 * Load configuration with precedence: per-project > global > defaults
 * @param storagePath Optional storage path to load per-project config from
 * @returns Merged configuration object
 */
export function loadConfig(storagePath?: string): Config {
  // Start with defaults
  let config = { ...DEFAULT_CONFIG };

  // Layer global config
  const globalConfig = parseConfigFile(getConfigPath());
  config = mergeConfig(config, globalConfig);

  // Layer per-project config if storage path provided
  if (storagePath) {
    const projectConfig = parseConfigFile(getProjectConfigPath(storagePath));
    config = mergeConfig(config, projectConfig);
  }

  return config;
}


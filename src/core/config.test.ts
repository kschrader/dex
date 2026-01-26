import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { loadConfig, getConfigPath, getProjectConfigPath } from "./config.js";
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  testEnv,
} from "../test-utils/test-env.js";

describe("Config", () => {
  describe("getConfigPath", () => {
    it("returns path within DEX_HOME", () => {
      const configPath = getConfigPath();
      expect(configPath).toBe(path.join(testEnv.dexHome, "dex.toml"));
    });

    it("uses XDG_CONFIG_HOME when DEX_HOME is not set", () => {
      const originalDexHome = process.env.DEX_HOME;
      delete process.env.DEX_HOME;

      try {
        const configPath = getConfigPath();
        expect(configPath).toBe(
          path.join(testEnv.configHome, "dex", "dex.toml"),
        );
      } finally {
        process.env.DEX_HOME = originalDexHome;
      }
    });
  });

  describe("loadConfig", () => {
    let originalCwd: string;

    beforeEach(() => {
      originalCwd = process.cwd();
      // Change to a non-git temp dir to prevent project config from interfering
      process.chdir(testEnv.tempBase);
    });

    afterEach(() => {
      process.chdir(originalCwd);
      // Clean up any config file we created
      if (fs.existsSync(testEnv.globalConfigPath)) {
        fs.unlinkSync(testEnv.globalConfigPath);
      }
    });

    it("returns default config when file doesn't exist", () => {
      const config = loadConfig();

      expect(config.storage.engine).toBe("file");
      expect(config.storage.file?.path).toBeUndefined();
    });

    it("loads file storage config", () => {
      fs.writeFileSync(
        testEnv.globalConfigPath,
        `[storage]
engine = "file"

[storage.file]
path = "/custom/path/.dex"
`,
      );

      const config = loadConfig();

      expect(config.storage.engine).toBe("file");
      expect(config.storage.file?.path).toBe("/custom/path/.dex");
    });

    it("throws error on malformed TOML", () => {
      fs.writeFileSync(testEnv.globalConfigPath, "invalid toml [[[");

      expect(() => loadConfig()).toThrow("Failed to parse config file");
    });

    it("handles missing storage section", () => {
      fs.writeFileSync(testEnv.globalConfigPath, "# Empty config\n");

      const config = loadConfig();

      expect(config.storage.engine).toBe("file");
    });
  });

  describe("getProjectConfigPath", () => {
    let tempGitDir: string;
    let originalCwd: string;

    beforeEach(() => {
      originalCwd = process.cwd();

      // Create temp git repo
      tempGitDir = fs.mkdtempSync(path.join(os.tmpdir(), "dex-git-test-"));
      process.chdir(tempGitDir);
      execSync("git init", { cwd: tempGitDir, stdio: "ignore" });
    });

    afterEach(() => {
      process.chdir(originalCwd);
      fs.rmSync(tempGitDir, { recursive: true, force: true });

      // Clean up any global config we created
      if (fs.existsSync(testEnv.globalConfigPath)) {
        fs.unlinkSync(testEnv.globalConfigPath);
      }
    });

    it("returns .dex/config.toml at git root", () => {
      const projectConfigPath = getProjectConfigPath();

      // Normalize paths for macOS /private prefix
      const expectedDir = fs.realpathSync(tempGitDir);
      const expectedPath = path.join(expectedDir, ".dex", "config.toml");
      expect(projectConfigPath).toBe(expectedPath);
    });

    it("finds git root from subdirectory", () => {
      // Create nested directory
      const subdir = path.join(tempGitDir, "src", "cli");
      fs.mkdirSync(subdir, { recursive: true });
      process.chdir(subdir);

      const projectConfigPath = getProjectConfigPath();

      // Should still point to git root (normalize paths for macOS)
      const expectedDir = fs.realpathSync(tempGitDir);
      const expectedPath = path.join(expectedDir, ".dex", "config.toml");
      expect(projectConfigPath).toBe(expectedPath);
    });

    it("returns null when not in a git repo", () => {
      // Change to temp dir without git
      const nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), "dex-non-git-"));
      try {
        process.chdir(nonGitDir);

        const projectConfigPath = getProjectConfigPath();

        expect(projectConfigPath).toBeNull();
      } finally {
        process.chdir(originalCwd);
        fs.rmSync(nonGitDir, { recursive: true, force: true });
      }
    });

    it("project config has precedence over global config", () => {
      // Write global config
      fs.writeFileSync(
        testEnv.globalConfigPath,
        `[sync.github]
enabled = false
`,
      );

      // Write project config
      const projectConfigPath = path.join(tempGitDir, ".dex", "config.toml");
      fs.mkdirSync(path.dirname(projectConfigPath), { recursive: true });
      fs.writeFileSync(
        projectConfigPath,
        `[sync.github]
enabled = true
`,
      );

      const config = loadConfig();

      // Project config should override global
      expect(config.sync?.github?.enabled).toBe(true);
    });
  });
});

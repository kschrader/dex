/**
 * Global test environment configuration.
 *
 * This module provides isolated temp directories for tests and is initialized
 * by vitest.setup.ts before any tests run.
 *
 * Usage:
 *   import { testEnv } from "../test-utils/test-env.js";
 *   const configPath = testEnv.globalConfigPath;
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  describe,
  it,
  test,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";

export interface TestEnv {
  /** Base temp directory for all test isolation */
  tempBase: string;
  /** XDG_CONFIG_HOME equivalent - use for global config files */
  configHome: string;
  /** DEX_HOME equivalent - the dex config directory */
  dexHome: string;
  /** Path to the global dex.toml config file */
  globalConfigPath: string;
}

// Lazily initialized test environment
let _testEnv: TestEnv | null = null;

// Store original env values for restoration
let _originalEnv: { XDG_CONFIG_HOME?: string; DEX_HOME?: string } | null = null;

/**
 * Initialize the test environment. Called by vitest.setup.ts.
 * Creates temp directories and sets environment variables.
 */
export function initTestEnv(): TestEnv {
  if (_testEnv) {
    return _testEnv;
  }

  // Store original values before modifying
  _originalEnv = {
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    DEX_HOME: process.env.DEX_HOME,
  };

  const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "dex-test-global-"));
  const configHome = path.join(tempBase, "config");
  const dexHome = path.join(configHome, "dex");

  fs.mkdirSync(dexHome, { recursive: true });

  // Set environment variables
  process.env.XDG_CONFIG_HOME = configHome;
  process.env.DEX_HOME = dexHome;

  _testEnv = {
    tempBase,
    configHome,
    dexHome,
    globalConfigPath: path.join(dexHome, "dex.toml"),
  };

  return _testEnv;
}

/**
 * Clean up the test environment. Called by vitest.setup.ts after all tests.
 */
export function cleanupTestEnv(): void {
  // Restore original environment
  if (_originalEnv) {
    if (_originalEnv.XDG_CONFIG_HOME !== undefined) {
      process.env.XDG_CONFIG_HOME = _originalEnv.XDG_CONFIG_HOME;
    } else {
      delete process.env.XDG_CONFIG_HOME;
    }

    if (_originalEnv.DEX_HOME !== undefined) {
      process.env.DEX_HOME = _originalEnv.DEX_HOME;
    } else {
      delete process.env.DEX_HOME;
    }
    _originalEnv = null;
  }

  // Clean up temp directory
  if (_testEnv) {
    try {
      fs.rmSync(_testEnv.tempBase, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    _testEnv = null;
  }
}

/**
 * Get the test environment. Throws if not initialized.
 */
function getTestEnv(): TestEnv {
  if (!_testEnv) {
    throw new Error(
      "Test environment not initialized. This should be set up by vitest.setup.ts",
    );
  }
  return _testEnv;
}

/**
 * Convenience export for direct access to the test environment.
 * Use this when you need access to the global test paths (tempBase, configHome, etc).
 */
export const testEnv: TestEnv = new Proxy({} as TestEnv, {
  get(_target, prop: keyof TestEnv) {
    return getTestEnv()[prop];
  },
});

// Re-export vitest utilities for convenience
export {
  describe,
  it,
  test,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  vi,
};

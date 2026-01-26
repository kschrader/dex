/**
 * Global test setup - ensures all tests run in isolation from the real environment.
 *
 * This file runs before any test file and:
 * - Redirects XDG_CONFIG_HOME to a temp directory (protects ~/.config/dex/)
 * - Redirects DEX_HOME to a temp directory
 * - Cleans up temp directories after all tests complete
 *
 * Tests can import { testEnv } from "./src/test-utils/test-env.js" to get
 * the paths to these temp directories when they need to write config files.
 */

import { beforeAll, afterAll } from "vitest";
import { initTestEnv, cleanupTestEnv } from "./src/test-utils/test-env.js";

beforeAll(() => {
  initTestEnv();
});

afterAll(() => {
  cleanupTestEnv();
});

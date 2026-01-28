import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { captureOutput, type CapturedOutput } from "./test-helpers.js";
import { dirCommand } from "./dir.js";

describe("dir command", () => {
  let output: CapturedOutput;
  let originalDexHome: string | undefined;
  let originalStoragePath: string | undefined;

  beforeEach(() => {
    output = captureOutput();
    originalDexHome = process.env.DEX_HOME;
    originalStoragePath = process.env.DEX_STORAGE_PATH;
  });

  afterEach(() => {
    output.restore();
    if (originalDexHome !== undefined) {
      process.env.DEX_HOME = originalDexHome;
    } else {
      delete process.env.DEX_HOME;
    }
    if (originalStoragePath !== undefined) {
      process.env.DEX_STORAGE_PATH = originalStoragePath;
    } else {
      delete process.env.DEX_STORAGE_PATH;
    }
  });

  it("prints storage path by default", () => {
    process.env.DEX_STORAGE_PATH = "/tmp/test-storage";

    dirCommand([]);

    const out = output.stdout.join("\n");
    expect(out).toBe("/tmp/test-storage");
  });

  it("prints dex home directory with --global flag", () => {
    process.env.DEX_HOME = "/tmp/test-dex-home";

    dirCommand(["--global"]);

    const out = output.stdout.join("\n");
    expect(out).toBe("/tmp/test-dex-home");
  });

  it("prints dex home directory with -g short flag", () => {
    process.env.DEX_HOME = "/tmp/test-dex-home-short";

    dirCommand(["-g"]);

    const out = output.stdout.join("\n");
    expect(out).toBe("/tmp/test-dex-home-short");
  });
});

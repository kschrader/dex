import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { captureOutput, type CapturedOutput } from "./test-helpers.js";
import { versionCommand } from "./version.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { version: string };

describe("version command", () => {
  let output: CapturedOutput;

  beforeEach(() => {
    output = captureOutput();
  });

  afterEach(() => {
    output.restore();
  });

  it("outputs version matching package.json", () => {
    versionCommand();

    const out = output.stdout.join("\n");
    expect(out).toBe(`dex v${pkg.version}`);
  });
});

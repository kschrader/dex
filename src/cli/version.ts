import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { version: string };

export function versionCommand(): void {
  console.log(`dex v${pkg.version}`);
}

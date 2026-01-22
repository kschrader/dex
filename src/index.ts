#!/usr/bin/env node

import { startMcpServer } from "./mcp/server.js";
import { runCli } from "./cli/commands.js";

const args = process.argv.slice(2);

// Parse global options
let storagePath: string | undefined;
const filteredArgs: string[] = [];

for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === "--storage-path") {
    const nextArg = args[i + 1];
    if (!nextArg || nextArg.startsWith("-")) {
      console.error("Error: --storage-path requires a value");
      process.exit(1);
    }
    storagePath = nextArg;
    i++; // Skip the value in next iteration
  } else if (arg.startsWith("--storage-path=")) {
    const value = arg.slice("--storage-path=".length);
    if (!value) {
      console.error("Error: --storage-path requires a value");
      process.exit(1);
    }
    storagePath = value;
  } else {
    filteredArgs.push(arg);
  }
}

const command = filteredArgs[0];

if (command === "mcp") {
  startMcpServer(storagePath).catch((err) => {
    console.error("MCP server error:", err);
    process.exit(1);
  });
} else {
  runCli(filteredArgs, { storagePath });
}

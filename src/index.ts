// src/index.ts — Entry point
// Usage: npx ts-node src/index.ts [optional task]

import { runAgent } from "./agent";

const taskOverride = process.argv.slice(2).join(" ") || undefined;

runAgent(taskOverride).catch((err) => {
  console.error("\x1b[31m[FATAL]\x1b[0m Agent crashed:", err.message);
  process.exit(1);
});

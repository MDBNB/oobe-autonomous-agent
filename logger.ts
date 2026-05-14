// src/logger.ts — Simple colored console logger

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const COLORS = {
  debug: "\x1b[36m",  // cyan
  info:  "\x1b[32m",  // green
  warn:  "\x1b[33m",  // yellow
  error: "\x1b[31m",  // red
  reset: "\x1b[0m",
};

const currentLevel = LEVELS[(process.env.LOG_LEVEL as keyof typeof LEVELS) ?? "info"] ?? 1;

function log(level: keyof typeof LEVELS, prefix: string, msg: string, data?: unknown) {
  if (LEVELS[level] < currentLevel) return;
  const ts = new Date().toISOString().substring(11, 23);
  const color = COLORS[level];
  const reset = COLORS.reset;
  const line = data !== undefined
    ? `${color}[${ts}] [${level.toUpperCase()}] ${prefix} ${msg}${reset}\n${JSON.stringify(data, null, 2)}`
    : `${color}[${ts}] [${level.toUpperCase()}] ${prefix} ${msg}${reset}`;
  console.log(line);
}

export const logger = {
  debug: (prefix: string, msg: string, data?: unknown) => log("debug", prefix, msg, data),
  info:  (prefix: string, msg: string, data?: unknown) => log("info",  prefix, msg, data),
  warn:  (prefix: string, msg: string, data?: unknown) => log("warn",  prefix, msg, data),
  error: (prefix: string, msg: string, data?: unknown) => log("error", prefix, msg, data),
};

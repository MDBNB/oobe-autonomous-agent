// src/ace-executor.ts
// Task execution via AceDataCloud APIs.
// Calls the tool selected by SAP discovery and returns the result.

import axios from "axios";
import { logger } from "./logger";
import type { SapTool } from "./sap-discovery";

export interface ExecutionResult {
  success: boolean;
  toolId: string;
  toolName: string;
  task: string;
  output: string;
  rawData?: unknown;
  durationMs: number;
  error?: string;
}

/**
 * executeTask
 * Calls the given SAP tool via AceDataCloud and returns the output.
 * Supports: AI Chat, Google SERP, Translation, URL shortener.
 */
export async function executeTask(
  tool: SapTool,
  task: string
): Promise<ExecutionResult> {
  logger.info("⚙️  ACE", `Executing via "${tool.name}" — task: "${task}"`);
  const start = Date.now();

  const apiKey = process.env.ACE_API_KEY ?? process.env.ACE_PLATFORM_TOKEN ?? "";

  try {
    let output: string;
    let rawData: unknown;

    switch (tool.id) {
      case "ace-serp-google":
        ({ output, rawData } = await runSerpSearch(task, apiKey));
        break;

      case "ace-translate":
        ({ output, rawData } = await runTranslation(task, apiKey));
        break;

      case "ace-short-url":
        ({ output, rawData } = await runShortUrl(task, apiKey));
        break;

      case "ace-ai-chat":
      case "ace-deepseek-chat":
      default:
        ({ output, rawData } = await runAiChat(task, apiKey, tool));
        break;
    }

    const durationMs = Date.now() - start;
    logger.info("⚙️  ACE", `Task completed in ${durationMs}ms`);

    return {
      success: true,
      toolId: tool.id,
      toolName: tool.name,
      task,
      output,
      rawData,
      durationMs,
    };
  } catch (err: any) {
    logger.error("⚙️  ACE", `Execution failed: ${err.message}`);
    return {
      success: false,
      toolId: tool.id,
      toolName: tool.name,
      task,
      output: "",
      durationMs: Date.now() - start,
      error: err.message,
    };
  }
}

// ─────────────────────────────────────────────
// Tool-specific executors
// ─────────────────────────────────────────────

async function runAiChat(
  task: string,
  apiKey: string,
  tool: SapTool
): Promise<{ output: string; rawData: unknown }> {
  // AceDataCloud AI chat endpoint is OpenAI-compatible
  const endpoint =
    tool.endpoint.includes("deepseek")
      ? "https://api.acedata.cloud/deepseek/chat/completions"
      : "https://api.acedata.cloud/chatgpt/chat/completions";

  logger.debug("⚙️  ACE", `AI Chat → ${endpoint}`);

  const res = await axios.post(
    endpoint,
    {
      model: tool.id.includes("deepseek") ? "deepseek-chat" : "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful autonomous agent. Execute the given task concisely and accurately. Return only the result without preamble.",
        },
        { role: "user", content: task },
      ],
      max_tokens: 1024,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 30_000,
    }
  );

  const output: string =
    res.data?.choices?.[0]?.message?.content ?? "No response from AI";
  return { output, rawData: res.data };
}

async function runSerpSearch(
  task: string,
  apiKey: string
): Promise<{ output: string; rawData: unknown }> {
  // Extract query from task
  const query = task.replace(/(search for|find|look up|google)/gi, "").trim();

  logger.debug("⚙️  ACE", `SERP search query: "${query}"`);

  const res = await axios.post(
    "https://api.acedata.cloud/serp/google",
    { q: query, num: 5 },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 20_000,
    }
  );

  const results = res.data?.organic_results ?? res.data?.results ?? [];
  const output = results
    .slice(0, 5)
    .map((r: any, i: number) => `${i + 1}. ${r.title}\n   ${r.snippet}\n   ${r.link}`)
    .join("\n\n");

  return { output: output || "No results found", rawData: res.data };
}

async function runTranslation(
  task: string,
  apiKey: string
): Promise<{ output: string; rawData: unknown }> {
  // Naive: translate everything after "translate: " or default to Arabic
  const textMatch = task.match(/translate[:\s]+(.+)/i);
  const text = textMatch ? textMatch[1] : task;
  const targetLang = task.match(/to\s+(\w+)/i)?.[1] ?? "ar";

  logger.debug("⚙️  ACE", `Translating to ${targetLang}`);

  const res = await axios.post(
    "https://api.acedata.cloud/localization/translations",
    { text, source_lang: "auto", target_lang: targetLang },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 15_000,
    }
  );

  const output: string = res.data?.translated_text ?? res.data?.translation ?? "Translation failed";
  return { output, rawData: res.data };
}

async function runShortUrl(
  task: string,
  apiKey: string
): Promise<{ output: string; rawData: unknown }> {
  const urlMatch = task.match(/https?:\/\/[^\s]+/);
  const url = urlMatch?.[0] ?? "https://oobeprotocol.ai";

  const res = await axios.post(
    "https://api.acedata.cloud/shorturl/create",
    { url },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 10_000,
    }
  );

  const output: string = res.data?.short_url ?? res.data?.url ?? "Failed to shorten";
  return { output, rawData: res.data };
}

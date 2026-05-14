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

export async function executeTask(tool: SapTool, task: string): Promise<ExecutionResult> {
  logger.info("⚙️  ACE", `Executing via "${tool.name}"`);
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
      default:
        ({ output, rawData } = await runAiChat(task, apiKey));
        break;
    }

    return { success: true, toolId: tool.id, toolName: tool.name, task, output, rawData, durationMs: Date.now() - start };
  } catch (err: any) {
    logger.error("⚙️  ACE", `Execution failed: ${err.message}`);
    return { success: false, toolId: tool.id, toolName: tool.name, task, output: "", durationMs: Date.now() - start, error: err.message };
  }
}

async function runAiChat(task: string, apiKey: string) {
  const res = await axios.post(
    "https://api.acedata.cloud/chatgpt/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful autonomous agent. Execute the given task concisely." },
        { role: "user", content: task },
      ],
      max_tokens: 1024,
    },
    { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, timeout: 30000 }
  );
  const output: string = res.data?.choices?.[0]?.message?.content ?? "No response";
  return { output, rawData: res.data };
}

async function runSerpSearch(task: string, apiKey: string) {
  const query = task.replace(/(search for|find|look up|google)/gi, "").trim();
  const res = await axios.post(
    "https://api.acedata.cloud/serp/google",
    { q: query, num: 5 },
    { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, timeout: 20000 }
  );
  const results = res.data?.organic_results ?? [];
  const output = results.slice(0, 5)
    .map((r: any, i: number) => `${i + 1}. ${r.title}\n   ${r.snippet}\n   ${r.link}`)
    .join("\n\n");
  return { output: output || "No results found", rawData: res.data };
}

async function runTranslation(task: string, apiKey: string) {
  const textMatch = task.match(/translate[:\s]+(.+)/i);
  const text = textMatch ? textMatch[1] : task;
  const targetLang = task.match(/to\s+(\w+)/i)?.[1] ?? "ar";
  const res = await axios.post(
    "https://api.acedata.cloud/localization/translations",
    { text, source_lang: "auto", target_lang: targetLang },
    { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, timeout: 15000 }
  );
  const output: string = res.data?.translated_text ?? "Translation failed";
  return { output, rawData: res.data };
}

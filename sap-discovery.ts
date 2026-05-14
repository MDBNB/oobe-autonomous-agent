// src/sap-discovery.ts
// Synapse Agent Protocol (SAP) — Tool Discovery
// Fetches on-chain registered tools from OOBE's SAP registry.
//
// The SAP program stores ToolDescriptor accounts on Solana.
// For this bounty we query the OOBE Synapse API to enumerate
// available tools, then select the best one for our task.

import axios from "axios";
import { logger } from "./logger";

const SAP_TOOL_REGISTRY_URL = "https://synapse.oobeprotocol.ai/api/tools";
const SAP_EXPLORER_API      = "https://synapse.oobeprotocol.ai/api/registry";

export interface SapTool {
  id: string;
  name: string;
  category: string;
  description: string;
  endpoint: string;
  method: "GET" | "POST";
  params: Record<string, string>;
  invocationCount: number;
  requiresPayment: boolean;
  priceUsdc?: number;
}

/**
 * discoverTools
 * Queries the SAP on-chain tool registry and returns matching tools.
 * Falls back to a curated list of AceDataCloud tools if the registry
 * is unreachable (common in testnet / devnet scenarios).
 */
export async function discoverTools(task: string): Promise<SapTool[]> {
  logger.info("🔍 SAP", `Discovering tools for task: "${task}"`);

  try {
    const response = await axios.get(SAP_TOOL_REGISTRY_URL, {
      params: { category: inferCategory(task), limit: 10 },
      timeout: 8000,
      headers: { "X-OOBE-API-KEY": process.env.OOBE_API_KEY ?? "" },
    });

    if (response.data?.tools?.length) {
      logger.info("🔍 SAP", `Found ${response.data.tools.length} tools on-chain`);
      return response.data.tools as SapTool[];
    }
  } catch (err: any) {
    logger.warn("🔍 SAP", `Registry unreachable (${err.message}), using fallback tool list`);
  }

  // Fallback: return the AceDataCloud tools that are always available
  return getFallbackTools(task);
}

/**
 * selectBestTool
 * Simple heuristic: pick the tool whose name / category best matches
 * the task description.
 */
export function selectBestTool(tools: SapTool[], task: string): SapTool {
  const keywords = task.toLowerCase().split(/\s+/);

  let best = tools[0];
  let bestScore = 0;

  for (const tool of tools) {
    const haystack = `${tool.name} ${tool.description} ${tool.category}`.toLowerCase();
    const score = keywords.filter((kw) => haystack.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      best = tool;
    }
  }

  logger.info("✅ SAP", `Selected tool: "${best.name}" (score: ${bestScore})`);
  return best;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function inferCategory(task: string): string {
  const t = task.toLowerCase();
  if (t.match(/search|news|web|browse|scrape/))    return "web_search";
  if (t.match(/image|photo|picture|generate/))     return "ai_image";
  if (t.match(/video|clip|film/))                  return "ai_video";
  if (t.match(/audio|music|speech|tts|voice/))     return "ai_audio";
  if (t.match(/translate|language|locali[sz]/))    return "translate";
  if (t.match(/proxy|ip|scraping/))               return "proxy";
  if (t.match(/captcha|verification/))             return "captcha";
  return "ai_chat";
}

/**
 * Hardcoded AceDataCloud SAP-compatible tools.
 * These are real endpoints that the agent can call after x402 payment.
 */
function getFallbackTools(task: string): SapTool[] {
  const allTools: SapTool[] = [
    {
      id: "ace-serp-google",
      name: "Google SERP Search",
      category: "web_search",
      description: "Search Google and return structured results including titles, snippets, and URLs",
      endpoint: "https://api.acedata.cloud/serp/google",
      method: "POST",
      params: { q: "string", num: "number" },
      invocationCount: 0,
      requiresPayment: true,
      priceUsdc: 0.001,
    },
    {
      id: "ace-ai-chat",
      name: "AI Chat Completion",
      category: "ai_chat",
      description: "Send a prompt to Claude/GPT/Gemini and receive a completion",
      endpoint: "https://api.acedata.cloud/chatgpt/completions",
      method: "POST",
      params: { model: "string", messages: "array" },
      invocationCount: 0,
      requiresPayment: true,
      priceUsdc: 0.002,
    },
    {
      id: "ace-deepseek-chat",
      name: "DeepSeek Chat",
      category: "ai_chat",
      description: "DeepSeek reasoning model for complex tasks",
      endpoint: "https://api.acedata.cloud/deepseek/completions",
      method: "POST",
      params: { model: "string", messages: "array" },
      invocationCount: 0,
      requiresPayment: true,
      priceUsdc: 0.001,
    },
    {
      id: "ace-translate",
      name: "Translation API",
      category: "translate",
      description: "Translate text between 100+ languages",
      endpoint: "https://api.acedata.cloud/localization/translate",
      method: "POST",
      params: { text: "string", source_lang: "string", target_lang: "string" },
      invocationCount: 0,
      requiresPayment: true,
      priceUsdc: 0.0005,
    },
    {
      id: "ace-short-url",
      name: "URL Shortener",
      category: "utility",
      description: "Shorten long URLs to short trackable links",
      endpoint: "https://api.acedata.cloud/shorturl/create",
      method: "POST",
      params: { url: "string" },
      invocationCount: 0,
      requiresPayment: false,
    },
  ];

  // Filter by inferred category, or return all
  const category = inferCategory(task);
  const filtered = allTools.filter((t) => t.category === category || t.category === "ai_chat");
  return filtered.length ? filtered : allTools;
}

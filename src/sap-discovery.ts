import axios from "axios";
import { logger } from "./logger";

const SAP_TOOL_REGISTRY_URL = "https://synapse.oobeprotocol.ai/api/tools";

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
  return getFallbackTools(task);
}

export function selectBestTool(tools: SapTool[], task: string): SapTool {
  const keywords = task.toLowerCase().split(/\s+/);
  let best = tools[0];
  let bestScore = 0;
  for (const tool of tools) {
    const haystack = `${tool.name} ${tool.description} ${tool.category}`.toLowerCase();
    const score = keywords.filter((kw) => haystack.includes(kw)).length;
    if (score > bestScore) { bestScore = score; best = tool; }
  }
  logger.info("✅ SAP", `Selected tool: "${best.name}" (score: ${bestScore})`);
  return best;
}

function inferCategory(task: string): string {
  const t = task.toLowerCase();
  if (t.match(/search|news|web|browse/)) return "web_search";
  if (t.match(/image|photo|picture/))    return "ai_image";
  if (t.match(/translate|language/))     return "translate";
  return "ai_chat";
}

function getFallbackTools(task: string): SapTool[] {
  const allTools: SapTool[] = [
    {
      id: "ace-serp-google",
      name: "Google SERP Search",
      category: "web_search",
      description: "Search Google and return structured results",
      endpoint: "https://api.acedata.cloud/serp/google",
      method: "POST",
      params: { q: "string" },
      invocationCount: 0,
      requiresPayment: true,
      priceUsdc: 0.001,
    },
    {
      id: "ace-ai-chat",
      name: "AI Chat Completion",
      category: "ai_chat",
      description: "Send a prompt to AI and receive a completion",
      endpoint: "https://api.acedata.cloud/chatgpt/completions",
      method: "POST",
      params: { model: "string", messages: "array" },
      invocationCount: 0,
      requiresPayment: true,
      priceUsdc: 0.002,
    },
    {
      id: "ace-translate",
      name: "Translation API",
      category: "translate",
      description: "Translate text between 100+ languages",
      endpoint: "https://api.acedata.cloud/localization/translate",
      method: "POST",
      params: { text: "string", target_lang: "string" },
      invocationCount: 0,
      requiresPayment: true,
      priceUsdc: 0.0005,
    },
  ];
  const category = inferCategory(task);
  const filtered = allTools.filter((t) => t.category === category || t.category === "ai_chat");
  return filtered.length ? filtered : allTools;
}

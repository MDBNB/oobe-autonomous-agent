// src/agent.ts
import "dotenv/config";
import { logger } from "./logger";
import { discoverTools, selectBestTool } from "./sap-discovery";
import { executeTask } from "./ace-executor";
import { payWithX402 } from "./x402-payment";
import type { SapTool } from "./sap-discovery";
import type { ExecutionResult } from "./ace-executor";
import type { X402PaymentResult } from "./x402-payment";

export interface AgentRunResult {
  trigger: string;
  task: string;
  toolUsed: SapTool;
  execution: ExecutionResult;
  payment: X402PaymentResult | null;
  totalDurationMs: number;
  completedAt: string;
}

export async function runAgent(task?: string): Promise<AgentRunResult> {
  const agentTask = task ?? process.env.AGENT_TASK ?? "Summarize the latest Solana ecosystem news";
  const startTime = Date.now();

  printBanner();

  logger.info("🚀 AGENT", `=== STEP 1: TRIGGER ===`);
  logger.info("🚀 AGENT", `Task received: "${agentTask}"`);

  logger.info("🔍 AGENT", `=== STEP 2: SAP TOOL DISCOVERY ===`);
  const availableTools = await discoverTools(agentTask);
  if (!availableTools.length) throw new Error("SAP discovery returned no tools");

  availableTools.forEach((t, i) => {
    logger.info("🔍 AGENT", `  ${i + 1}. [${t.category}] ${t.name}`);
  });

  const selectedTool = selectBestTool(availableTools, agentTask);

  logger.info("⚙️  AGENT", `=== STEP 3: EXECUTION ===`);
  const execution = await executeTask(selectedTool, agentTask);

  if (execution.success) {
    logger.info("⚙️  AGENT", `Execution successful (${execution.durationMs}ms)`);
    logger.info("⚙️  AGENT", `\n─────────── OUTPUT ───────────\n${execution.output}\n──────────────────────────────`);
  } else {
    logger.warn("⚙️  AGENT", `Execution failed: ${execution.error}`);
  }

  logger.info("💳 AGENT", `=== STEP 4: x402 PAYMENT ===`);
  let payment: X402PaymentResult | null = null;
  const orderId = process.env.ACE_X402_ORDER_ID;

  if (!orderId) {
    logger.warn("💳 AGENT", "ACE_X402_ORDER_ID not set — skipping payment step");
  } else if (!process.env.ACE_X402_PRIVATE_KEY || process.env.ACE_X402_PRIVATE_KEY === "0xyour_evm_private_key_here") {
    logger.warn("💳 AGENT", "ACE_X402_PRIVATE_KEY not configured — skipping payment step");
  } else {
    payment = await payWithX402(orderId);
    if (payment.success) {
      logger.info("💳 AGENT", `✅ Payment confirmed!`);
      if (payment.receipt?.transactionHash) {
        logger.info("💳 AGENT", `   Tx Hash : ${payment.receipt.transactionHash}`);
        logger.info("💳 AGENT", `   Network : ${payment.receipt.network}`);
        logger.info("💳 AGENT", `   Amount  : ${payment.receipt.amountPaid} USDC`);
      }
    } else {
      logger.error("💳 AGENT", `Payment failed: ${payment.error}`);
    }
  }

  const totalDurationMs = Date.now() - startTime;
  const result: AgentRunResult = {
    trigger: "autonomous",
    task: agentTask,
    toolUsed: selectedTool,
    execution,
    payment,
    totalDurationMs,
    completedAt: new Date().toISOString(),
  };

  printReport(result);
  return result;
}

function printBanner() {
  console.log("\x1b[35m");
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║   OOBE × Ace Data Cloud — Autonomous On-Chain Agent     ║");
  console.log("║   Synapse Agent Protocol  +  x402 Payment               ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log("\x1b[0m");
}

function printReport(result: AgentRunResult) {
  const { execution, payment, toolUsed, totalDurationMs } = result;
  console.log("\n\x1b[35m╔══════════════════════ AGENT REPORT ══════════════════════╗\x1b[0m");
  console.log(`  Task       : ${result.task}`);
  console.log(`  Tool Used  : ${toolUsed.name} (${toolUsed.id})`);
  console.log(`  Execution  : ${execution.success ? "✅ SUCCESS" : "❌ FAILED"}`);
  console.log(`  Payment    : ${payment ? (payment.success ? "✅ PAID ON-CHAIN" : "❌ FAILED") : "⏭️  SKIPPED"}`);
  console.log(`  Duration   : ${totalDurationMs}ms`);
  console.log(`  Completed  : ${result.completedAt}`);
  if (payment?.receipt?.transactionHash && payment.receipt.transactionHash !== "pending") {
    console.log(`  Tx Hash    : ${payment.receipt.transactionHash}`);
  }
  console.log("\x1b[35m╚══════════════════════════════════════════════════════════╝\x1b[0m\n");
}

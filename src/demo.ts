import { logger } from "./logger";
import { discoverTools, selectBestTool } from "./sap-discovery";

async function demo() {
  console.log("\x1b[35m");
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║   OOBE × Ace Data Cloud — DEMO MODE                    ║");
  console.log("║   Full workflow simulation (no real keys needed)        ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log("\x1b[0m");

  const task = "Search for the latest Solana DeFi news and summarize the top stories";
  const startTime = Date.now();

  logger.info("🚀 DEMO", "=== STEP 1: TRIGGER ===");
  logger.info("🚀 DEMO", `Task: "${task}"`);
  await sleep(300);

  logger.info("🔍 DEMO", "=== STEP 2: SAP TOOL DISCOVERY ===");
  logger.info("🔍 DEMO", "Querying OOBE Synapse SAP Registry...");
  await sleep(500);

  const tools = await discoverTools(task);
  logger.info("🔍 DEMO", `Discovered ${tools.length} registered tools:`);
  tools.forEach((t, i) => {
    logger.info("🔍 DEMO", `  ${i + 1}. [${t.category.padEnd(12)}] ${t.name}`);
  });

  const selected = selectBestTool(tools, task);
  logger.info("🔍 DEMO", `→ Best match: "${selected.name}"`);
  await sleep(300);

  logger.info("⚙️  DEMO", "=== STEP 3: TASK EXECUTION (AceDataCloud) ===");
  logger.info("⚙️  DEMO", `Calling ${selected.name} API...`);
  await sleep(800);

  const mockOutput = `
1. Solana DEX Volume Hits Record $8.2B in 24 Hours
   Raydium and Jupiter led the surge as new token launches drove unprecedented activity.
   https://decrypt.co/solana-dex-record

2. Kamino Finance Launches V3 with Automated Rebalancing
   The lending protocol introduces AI-powered position management for DLMM pools.
   https://solanafloor.com/kamino-v3

3. OOBE Protocol Releases Synapse Agent Protocol (SAP)
   New on-chain tool registry enables autonomous agents to discover and pay for services.
   https://x.com/OOBEonSol/status/latest
`.trim();

  logger.info("⚙️  DEMO", `\n─────────── OUTPUT ───────────\n${mockOutput}\n──────────────────────────────`);
  await sleep(300);

  logger.info("💳 DEMO", "=== STEP 4: x402 ON-CHAIN PAYMENT ===");
  logger.info("💳 DEMO", "Payer address: 0xDEMO...WALLET");
  logger.info("💳 DEMO", "Step 1: POST /orders/{id}/pay/ → 402 Payment Required");
  await sleep(400);
  logger.info("💳 DEMO", "Received: 0.0025 USDC → Base mainnet");
  await sleep(300);
  logger.info("💳 DEMO", "Step 3: Signing EIP-712 TransferWithAuthorization...");
  await sleep(500);
  logger.info("💳 DEMO", "Step 4: Retrying with X-PAYMENT header...");
  await sleep(600);
  logger.info("💳 DEMO", "✅ Payment confirmed on-chain!");
  logger.info("💳 DEMO", "   Tx Hash : 0x7f3a2b1c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a");
  logger.info("💳 DEMO", "   Network : Base (Coinbase L2)");
  logger.info("💳 DEMO", "   Amount  : 0.002500 USDC");

  const totalMs = Date.now() - startTime;
  console.log("\n\x1b[35m╔══════════════════════ AGENT REPORT ══════════════════════╗\x1b[0m");
  console.log(`  Task       : ${task.substring(0, 55)}...`);
  console.log(`  Tool Used  : ${selected.name} (${selected.id})`);
  console.log(`  Execution  : ✅ SUCCESS`);
  console.log(`  Payment    : ✅ PAID ON-CHAIN (Base / USDC)`);
  console.log(`  Duration   : ${totalMs}ms`);
  console.log(`  Completed  : ${new Date().toISOString()}`);
  console.log("\x1b[35m╚══════════════════════════════════════════════════════════╝\x1b[0m\n");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

demo().catch(console.error);

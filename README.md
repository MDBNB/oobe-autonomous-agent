# OOBE × Ace Data Cloud — Autonomous On-Chain Agent

> **Superteam Earn Bounty Submission**  
> An autonomous agent that discovers tools via SAP, executes tasks via Ace Data Cloud, and settles payments on-chain using x402 — end-to-end without manual input.

---

## 🏗️ Architecture

```
TRIGGER ──► SAP Tool Discovery ──► Task Execution ──► x402 Payment ──► Report
              (OOBE Synapse)       (AceDataCloud)     (Base / USDC)
```

### Complete Workflow

1. **Trigger** — Agent starts with a task (from env var or CLI argument)
2. **SAP Discovery** — Queries OOBE's Synapse Agent Protocol registry to find available on-chain tools; falls back to known AceDataCloud tools
3. **Tool Selection** — Selects the best tool via keyword-scoring heuristic
4. **Execution** — Calls the selected AceDataCloud API (AI Chat, SERP Search, Translation, etc.)
5. **x402 Payment** — Executes the 3-step payment handshake:
   - POST without header → receives 402 + payment requirements
   - Signs EIP-712 `TransferWithAuthorization` with EVM private key
   - Retries with `X-PAYMENT` header → on-chain USDC settlement
6. **Report** — Prints a full summary including tx hash and output

---

## 📦 Project Structure

```
oobe-agent/
├── src/
│   ├── index.ts          # Entry point
│   ├── agent.ts          # Main orchestrator (runAgent)
│   ├── sap-discovery.ts  # SAP tool registry queries
│   ├── ace-executor.ts   # AceDataCloud API calls
│   ├── x402-payment.ts   # x402 payment flow + EIP-712 signing
│   ├── logger.ts         # Colored console logger
│   └── demo.ts           # Demo mode (no real keys needed)
├── .env.example          # Environment variable template
├── tsconfig.json
└── package.json
```

---

## 🚀 Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Run the demo (no API keys needed)

```bash
npm run demo
```

This simulates the full workflow — SAP discovery, tool selection, execution, and x402 payment — with mock data.

### 3. Run with real APIs

Copy `.env.example` → `.env` and fill in your keys:

```bash
cp .env.example .env
# Edit .env with your real credentials
npm start
```

### 4. Custom task

```bash
npx ts-node src/index.ts "Translate 'Hello world' to Arabic"
```

---

## ⚙️ Environment Variables

| Variable | Description |
|---|---|
| `AGENT_TASK` | The task for the agent to execute |
| `ACE_PLATFORM_TOKEN` | AceDataCloud platform token |
| `ACE_API_KEY` | AceDataCloud API key |
| `ACE_X402_ORDER_ID` | Order ID to pay via x402 |
| `ACE_X402_PRIVATE_KEY` | EVM private key (Base mainnet USDC) |
| `OOBE_API_KEY` | OOBE Protocol API key |
| `SOLANA_PRIVATE_KEY` | Solana wallet private key |
| `OPENAI_API_KEY` | OpenAI key (for agent reasoning) |

---

## 🔌 SAP Tool Registry

The agent queries OOBE's Synapse Agent Protocol (`synapse.oobeprotocol.ai/api/tools`) for on-chain registered tools. Each tool has:

- `id`, `name`, `category`
- `endpoint` + `method`
- `requiresPayment` + `priceUsdc`
- `invocationCount` (on-chain reputation)

If the registry is unreachable, the agent falls back to a curated list of AceDataCloud tools.

---

## 💳 x402 Payment Flow

```
Agent                          AceDataCloud Platform
  │                                    │
  │── POST /orders/{id}/pay/ ─────────►│
  │◄── 402 Payment Required ───────────│
  │    {accepts: [{network:"base",...}]}│
  │                                    │
  │ [Sign EIP-712 TransferWithAuthorization]
  │                                    │
  │── POST + X-PAYMENT header ────────►│
  │                              [Verify + Settle on Base]
  │◄── 200 OK + X-PAYMENT-RESPONSE ───│
  │    {txHash, amountPaid, ...}       │
```

Payment is settled in **USDC on Base mainnet** via Coinbase's x402 facilitator.

---

## 🛠️ Supported Tools

| Tool ID | Name | Category |
|---|---|---|
| `ace-serp-google` | Google SERP Search | web_search |
| `ace-ai-chat` | AI Chat Completion | ai_chat |
| `ace-deepseek-chat` | DeepSeek Chat | ai_chat |
| `ace-translate` | Translation API | translate |
| `ace-short-url` | URL Shortener | utility |

---

## 📄 License

MIT

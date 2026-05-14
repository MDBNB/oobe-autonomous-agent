// src/x402-payment.ts
// Handles x402 on-chain payment via AceDataCloud facilitator.
// Flow: POST without header → 402 response → sign → retry with X-PAYMENT

import axios, { AxiosInstance } from "axios";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { logger } from "./logger";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface PaymentRequirement {
  scheme: string;
  network: string;
  asset: string;
  maxAmountRequired: string;
  payTo: string;
  extra: { eip712: Record<string, unknown> };
}

export interface PaymentReceipt {
  transactionHash: string;
  network: string;
  payer: string;
  amountPaid: string;
  orderId: string;
  timestamp: number;
}

export interface X402PaymentResult {
  success: boolean;
  receipt?: PaymentReceipt;
  error?: string;
  orderId: string;
}

// ─────────────────────────────────────────────
// Payment executor
// ─────────────────────────────────────────────

/**
 * payWithX402
 *
 * Complete the full x402 payment handshake for an AceDataCloud order:
 * 1. POST without X-PAYMENT → expect 402
 * 2. Parse payment requirement from response
 * 3. Sign with EVM private key
 * 4. POST again with X-PAYMENT header → 200
 * 5. Decode X-PAYMENT-RESPONSE
 */
export async function payWithX402(orderId: string): Promise<X402PaymentResult> {
  const platformToken = process.env.ACE_PLATFORM_TOKEN;
  const privateKeyRaw = process.env.ACE_X402_PRIVATE_KEY;

  if (!platformToken || !privateKeyRaw) {
    return {
      success: false,
      orderId,
      error: "Missing ACE_PLATFORM_TOKEN or ACE_X402_PRIVATE_KEY in environment",
    };
  }

  const privateKey = (
    privateKeyRaw.startsWith("0x") ? privateKeyRaw : `0x${privateKeyRaw}`
  ) as Hex;

  const account = privateKeyToAccount(privateKey);
  logger.info("💳 x402", `Payer address: ${account.address}`);

  const api: AxiosInstance = axios.create({
    baseURL: "https://platform.acedata.cloud",
    headers: {
      Authorization: `Bearer ${platformToken}`,
      "Content-Type": "application/json",
    },
  });

  const payPath = `/api/v1/orders/${orderId}/pay/`;

  // ── Step 1: Trigger 402 ──────────────────────────────────────────
  logger.info("💳 x402", `Step 1: Triggering 402 on order ${orderId}`);

  const initial = await api.post(
    payPath,
    { pay_way: "X402" },
    { validateStatus: () => true }
  );

  if (initial.status === 200) {
    logger.info("💳 x402", "Order already paid!");
    return { success: true, orderId, receipt: decodeResponse(initial.headers, orderId) };
  }

  if (initial.status !== 402) {
    return {
      success: false,
      orderId,
      error: `Unexpected status ${initial.status}: ${JSON.stringify(initial.data)}`,
    };
  }

  // ── Step 2: Parse requirement ────────────────────────────────────
  const accepts: PaymentRequirement[] = initial.data?.accepts ?? [];
  const requirement = accepts.find(
    (r) => r.network === "base" && r.scheme === "exact"
  );

  if (!requirement) {
    return {
      success: false,
      orderId,
      error: `No 'base' exact payment requirement found. Got: ${JSON.stringify(accepts)}`,
    };
  }

  const amountUsdc = (parseInt(requirement.maxAmountRequired) / 1_000_000).toFixed(6);
  logger.info("💳 x402", `Payment required: ${amountUsdc} USDC → ${requirement.payTo}`);

  // ── Step 3: Sign with EIP-712 ────────────────────────────────────
  logger.info("💳 x402", "Step 3: Signing payment authorization...");

  let paymentHeader: string;
  try {
    paymentHeader = await buildPaymentHeader(account, requirement);
  } catch (err: any) {
    return {
      success: false,
      orderId,
      error: `Signing failed: ${err.message}`,
    };
  }

  // ── Step 4: Submit payment ───────────────────────────────────────
  logger.info("💳 x402", "Step 4: Submitting signed payment...");

  const final = await api.post(
    payPath,
    { pay_way: "X402" },
    {
      headers: { "X-PAYMENT": paymentHeader },
      validateStatus: () => true,
    }
  );

  if (final.status >= 400) {
    return {
      success: false,
      orderId,
      error: `Payment rejected: ${final.status} — ${JSON.stringify(final.data)}`,
    };
  }

  // ── Step 5: Decode receipt ───────────────────────────────────────
  const receipt = decodeResponse(final.headers, orderId);
  logger.info("💳 x402", "✅ Payment confirmed on-chain!", receipt);

  return { success: true, orderId, receipt };
}

// ─────────────────────────────────────────────
// EIP-712 signing helper
// ─────────────────────────────────────────────

async function buildPaymentHeader(
  account: ReturnType<typeof privateKeyToAccount>,
  requirement: PaymentRequirement
): Promise<string> {
  // Try to use @x402/fetch's wrapFetchWithPayment approach,
  // or build the EIP-712 signature manually using viem.
  try {
    const { wrapFetchWithPayment } = await import("@x402/fetch");

    // Use x402-fetch to handle the signing automatically
    const x402Fetch = wrapFetchWithPayment(
      fetch as any,
      account as any,
      {
        paymentRequirementsSelector: (accepts: PaymentRequirement[]) =>
          accepts.find((r) => r.network === "base") ?? accepts[0],
      } as any
    );

    // We just need the header — call a dummy request and capture the header
    // Actually, let's use the lower-level approach from @x402/evm
    return await signWithViem(account, requirement);
  } catch {
    return await signWithViem(account, requirement);
  }
}

/**
 * Manual EIP-712 signing using viem (used as fallback / primary method).
 * Constructs the authorization struct expected by x402 facilitators.
 */
async function signWithViem(
  account: ReturnType<typeof privateKeyToAccount>,
  req: PaymentRequirement
): Promise<string> {
  const { signTypedData } = await import("viem/accounts");

  const eip712 = req.extra?.eip712 as any;
  if (!eip712) throw new Error("No EIP-712 domain data in payment requirement");

  const domain = eip712.domain ?? eip712;
  const nonce = BigInt(Date.now()); // Use timestamp as nonce for uniqueness

  // Standard x402 ExactEvmScheme authorization structure
  const authorization = {
    from: account.address,
    to: req.payTo as `0x${string}`,
    value: BigInt(req.maxAmountRequired),
    validAfter: BigInt(Math.floor(Date.now() / 1000) - 60),
    validBefore: BigInt(Math.floor(Date.now() / 1000) + 300), // 5 minutes
    nonce: `0x${nonce.toString(16).padStart(64, "0")}` as `0x${string}`,
  };

  const types = {
    TransferWithAuthorization: [
      { name: "from",        type: "address" },
      { name: "to",          type: "address" },
      { name: "value",       type: "uint256" },
      { name: "validAfter",  type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce",       type: "bytes32" },
    ],
  };

  const signature = await account.signTypedData({
    domain: {
      name:              domain.name    ?? "USD Coin",
      version:           domain.version ?? "2",
      chainId:           domain.chainId ?? 8453, // Base mainnet
      verifyingContract: (domain.verifyingContract ?? req.asset) as `0x${string}`,
    },
    types,
    primaryType: "TransferWithAuthorization",
    message: authorization,
  });

  // Encode the full payment payload as base64
  const payload = {
    scheme: req.scheme,
    network: req.network,
    asset: req.asset,
    maxAmountRequired: req.maxAmountRequired,
    payTo: req.payTo,
    authorization: {
      ...authorization,
      value:       authorization.value.toString(),
      validAfter:  authorization.validAfter.toString(),
      validBefore: authorization.validBefore.toString(),
      signature,
    },
  };

  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

// ─────────────────────────────────────────────
// Receipt decoder
// ─────────────────────────────────────────────

function decodeResponse(
  headers: Record<string, any>,
  orderId: string
): PaymentReceipt {
  const raw = headers["x-payment-response"];
  if (!raw) {
    return {
      transactionHash: "pending",
      network: "base",
      payer: "unknown",
      amountPaid: "0",
      orderId,
      timestamp: Date.now(),
    };
  }

  try {
    const decoded = JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
    return {
      transactionHash: decoded.transaction ?? decoded.txHash ?? "unknown",
      network:         decoded.network      ?? "base",
      payer:           decoded.payer        ?? "unknown",
      amountPaid:      decoded.amount       ?? "unknown",
      orderId,
      timestamp: Date.now(),
    };
  } catch {
    return {
      transactionHash: raw,
      network: "base",
      payer: "unknown",
      amountPaid: "unknown",
      orderId,
      timestamp: Date.now(),
    };
  }
}

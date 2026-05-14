import axios, { AxiosInstance } from "axios";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { logger } from "./logger";

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

export async function payWithX402(orderId: string): Promise<X402PaymentResult> {
  const platformToken = process.env.ACE_PLATFORM_TOKEN;
  const privateKeyRaw = process.env.ACE_X402_PRIVATE_KEY;

  if (!platformToken || !privateKeyRaw) {
    return { success: false, orderId, error: "Missing ACE_PLATFORM_TOKEN or ACE_X402_PRIVATE_KEY" };
  }

  const privateKey = (privateKeyRaw.startsWith("0x") ? privateKeyRaw : `0x${privateKeyRaw}`) as Hex;
  const account = privateKeyToAccount(privateKey);
  logger.info("💳 x402", `Payer address: ${account.address}`);

  const api: AxiosInstance = axios.create({
    baseURL: "https://platform.acedata.cloud",
    headers: { Authorization: `Bearer ${platformToken}`, "Content-Type": "application/json" },
  });

  const payPath = `/api/v1/orders/${orderId}/pay/`;

  logger.info("💳 x402", `Step 1: Triggering 402 on order ${orderId}`);
  const initial = await api.post(payPath, { pay_way: "X402" }, { validateStatus: () => true });

  if (initial.status === 200) {
    return { success: true, orderId, receipt: decodeResponse(initial.headers, orderId) };
  }

  if (initial.status !== 402) {
    return { success: false, orderId, error: `Unexpected status ${initial.status}` };
  }

  const accepts: PaymentRequirement[] = initial.data?.accepts ?? [];
  const requirement = accepts.find((r) => r.network === "base" && r.scheme === "exact");

  if (!requirement) {
    return { success: false, orderId, error: "No base payment requirement found" };
  }

  const amountUsdc = (parseInt(requirement.maxAmountRequired) / 1_000_000).toFixed(6);
  logger.info("💳 x402", `Payment required: ${amountUsdc} USDC → ${requirement.payTo}`);

  let paymentHeader: string;
  try {
    paymentHeader = await signWithViem(account, requirement);
  } catch (err: any) {
    return { success: false, orderId, error: `Signing failed: ${err.message}` };
  }

  logger.info("💳 x402", "Step 4: Submitting signed payment...");
  const final = await api.post(payPath, { pay_way: "X402" }, {
    headers: { "X-PAYMENT": paymentHeader },
    validateStatus: () => true,
  });

  if (final.status >= 400) {
    return { success: false, orderId, error: `Payment rejected: ${final.status}` };
  }

  const receipt = decodeResponse(final.headers, orderId);
  logger.info("💳 x402", "✅ Payment confirmed on-chain!", receipt);
  return { success: true, orderId, receipt };
}

async function signWithViem(account: ReturnType<typeof privateKeyToAccount>, req: PaymentRequirement): Promise<string> {
  const eip712 = req.extra?.eip712 as any;
  if (!eip712) throw new Error("No EIP-712 domain data");

  const domain = eip712.domain ?? eip712;
  const nonce = BigInt(Date.now());

  const authorization = {
    from: account.address,
    to: req.payTo as `0x${string}`,
    value: BigInt(req.maxAmountRequired),
    validAfter: BigInt(Math.floor(Date.now() / 1000) - 60),
    validBefore: BigInt(Math.floor(Date.now() / 1000) + 300),
    nonce: `0x${nonce.toString(16).padStart(64, "0")}` as `0x${string}`,
  };

  const types = {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  };

  const signature = await account.signTypedData({
    domain: {
      name: domain.name ?? "USD Coin",
      version: domain.version ?? "2",
      chainId: domain.chainId ?? 8453,
      verifyingContract: (domain.verifyingContract ?? req.asset) as `0x${string}`,
    },
    types,
    primaryType: "TransferWithAuthorization",
    message: authorization,
  });

  const payload = {
    scheme: req.scheme,
    network: req.network,
    asset: req.asset,
    maxAmountRequired: req.maxAmountRequired,
    payTo: req.payTo,
    authorization: {
      ...authorization,
      value: authorization.value.toString(),
      validAfter: authorization.validAfter.toString(),
      validBefore: authorization.validBefore.toString(),
      signature,
    },
  };

  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

function decodeResponse(headers: Record<string, any>, orderId: string): PaymentReceipt {
  const raw = headers["x-payment-response"];
  if (!raw) return { transactionHash: "pending", network: "base", payer: "unknown", amountPaid: "0", orderId, timestamp: Date.now() };
  try {
    const decoded = JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
    return { transactionHash: decoded.transaction ?? "unknown", network: decoded.network ?? "base", payer: decoded.payer ?? "unknown", amountPaid: decoded.amount ?? "unknown", orderId, timestamp: Date.now() };
  } catch {
    return { transactionHash: raw, network: "base", payer: "unknown", amountPaid: "unknown", orderId, timestamp: Date.now() };
  }
}

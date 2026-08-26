import { Mina, PublicKey, type NetworkId } from "o1js";
import { pathToFileURL } from "node:url";

export const ZEKO_SEPOLIA_GRAPHQL_URL = "https://sepolia.zeko.io/graphql";
export const ZEKO_SEPOLIA_NETWORK_ID = "testnet";

export function zekoGraphqlUrl(): string {
  return process.env.ZEKO_GRAPHQL_URL || ZEKO_SEPOLIA_GRAPHQL_URL;
}

export function zekoArchiveUrl(): string | undefined {
  const value = process.env.ZEKO_ARCHIVE_URL?.trim();
  return value || undefined;
}

export function zekoNetworkId(): NetworkId {
  const value = process.env.ZEKO_NETWORK_ID || ZEKO_SEPOLIA_NETWORK_ID;
  if (value === "mainnet" || value === "devnet" || value === "testnet") return value;
  return { custom: value };
}

export function configureZekoNetwork(): void {
  const archive = zekoArchiveUrl();
  Mina.setActiveInstance(
    Mina.Network({
      mina: zekoGraphqlUrl(),
      ...(archive ? { archive } : {}),
      networkId: zekoNetworkId()
    })
  );
}

export function zekoTxFee(): number {
  const fee = Number(process.env.ZEKO_TX_FEE || "200000");
  if (!Number.isSafeInteger(fee) || fee <= 0) {
    throw new Error("ZEKO_TX_FEE must be a positive integer in base units.");
  }
  return fee;
}

export async function createZekoTransaction(
  sender: PublicKey,
  fee: number,
  callback: () => Promise<void>
) {
  if (!zekoGraphqlUrl().includes("sepolia.zeko.io")) {
    return Mina.transaction({ sender, fee }, callback);
  }

  // Sepolia's gateway can require o1js' single-pass test fetch mode for
  // stateful zkApp transactions that verify signatures against on-chain state.
  const root = pathToFileURL(`${process.cwd()}/`);
  const transactionModule = await import(
    new URL("node_modules/o1js/dist/node/lib/mina/v1/transaction.js", root).href
  ) as {
    createTransaction: (sender: { sender: PublicKey; fee: number }, callback: () => Promise<void>, slot: number, options: Record<string, unknown>) => any;
  };
  const fetchModule = await import(
    new URL("node_modules/o1js/dist/node/lib/mina/v1/fetch.js", root).href
  ) as {
    fetchGenesisConstants: (graphql: string) => Promise<unknown>;
  };
  await fetchModule.fetchGenesisConstants(zekoGraphqlUrl());
  return transactionModule.createTransaction(
    { sender, fee },
    callback,
    0,
    { fetchMode: "test", isFinalRunOutsideCircuit: false, proofsEnabled: true }
  );
}

export type ZekoAccountSummary = {
  publicKey: string;
  balance: { total: string };
  nonce: string;
};

export async function fetchZekoAccount(publicKey: string): Promise<ZekoAccountSummary | null> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(zekoGraphqlUrl(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: "query($publicKey: String!) { account(publicKey: $publicKey) { publicKey balance { total } nonce } }",
          variables: { publicKey }
        })
      });
      const body = await response.json() as {
        data?: { account?: ZekoAccountSummary | null };
        errors?: Array<{ message?: string }>;
      };
      if (!response.ok || body.errors?.length) {
        throw new Error(body.errors?.map((error) => error.message || "GraphQL error").join("; ") || `Zeko GraphQL request failed (${response.status})`);
      }
      return body.data?.account ?? null;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

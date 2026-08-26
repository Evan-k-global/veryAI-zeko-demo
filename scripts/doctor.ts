import "dotenv/config";

import { PrivateKey } from "o1js";

import { configureZekoNetwork, fetchZekoAccount, zekoGraphqlUrl, zekoNetworkId } from "../src/index.js";

const zekoGraphql = zekoGraphqlUrl();

const required = [
  "VERY_CLIENT_ID",
  "VERY_CLIENT_SECRET",
  "VERY_REDIRECT_URI",
  "VERY_ISSUER_PRIVATE_KEY",
  "ZEKO_DEPLOYER_PRIVATE_KEY",
  "ZEKO_ZKAPP_PRIVATE_KEY"
];

console.log(`Very AI on Zeko readiness (${zekoGraphql}, networkId=${zekoNetworkId()})\n`);
for (const name of required) {
  console.log(`${process.env[name] ? "ok" : "missing"} ${name}`);
}

configureZekoNetwork();

async function inspectKey(label: string, privateKeyBase58?: string) {
  if (!privateKeyBase58) return;
  const publicKey = PrivateKey.fromBase58(privateKeyBase58).toPublicKey();
  const response = await fetchZekoAccount(publicKey.toBase58());
  console.log(`\n${label}`);
  console.log(`publicKey ${publicKey.toBase58()}`);
  if (!response) {
    console.log("account lookup failed: not found");
    return;
  }
  console.log(`balance ${response.balance.total} base units`);
  console.log(`nonce ${response.nonce}`);
}

try {
  await inspectKey("deployer", process.env.ZEKO_DEPLOYER_PRIVATE_KEY);
  await inspectKey("zkapp", process.env.ZEKO_ZKAPP_PRIVATE_KEY);
  await inspectKey("issuer", process.env.VERY_ISSUER_PRIVATE_KEY);
} catch (error) {
  console.error(`\nZeko account check failed: ${(error as Error).message}`);
  process.exitCode = 1;
}

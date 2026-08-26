import "dotenv/config";

import { AccountUpdate, fetchAccount, PrivateKey, PublicKey } from "o1js";

import {
  VeryAiCredentialRegistry,
  configureZekoNetwork,
  createZekoTransaction,
  fetchZekoAccount,
  zekoGraphqlUrl,
  zekoNetworkId,
  zekoTxFee
} from "../src/index.js";

const deployerPrivateKey = process.env.ZEKO_DEPLOYER_PRIVATE_KEY;
const zkappPrivateKey = process.env.ZEKO_ZKAPP_PRIVATE_KEY;
const issuerPrivateKey = process.env.VERY_ISSUER_PRIVATE_KEY;

if (!deployerPrivateKey || !zkappPrivateKey || !issuerPrivateKey) {
  throw new Error(
    "Set ZEKO_DEPLOYER_PRIVATE_KEY, ZEKO_ZKAPP_PRIVATE_KEY, and VERY_ISSUER_PRIVATE_KEY."
  );
}

configureZekoNetwork();

const deployer = PrivateKey.fromBase58(deployerPrivateKey);
const zkappKey = PrivateKey.fromBase58(zkappPrivateKey);
const issuerKey = PrivateKey.fromBase58(issuerPrivateKey);
const zkapp = new VeryAiCredentialRegistry(zkappKey.toPublicKey());

const deployerAccount = await fetchZekoAccount(deployer.toPublicKey().toBase58());
if (!deployerAccount) {
  throw new Error(
    "Deployer account lookup failed: not found"
  );
}

const fee = zekoTxFee();
console.log(`Compiling VeryAiCredentialRegistry for ${zekoGraphqlUrl()}...`);
await VeryAiCredentialRegistry.compile();

const tx = await createZekoTransaction(deployer.toPublicKey(), fee, async () => {
  AccountUpdate.fundNewAccount(deployer.toPublicKey());
  await zkapp.deploy();
});

await tx.prove();
const deployResult = await tx.sign([deployer, zkappKey]).send();
if (deployResult.status === "rejected") {
  throw new Error(`Zeko rejected deployment: ${JSON.stringify(deployResult)}`);
}

async function waitForAccount(publicKey: PublicKey): Promise<void> {
  for (let attempt = 1; attempt <= 45; attempt += 1) {
    const result = await fetchZekoAccount(publicKey.toBase58());
    if (result) return;
    if (attempt < 45) await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Timed out waiting for account ${publicKey.toBase58()} to appear on Zeko.`);
}

await waitForAccount(zkapp.address);
await fetchAccount({ publicKey: zkapp.address });

const configureTx = await createZekoTransaction(deployer.toPublicKey(), fee, async () => {
  await zkapp.configure(issuerKey.toPublicKey());
});
await configureTx.prove();
const configureResult = await configureTx.sign([deployer, zkappKey]).send();
if (configureResult.status === "rejected") {
  throw new Error(`Zeko rejected issuer configuration: ${JSON.stringify(configureResult)}`);
}

console.log(JSON.stringify({
  zkappAddress: zkapp.address.toBase58(),
  issuerPublicKey: issuerKey.toPublicKey().toBase58(),
  graphQlUrl: zekoGraphqlUrl(),
  networkId: zekoNetworkId(),
  fee
}, null, 2));

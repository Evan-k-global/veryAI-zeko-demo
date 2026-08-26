import "dotenv/config";

import {
  Field,
  MerkleMap,
  PrivateKey,
  PublicKey,
  Signature,
  UInt64,
  fetchAccount
} from "o1js";

import {
  VeryAiCredentialRegistry,
  buildVeryCredential,
  configureZekoNetwork,
  createZekoTransaction,
  fetchZekoAccount,
  issuerAuthorizationMessage,
  zekoGraphqlUrl,
  zekoTxFee
} from "../src/index.js";

const graphQlUrl = zekoGraphqlUrl();
const address = process.env.ZEKO_ZKAPP_ADDRESS;
const deployerPrivateKey = process.env.ZEKO_DEPLOYER_PRIVATE_KEY;
const issuerPrivateKey = process.env.VERY_ISSUER_PRIVATE_KEY;

if (!address || !deployerPrivateKey || !issuerPrivateKey) {
  throw new Error(
    "Set ZEKO_ZKAPP_ADDRESS, ZEKO_DEPLOYER_PRIVATE_KEY, and VERY_ISSUER_PRIVATE_KEY."
  );
}

configureZekoNetwork();

const deployer = PrivateKey.fromBase58(deployerPrivateKey);
const issuer = PrivateKey.fromBase58(issuerPrivateKey);
const holder = PrivateKey.fromBase58(process.env.VERY_HOLDER_PRIVATE_KEY ?? deployerPrivateKey);
const zkapp = new VeryAiCredentialRegistry(PublicKey.fromBase58(address));

const zkappAccount = await fetchZekoAccount(zkapp.address.toBase58());
if (!zkappAccount) {
  throw new Error(`Zeko zkApp account lookup failed: ${zkapp.address.toBase58()} not found`);
}
// Populate o1js' account cache before building a stateful transaction.
await fetchAccount({ publicKey: zkapp.address });
await fetchAccount({ publicKey: deployer.toPublicKey() });

console.log("Compiling VeryAiCredentialRegistry for live smoke...");
await VeryAiCredentialRegistry.compile();

const issuedAtSlot = 0;
const credentialExpiry = 4_000_000_000n;
const nonce = `zeko-smoke-${Date.now()}`;
const credential = buildVeryCredential({
  idTokenPayload: {
    iss: "https://connect.very.org",
    aud: "very-demo-client",
    sub: `smoke-subject-${nonce}`,
    external_user_id: `smoke-user-${nonce}`,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600
  },
  clientId: "very-demo-client",
  scope: "zeko:human-liveness:v1",
  appSalt: "smoke-test-only",
  authContext: { flow: "oauth-code", assurance: "palm-liveness" },
  holderKey: holder.toPublicKey(),
  issuedAtSlot: BigInt(issuedAtSlot),
  expiresAtSlot: credentialExpiry,
  nonce
});

const registry = new MerkleMap();
const credentialWitness = registry.getWitness(credential.credentialKey());
registry.set(credential.credentialKey(), credential.commitment());
const nullifierWitness = registry.getWitness(credential.nullifierKey());
registry.set(credential.nullifierKey(), Field(1));
const issuerSignature = Signature.create(
  issuer,
  issuerAuthorizationMessage(zkapp.address, UInt64.zero, credential)
);

const feePayer = { sender: deployer.toPublicKey(), fee: zekoTxFee() };

const anchorTx = await createZekoTransaction(feePayer.sender, feePayer.fee, async () => {
  await zkapp.anchorCredential(credential, issuerSignature, credentialWitness, nullifierWitness);
});
await anchorTx.prove();
const anchorResult = await anchorTx.sign([deployer]).send();
if (anchorResult.status === "rejected") {
  throw new Error(`Zeko rejected credential anchor: ${JSON.stringify(anchorResult)}`);
}

console.log(JSON.stringify({
  zkappAddress: address,
  graphQlUrl,
  issuedAtSlot,
  step1: {
    credentialCommitment: credential.commitment().toString(),
    registryRoot: registry.getRoot().toString()
  },
  step2: "Use MissionBoundAuthClient against the separately licensed native mission-authority service."
}, null, 2));

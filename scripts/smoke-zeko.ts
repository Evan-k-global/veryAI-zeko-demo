import "dotenv/config";

import {
  Field,
  MerkleMap,
  Mina,
  PrivateKey,
  PublicKey,
  Signature,
  UInt64,
  fetchAccount
} from "o1js";

import {
  VeryAiCredentialRegistry,
  buildVeryCredential,
  issuerAuthorizationMessage,
} from "../src/index.js";

const graphQlUrl = process.env.ZEKO_GRAPHQL_URL ?? "https://testnet.zeko.io/graphql";
const archiveUrl = process.env.ZEKO_ARCHIVE_URL ?? "https://archive.testnet.zeko.io/graphql";
const address = process.env.ZEKO_ZKAPP_ADDRESS;
const deployerPrivateKey = process.env.ZEKO_DEPLOYER_PRIVATE_KEY;
const issuerPrivateKey = process.env.VERY_ISSUER_PRIVATE_KEY;

if (!address || !deployerPrivateKey || !issuerPrivateKey) {
  throw new Error(
    "Set ZEKO_ZKAPP_ADDRESS, ZEKO_DEPLOYER_PRIVATE_KEY, and VERY_ISSUER_PRIVATE_KEY."
  );
}

Mina.setActiveInstance(
  Mina.Network({ mina: graphQlUrl, archive: archiveUrl, networkId: "testnet" })
);

const deployer = PrivateKey.fromBase58(deployerPrivateKey);
const issuer = PrivateKey.fromBase58(issuerPrivateKey);
const holder = PrivateKey.fromBase58(process.env.VERY_HOLDER_PRIVATE_KEY ?? deployerPrivateKey);
const zkapp = new VeryAiCredentialRegistry(PublicKey.fromBase58(address));

const zkappAccount = await fetchAccount({ publicKey: zkapp.address }, graphQlUrl);
if (!zkappAccount.account) {
  throw new Error(`Zeko zkApp account lookup failed: ${zkappAccount.error?.statusText ?? "not found"}`);
}

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

const feePayer = { sender: deployer.toPublicKey(), fee: 100_000_000 };

const anchorTx = await Mina.transaction(feePayer, async () => {
  await zkapp.anchorCredential(credential, issuerSignature, credentialWitness, nullifierWitness);
});
await anchorTx.prove();
await anchorTx.sign([deployer]).send();

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

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  AccountUpdate,
  MerkleMap,
  Mina,
  PrivateKey,
  Signature,
  UInt64
} from "o1js";

import {
  VeryAiCredentialRegistry,
  buildVeryCredential,
  issuerAuthorizationMessage
} from "../src/index.js";

describe("VeryAiCredentialRegistry", () => {
  it("anchors a signed Very credential and burns its nullifier", async () => {
    const local = await Mina.LocalBlockchain({ proofsEnabled: false });
    Mina.setActiveInstance(local);
    const [deployer, holder, delegate] = local.testAccounts;
    const issuerKey = PrivateKey.random();
    const zkappKey = PrivateKey.random();
    const zkapp = new VeryAiCredentialRegistry(zkappKey.toPublicKey());
    const registry = new MerkleMap();

    const credential = buildVeryCredential({
      idTokenPayload: {
        iss: "https://connect.very.org",
        aud: "very-demo-client",
        sub: "very-subject-demo-001",
        external_user_id: "customer-user-123"
      },
      clientId: "very-demo-client",
      scope: "zeko:human-liveness:v1",
      appSalt: "test-salt",
      holderKey: holder.key.toPublicKey(),
      issuedAtSlot: 1n,
      expiresAtSlot: 10n,
      nonce: "test-nonce"
    });

    const deployTx = await Mina.transaction(deployer, async () => {
      AccountUpdate.fundNewAccount(deployer);
      await zkapp.deploy();
    });
    await deployTx.prove();
    await deployTx.sign([deployer.key, zkappKey]).send();

    const configureTx = await Mina.transaction(deployer, async () => {
      await zkapp.configure(issuerKey.toPublicKey());
    });
    await configureTx.prove();
    await configureTx.sign([deployer.key, zkappKey]).send();

    const credentialWitness = registry.getWitness(credential.credentialKey());
    registry.set(credential.credentialKey(), credential.commitment());
    const nullifierWitness = registry.getWitness(credential.nullifierKey());
    registry.set(credential.nullifierKey(), UInt64.one.value);

    const issuerSignature = Signature.create(
      issuerKey,
      issuerAuthorizationMessage(zkapp.address, UInt64.zero, credential)
    );

    const anchorTx = await Mina.transaction(deployer, async () => {
      await zkapp.anchorCredential(
        credential,
        issuerSignature,
        credentialWitness,
        nullifierWitness
      );
    });
    await anchorTx.prove();
    await anchorTx.sign([deployer.key]).send();

    assert.equal(zkapp.registryRoot.get().toString(), registry.getRoot().toString());
    assert.equal(zkapp.lastCredentialCommitment.get().toString(), credential.commitment().toString());

    assert.equal(zkapp.registryRoot.get().toString(), registry.getRoot().toString());
  });
});

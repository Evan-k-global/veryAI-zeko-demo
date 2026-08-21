import "reflect-metadata";

import {
  Field,
  MerkleMap,
  MerkleMapWitness,
  Permissions,
  Poseidon,
  PublicKey,
  Signature,
  SmartContract,
  State,
  Struct,
  UInt64,
  method,
  state
} from "o1js";

export const EMPTY_MAP_ROOT = new MerkleMap().getRoot();

const CREDENTIAL_NAMESPACE = Field(7_001);
const NULLIFIER_NAMESPACE = Field(7_002);
const ISSUER_AUTHORIZATION_NAMESPACE = Field(7_003);

export class VeryAiCredential extends Struct({
  subjectCommitment: Field,
  clientIdHash: Field,
  authContextHash: Field,
  scopeHash: Field,
  holderKey: PublicKey,
  issuedAtSlot: UInt64,
  expiresAtSlot: UInt64,
  nullifier: Field
}) {
  fields(): Field[] {
    return [
      this.subjectCommitment,
      this.clientIdHash,
      this.authContextHash,
      this.scopeHash,
      ...this.holderKey.toFields(),
      this.issuedAtSlot.value,
      this.expiresAtSlot.value,
      this.nullifier
    ];
  }

  commitment(): Field {
    return Poseidon.hash(this.fields());
  }

  credentialKey(): Field {
    return Poseidon.hash([CREDENTIAL_NAMESPACE, this.subjectCommitment, this.scopeHash]);
  }

  nullifierKey(): Field {
    return Poseidon.hash([NULLIFIER_NAMESPACE, this.nullifier]);
  }
}

export class VeryAiCredentialAnchoredEvent extends Struct({
  credentialCommitment: Field,
  subjectCommitment: Field,
  scopeHash: Field,
  nullifier: Field,
  registryRoot: Field,
  sequence: UInt64
}) {}

export function issuerAuthorizationMessage(
  registryAddress: PublicKey,
  sequence: UInt64,
  credential: VeryAiCredential
): Field[] {
  return [
    ISSUER_AUTHORIZATION_NAMESPACE,
    ...registryAddress.toFields(),
    sequence.value,
    ...credential.fields()
  ];
}

export class VeryAiCredentialRegistry extends SmartContract {
  @state(PublicKey) issuerKey = State<PublicKey>();
  @state(Field) registryRoot = State<Field>();
  @state(UInt64) sequence = State<UInt64>();
  @state(Field) lastCredentialCommitment = State<Field>();

  events = {
    credentialAnchored: VeryAiCredentialAnchoredEvent
  };

  init() {
    super.init();
    this.issuerKey.set(PublicKey.empty());
    this.registryRoot.set(EMPTY_MAP_ROOT);
    this.sequence.set(UInt64.zero);
    this.lastCredentialCommitment.set(Field(0));
    this.account.permissions.set({
      ...Permissions.default(),
      editState: Permissions.proofOrSignature(),
      setPermissions: Permissions.signature()
    });
  }

  @method async configure(issuerKey: PublicKey) {
    this.requireSignature();
    const currentIssuer = this.issuerKey.getAndRequireEquals();
    currentIssuer.isEmpty().assertTrue("registry_already_configured");
    issuerKey.isEmpty().assertFalse("issuer_key_required");
    this.issuerKey.set(issuerKey);
  }

  @method async anchorCredential(
    credential: VeryAiCredential,
    issuerSignature: Signature,
    credentialWitness: MerkleMapWitness,
    nullifierWitness: MerkleMapWitness
  ) {
    const issuerKey = this.issuerKey.getAndRequireEquals();
    const currentRoot = this.registryRoot.getAndRequireEquals();
    const sequence = this.sequence.getAndRequireEquals();

    issuerKey.isEmpty().assertFalse("registry_not_configured");
    credential.subjectCommitment.assertNotEquals(Field(0));
    credential.nullifier.assertNotEquals(Field(0));
    credential.expiresAtSlot.value.assertGreaterThan(
      credential.issuedAtSlot.value,
      "credential_expiry_must_follow_issuance"
    );

    issuerSignature
      .verify(issuerKey, issuerAuthorizationMessage(this.address, sequence, credential))
      .assertTrue("invalid_very_issuer_signature");

    const credentialCommitment = credential.commitment();
    const [credentialRootBefore, credentialKey] =
      credentialWitness.computeRootAndKey(Field(0));
    credentialRootBefore.assertEquals(currentRoot);
    credentialKey.assertEquals(credential.credentialKey());
    const [credentialRootAfter] =
      credentialWitness.computeRootAndKey(credentialCommitment);

    const [nullifierRootBefore, nullifierKey] =
      nullifierWitness.computeRootAndKey(Field(0));
    nullifierRootBefore.assertEquals(credentialRootAfter);
    nullifierKey.assertEquals(credential.nullifierKey());
    const [nullifierRootAfter] = nullifierWitness.computeRootAndKey(Field(1));
    const nextSequence = sequence.add(1);

    this.registryRoot.set(nullifierRootAfter);
    this.sequence.set(nextSequence);
    this.lastCredentialCommitment.set(credentialCommitment);
    this.emitEvent(
      "credentialAnchored",
      new VeryAiCredentialAnchoredEvent({
        credentialCommitment,
        subjectCommitment: credential.subjectCommitment,
        scopeHash: credential.scopeHash,
        nullifier: credential.nullifier,
        registryRoot: nullifierRootAfter,
        sequence: nextSequence
      })
    );
  }

}

# Demo to Production

This repository is the public Zeko integration scaffold for VeryAI. It is designed to make the partnership concrete:

1. Very verifies a live human off-chain.
2. Zeko anchors a privacy-preserving credential commitment.
3. VeryAI hands the approved action to the native Agent Mission-Bound Auth service.
4. The native service enforces checkpoints and anchors approval/receipt roots on Zeko.

The repository is not the Very issuer service and is not a substitute for Very's production security review.

## Public and private boundary

The following are suitable for the public Apache-2.0 repository:

- the original Step 1 o1js credential-anchoring zkApp contract;
- commitment and nullifier helpers;
- the generic HTTP adapter to the native mission-authority service;
- demo scripts, tests, and integration documentation.

Keep the following in Very-controlled private infrastructure:

- Very OAuth client secrets, JWT signing material, JWKS operations, and KMS keys;
- palm, liveness, biometric, and risk-policy implementation;
- subject mapping, salts, raw OAuth tokens, user records, and operational telemetry;
- production relayer credentials, deployer keys, and archive/indexer infrastructure;
- Very trademarks, SDK code, and assets unless Very has expressly licensed them.

The native Agent Mission-Bound Auth implementation remains a separate Zeko Labs work under its own license. Do not vendor its source, schemas, SDK, verifier, protocol implementation, ZK artifacts, or anchoring contracts into this Apache-2.0 repository. Run the native service separately and integrate through its documented endpoints.

Do not commit `.env` files, private keys, raw `id_token` values, biometric data, or user identifiers. The testnet deployment in the README uses a provisional issuer and is not a production deployment.

## 1. Reproduce the demo

Use the pinned dependency set and run the local checks:

```bash
npm ci
npm test
npm run demo
PROOFS_ENABLED=true npm run demo
```

Once the separately licensed native mission authority is running:

```bash
MISSION_AUTH_BASE_URL=http://127.0.0.1:8787 npm run demo:mission
```

For a Zeko Ethereum Sepolia deployment, create `.env` from `.env.example`, fund the deployer with sETH, and run:

```bash
npm run deploy:zeko
```

The Sepolia defaults are `ZEKO_GRAPHQL_URL=https://sepolia.zeko.io/graphql`,
`ZEKO_NETWORK_ID=testnet`, and `ZEKO_TX_FEE=200000`. The `testnet` signing domain is
intentional for Zeko Sepolia. Leave `ZEKO_ARCHIVE_URL` empty unless a compatible archive
service is available.

Run the smoke script only against a fresh deployment unless you replace its in-memory witness stores with a persisted/indexed witness service:

```bash
ZEKO_ZKAPP_ADDRESS=<fresh-deployment-address> npm run smoke:zeko
```

## 2. Connect the real Very flow

Very should own the mobile and issuer boundary:

1. Register the production OAuth client, redirect URI, scopes, and mobile application with Very.
2. Use the Very mobile SDK to complete palm/liveness verification and receive an authorization code.
3. Send the code to a Very backend, never to the chain or a public client secret.
4. Exchange the code at `https://api.very.org/oauth2/token`.
5. Validate state, nonce, issuer, audience, expiry, and token type.
6. Verify the `id_token` cryptographic signature against Very's published JWKS, or use the agreed authenticated backend flow if Very uses an HMAC-signed token.
7. Derive the subject commitment and scoped nullifier with a KMS-held salt. Do not place the subject identifier or salt on-chain.
8. Bind the credential to the holder's Zeko public key and sign the issuer authorization message.

The included `src/very-oauth.ts` contains the exchange and claim-shape scaffolding. Its JWT payload decoding is not signature verification. Production code must complete that check before it signs a `VeryAiCredential`.

## 3. Run the two-step integration

The issuer or a trusted relayer should maintain the current credential sequence and Merkle witnesses, then submit Step 1:

```text
anchorCredential(credential, issuerSignature, credentialWitness, nullifierWitness)
```

After Step 1, use `MissionBoundAuthClient` against the separately licensed native service:

```text
createAgentPassport(...)
proposeMission(...)
approveMission(...)
verifyCheckpoint(...)
exportBundle({ auth: { veryCredentialCommitment, scopeHash } })
```

The native service owns mission schemas, capabilities, approval signatures, nullifiers, checkpoint enforcement, replay state, receipt construction, and settlement conditions. VeryAI contributes the Very credential commitment as an application auth context; it must not recreate those protocol objects locally.

## 4. Production deployment checklist

- Create a fresh production zkApp address and record its verification key.
- Use a KMS or hardware-backed Very issuer key and separate deployer key.
- Configure the issuer exactly once, then verify the on-chain issuer key and deployment address.
- Pin the o1js version and reproduce the contract build in CI.
- Persist the Step 1 credential Merkle witnesses through an indexer or durable service.
- Serialize sequence updates so two issuer requests cannot sign the same sequence.
- Monitor `credentialAnchored` plus native mission approval, checkpoint, receipt, and Zeko anchor events.
- Add alerting for issuer-key rotation, failed proofs, replay attempts, expired credentials, native checkpoint failures, and anchor-root drift.
- Test invalid issuer signatures, expired credentials, native approval failures, invalid checkpoints, duplicate nullifiers, and repeated side effects through the native service.
- Add key rotation and migration procedures before onboarding real users.
- Complete Very's security, privacy, legal, and product review.

## 5. Recommended launch order

**Phase 1: Deploy Very on Zeko.** Ship the live-human credential anchor and show that no biometric data, OAuth token, or stable subject identifier is exposed on-chain.

**Phase 2: Upgrade with native Zeko authorization.** Connect VeryAI to the native mission-bound-auth service and preserve its approval, checkpoint, receipt, fee, and Zeko anchoring requirements. Market the bounded action, expiry, budget, and independently verifiable settlement reference as the partnership advantage.

This keeps the initial integration small while giving Very a clear reason to make Zeko part of the product story.

## License boundary

The Apache-2.0 license in this repository covers the original public integration scaffold and documentation authored for this demo. It does not grant rights to Very's proprietary services, SDKs, trademarks, production credentials, user data, or operational systems, nor to the separately licensed Agent Mission-Bound Auth work. Confirm ownership, license compatibility, and production-use conditions with Very and Zeko before distributing a production package. This is a technical packaging recommendation, not legal advice.

import { randomBytes } from "node:crypto";

import { Field, PublicKey, UInt64 } from "o1js";

import { VeryAiCredential } from "./VeryAiCredentialRegistry.js";
import { fieldFromObject, fieldFromString, sha256Hex } from "./hash.js";

export type VeryTokenResponse = {
  access_token: string;
  id_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
};

export type VeryIdTokenPayload = {
  iss: string;
  aud: string;
  sub: string;
  exp?: number;
  iat?: number;
  external_user_id?: string;
  [claim: string]: unknown;
};

export type ExchangeVeryCodeInput = {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenEndpoint?: string;
};

export type BuildCredentialInput = {
  idTokenPayload: VeryIdTokenPayload;
  clientId: string;
  scope: string;
  appSalt: string;
  authContext?: Record<string, unknown>;
  holderKey: PublicKey;
  issuedAtSlot: bigint | number | string;
  expiresAtSlot: bigint | number | string;
  nonce?: string;
};

export async function exchangeVeryCode({
  code,
  clientId,
  clientSecret,
  redirectUri,
  tokenEndpoint = "https://api.very.org/oauth2/token"
}: ExchangeVeryCodeInput): Promise<VeryTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri
  });

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    throw new Error(`Very token exchange failed: ${response.status} ${await response.text()}`);
  }

  return response.json() as Promise<VeryTokenResponse>;
}

export function decodeJwtPayload(jwt: string): VeryIdTokenPayload {
  const [, payload] = jwt.split(".");
  if (!payload) {
    throw new Error("id_token is not a JWT");
  }
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as VeryIdTokenPayload;
}

export function assertVeryIdTokenClaims(
  payload: VeryIdTokenPayload,
  expected: { issuer: string; audience: string; nowSeconds?: number }
) {
  if (payload.iss !== expected.issuer) {
    throw new Error(`Unexpected Very issuer: ${payload.iss}`);
  }
  if (payload.aud !== expected.audience) {
    throw new Error(`Unexpected Very audience: ${payload.aud}`);
  }
  const nowSeconds = expected.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (payload.exp !== undefined && payload.exp <= nowSeconds) {
    throw new Error("Very id_token has expired");
  }
}

export function buildVeryCredential({
  idTokenPayload,
  clientId,
  scope,
  appSalt,
  authContext = {},
  holderKey,
  issuedAtSlot,
  expiresAtSlot,
  nonce = randomBytes(16).toString("hex")
}: BuildCredentialInput): VeryAiCredential {
  const verySubject = idTokenPayload.external_user_id ?? idTokenPayload.sub;
  if (!verySubject) {
    throw new Error("Very id_token is missing sub/external_user_id");
  }

  return new VeryAiCredential({
    subjectCommitment: fieldFromString(`${appSalt}:very-subject:${verySubject}`),
    clientIdHash: fieldFromString(clientId),
    authContextHash: fieldFromObject({
      issuer: idTokenPayload.iss,
      audience: idTokenPayload.aud,
      tokenSubjectHash: sha256Hex(idTokenPayload.sub),
      ...authContext
    }),
    scopeHash: fieldFromString(scope),
    holderKey,
    issuedAtSlot: UInt64.from(issuedAtSlot),
    expiresAtSlot: UInt64.from(expiresAtSlot),
    nullifier: fieldFromString(`${appSalt}:very-nullifier:${verySubject}:${scope}:${nonce}`)
  });
}

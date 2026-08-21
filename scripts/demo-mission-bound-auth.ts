import "dotenv/config";

import { MissionBoundAuthClient } from "../src/index.js";

const baseUrl = process.env.MISSION_AUTH_BASE_URL;
if (!baseUrl) {
  throw new Error("Set MISSION_AUTH_BASE_URL to an authorized native mission-authority service.");
}

const client = new MissionBoundAuthClient({
  baseUrl,
  bearerToken: process.env.MISSION_AUTH_BEARER_TOKEN || undefined
});

const discovery = await client.discover();
const passportResponse = await client.createAgentPassport({
  agentId: process.env.VERY_AGENT_ID ?? "veryai-human-verified-agent",
  organization: "VeryAI",
  idpProtocol: "very-oauth",
  issuer: "https://connect.very.org"
});
const agentPassport = passportResponse.agentPassport as Record<string, unknown>;

const missionResponse = await client.proposeMission({
  agentId: String(agentPassport.agentId),
  title: "Very-verified Zeko action",
  task: "Execute one approved action after Very live-human verification.",
  datasetId: "very-human-verification",
  operation: "zeko-settlement",
  allowedTools: ["zeko.receipt.anchor"],
  allowedScopes: ["very:human-liveness"],
  allowedRails: ["zeko"],
  maxSpendUsd: "1.00",
  ttlMs: 15 * 60 * 1000
});
const mission = missionResponse.mission as Record<string, unknown>;

const approvalResponse = await client.approveMission({
  missionId: String(mission.missionId),
  approverType: "very-verified-human",
  approverId: process.env.VERY_SUBJECT_COMMITMENT ?? "very-subject-commitment-held-by-issuer",
  issuer: "VeryAI"
});
const approval = approvalResponse.approval as Record<string, unknown>;

const checkpoint = await client.verifyCheckpoint({
  checkpoint: "before_external_side_effect",
  approval,
  context: {
    agentId: mission.agentId,
    datasetId: mission.datasetId,
    operation: mission.operation,
    action: "zeko.receipt.anchor",
    missionExecutionId: `veryai-demo-${Date.now()}`,
    idempotencyKey: `veryai-demo-${Date.now()}`
  }
});

const bundle = await client.exportBundle({
  agentPassport,
  mission,
  approval,
  auth: {
    provider: "VeryAI",
    credentialCommitment: process.env.VERY_CREDENTIAL_COMMITMENT ?? "replace-with-anchored-credential-commitment"
  }
});

console.log(JSON.stringify({
  discovery,
  missionId: mission.missionId,
  missionHash: mission.missionHash,
  approvalId: approval.approvalId,
  approvalHash: approval.approvalHash,
  checkpoint,
  bundle
}, null, 2));

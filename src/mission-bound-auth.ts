/**
 * HTTP adapter for the separately licensed Agent Mission-Bound Auth service.
 *
 * This file intentionally contains no mission-authority, capability, JWS,
 * checkpoint, or anchoring implementation. Those remain in the native Zeko
 * mission-bound-auth service and are consumed through its public protocol.
 */

export type JsonObject = Record<string, unknown>;

export type AgentPassportRequest = JsonObject & {
  agentId: string;
};

export type MissionProposalRequest = JsonObject & {
  agentId: string;
  task: string;
  operation: string;
};

export type MissionApprovalRequest = JsonObject & {
  missionId: string;
};

export type CheckpointRequest = JsonObject & {
  checkpoint: string;
  approval: JsonObject;
  context: JsonObject;
};

export type MissionBundleRequest = JsonObject & {
  agentPassport?: JsonObject | null;
  mission?: JsonObject | null;
  approval?: JsonObject | null;
  auth?: JsonObject | null;
  payment?: JsonObject | null;
  receipt?: JsonObject | null;
  zeko?: JsonObject | null;
};

export type MissionBoundAuthClientOptions = {
  baseUrl: string;
  bearerToken?: string;
  fetchImpl?: typeof fetch;
};

export class MissionBoundAuthClient {
  private readonly baseUrl: string;
  private readonly bearerToken?: string;
  private readonly fetchImpl: typeof fetch;

  constructor({ baseUrl, bearerToken, fetchImpl = fetch }: MissionBoundAuthClientOptions) {
    if (!baseUrl) throw new Error("baseUrl is required");
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.bearerToken = bearerToken;
    this.fetchImpl = fetchImpl;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    if (this.bearerToken) headers.set("authorization", `Bearer ${this.bearerToken}`);

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers
    });
    const text = await response.text();
    const body = text ? (JSON.parse(text) as T & JsonObject) : ({} as T & JsonObject);
    if (!response.ok) {
      const reason = typeof body === "object" && body !== null
        ? body.reason ?? body.error
        : undefined;
      throw new Error(`${path} failed (${response.status}): ${String(reason ?? text)}`);
    }
    return body as T;
  }

  private post<T>(path: string, body: JsonObject): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      body: JSON.stringify(body)
    });
  }

  discover<T extends JsonObject = JsonObject>(): Promise<T> {
    return this.request<T>("/.well-known/agent-authorization.json");
  }

  jwks<T extends JsonObject = JsonObject>(): Promise<T> {
    return this.request<T>("/.well-known/mission-authority-jwks.json");
  }

  createAgentPassport<T extends JsonObject = JsonObject>(
    input: AgentPassportRequest
  ): Promise<T> {
    return this.post<T>("/api/agents/passport", input);
  }

  proposeMission<T extends JsonObject = JsonObject>(
    input: MissionProposalRequest
  ): Promise<T> {
    return this.post<T>("/api/missions/propose", input);
  }

  approveMission<T extends JsonObject = JsonObject>(
    input: MissionApprovalRequest
  ): Promise<T> {
    return this.post<T>("/api/missions/approve", input);
  }

  verifyCheckpoint<T extends JsonObject = JsonObject>(
    input: CheckpointRequest
  ): Promise<T> {
    return this.post<T>("/api/mission/verify-checkpoint", input);
  }

  enforceCheckpoint<T extends JsonObject = JsonObject>(
    input: CheckpointRequest
  ): Promise<T> {
    return this.post<T>("/api/mission/enforce-checkpoint", input);
  }

  exportBundle<T extends JsonObject = JsonObject>(
    input: MissionBundleRequest
  ): Promise<T> {
    return this.post<T>("/api/mission/export-bundle", input);
  }
}

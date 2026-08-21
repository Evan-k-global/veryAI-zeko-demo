import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { MissionBoundAuthClient } from "../src/index.js";

describe("MissionBoundAuthClient", () => {
  it("calls the native mission-bound-auth protocol without implementing it locally", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new MissionBoundAuthClient({
      baseUrl: "https://mission-authority.example",
      bearerToken: "test-token",
      fetchImpl: async (input, init = {}) => {
        calls.push({ url: String(input), init });
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
    });

    await client.proposeMission({
      agentId: "very-agent",
      task: "Purchase compute credits",
      operation: "purchase"
    });

    assert.equal(calls[0]?.url, "https://mission-authority.example/api/missions/propose");
    assert.equal(calls[0]?.init.method, "POST");
    assert.equal(
      new Headers(calls[0]?.init.headers).get("authorization"),
      "Bearer test-token"
    );
    assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), {
      agentId: "very-agent",
      task: "Purchase compute credits",
      operation: "purchase"
    });
  });
});

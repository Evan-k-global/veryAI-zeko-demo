# Third-Party Integration Notice

Step 2 integrates with Agent Mission-Bound Auth, a separate Zeko Labs work, through its documented HTTP protocol. This repository does not copy or redistribute that work's source code, SDK implementation, schemas, protocol implementation, or ZK/settlement artifacts.

The native Agent Mission-Bound Auth repository is separately licensed under Business Source License 1.1, with its own production-use conditions and attribution requirements. VeryAI or another operator must obtain and run the native mission-authority service under the terms that apply to that service.

`src/mission-bound-auth.ts` is an independently authored HTTP client boundary. Its purpose is to call the native service's documented endpoints:

- `/.well-known/agent-authorization.json`
- `/.well-known/mission-authority-jwks.json`
- `/api/agents/passport`
- `/api/missions/propose`
- `/api/missions/approve`
- `/api/mission/verify-checkpoint`
- `/api/mission/enforce-checkpoint`
- `/api/mission/export-bundle`

No license to the native service, Zeko trademarks, or Zeko Labs intellectual property is granted by the Apache-2.0 license in this repository.

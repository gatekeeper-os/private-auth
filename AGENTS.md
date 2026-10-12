# Gatekeeper Private Auth agent rules

- Work on a branch; use conventional commits. Keep `main` green.
- This is a separate experimental project. Never patch, vendor, install over, or mutate an existing OpenClaw/GatekeeperOS deployment or its state.
- Future GatekeeperOS integration must use documented public SDKs and existing grant resolution, owner/session/audience, and approval boundaries. A cryptographic proof cannot bypass local policy.
- Keep identity secrets, private keys, credentials, request bodies, prompts, and raw upstream diagnostics out of logs, commits, and tool-visible errors.
- Fail closed on missing, stale, revoked, ambiguous, or malformed authorization. Bind proofs to the full request and authority domain.
- Core authorization changes require meaningful adversarial tests. Run `npm run check`, `npm run demo`, and `npm audit`; run `npm run test:browser` for dashboard changes.
- Host tests use a fresh in-memory local EVM and synthetic catalog. No production services, real assets, external wallets, or installed gateway are part of acceptance.
- Record exact validation and limits in `docs/verification.md`. Do not call local EVM success public-chain qualification, a fixture demo a production identity service, or tests an independent security audit.

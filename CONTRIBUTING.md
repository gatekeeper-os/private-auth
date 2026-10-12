# Contributing

Read [AGENTS.md](AGENTS.md), [architecture](docs/architecture.md), and [security boundaries](docs/security.md) before changing authorization behavior.

Use Node 22.23.3, `npm ci`, and `npm run artifacts:fetch`. Work on a branch. Include adversarial regression tests for changed security boundaries and update the verification record with exact commands and limitations. `npm run check`, `npm run demo`, and `npm audit` must pass. Browser changes also require `npm run test:browser`.

Do not introduce external effects into the catalog handler or expose the local demo dashboard publicly. New operations need a separate design and execution-boundary review. Keep declarations of trust and privacy precise.

Contributions to original code are MIT licensed. Preserve third-party notices and lockfile integrity information. Report suspected vulnerabilities privately; see [SECURITY.md](SECURITY.md).

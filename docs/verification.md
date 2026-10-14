# Verification record

Date: 2026-10-13 (America/Los_Angeles)

## Local evidence

Environment: Linux, Node 22.23.3, npm 10.9.9, pinned package lock, Solidity 0.8.37, Hardhat 3.19.0 local EVM, Semaphore 4.14.3 with pinned depth-8 v4.13.0 artifacts. Browser checks used the host's installed Chromium through Playwright.

| Check | Result | What this establishes |
| --- | --- | --- |
| `npm run typecheck` | PASS | Strict TypeScript checking of library, scripts, tests, and browser harness |
| `npm run build` | PASS | Library JavaScript and declarations emit successfully |
| `npm test` | PASS, 21 tests | Real ZK proofs, HTTP integration, local EVM contract behavior, and explicit fault-injection cases |
| `npm run demo` | PASS, 7 assertions | Authorized read, replay rejection, modified-request rejection, on-chain revocation, retained membership, outsider refusal, concurrent replay |
| `CHROMIUM_PATH=/run/current-system/sw/bin/chromium npm run test:browser` | PASS, 2 tests | Real browser grant/revoke/prove/replay flow, re-grant, desktop/mobile layout, no page exceptions, and console Host/Origin rejection |
| `npm audit --audit-level=moderate` | PASS, 0 reported vulnerabilities | Advisory database result for the pinned dependency tree at this date; not a security audit |
| Proving artifact SHA-256 validation | PASS | Downloaded circuit/key bytes match the committed pins |

## Artifact provenance and license review

- `package-lock.json` pins the installed dependency graph. `@semaphore-protocol/proof` 4.14.3 itself selects Semaphore artifacts version 4.13.0; this repository downloads that version from the upstream `snark-artifacts.pse.dev` service.
- A fresh download on 2026-10-13 matched the committed SHA-256 pins: `4edc07444a1d48d09014c963e315d3351b6e12838d83fcb1962071614b1c94b9` for the depth-8 WASM and `d02521afe7133a97421244374d4bc005c1ebd7d7cf7c51e88b7e99fdaf183146` for the proving key. This establishes byte identity with the pinned upstream downloads, not the trustworthiness of the ceremony or circuit.
- The direct runtime dependencies report MIT licenses. Development dependencies report MIT or Apache-2.0. The transitive proof toolchain includes GPL-3.0 packages such as `snarkjs`, `ffjavascript`, and `r1csfile`; neither `node_modules` nor downloaded proving artifacts are redistributed by this repository. Any future binary, container, or npm distribution needs a separate license-compliance review.
- `npm pack --dry-run` confirmed that neither `.cache/semaphore` nor `node_modules` enters the package payload. This project remains marked `private` and no npm publication is claimed.

## Authorization test coverage

Actual cryptographic proof verification is used for positive and negative protocol tests; the verifier is not mocked. Real Solidity is compiled and deployed into the local EVM. The catalog contains synthetic data.

The 21 tests cover authorized access with no individual identity commitment on the wire; replay and concurrent duplication; changed resource; corrupted proof; forged signature; wrong audience; client-side chain/registry/permission/audience pinning; changed request/key; nonmember refusal; challenge expiry; actual registry revocation; same-root epoch changes; RPC failure; a state change injected during verification; time advancement injected during verification; challenge capacity; malformed schemas; unsupported operations; HTTP body/origin limits; wrong-chain and stale-head rejection; administrator-only updates; stale administrative writes; invalid root, permission ID, and expiry; and disabled permissions.

Registry-failure, concurrent-epoch-change, and clock-advance tests deliberately inject controlled faults around a real proof verifier. They do not establish a measured public-network revocation bound. Remaining registry checks execute against the local EVM.

## Not established

- Public testnet/mainnet deployment, finality behavior, RPC-provider trust, or real-network revocation latency.
- Production IAM/enrollment, durable membership distribution, multi-user admin security, distributed replay protection, or secret-hardware protection.
- Meaningful anonymity for the small fixture group, network anonymity, or resistance to a colluding issuer/verifier.
- GatekeeperOS/OpenClaw integration, payments, delegation, arbitrary writes, or real third-party service acceptance.
- Independent cryptographic or security audit, production availability, and load/DoS qualification.

GitHub CI runs the same commands plus a downloaded Chromium browser; its result is separate from the local evidence above.

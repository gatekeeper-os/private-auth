# Architecture and protocol v1

## Scope

One permission (`catalog:read`) maps to one gateway-installed handler. A client chooses an allowlisted catalog item, never an arbitrary URL, shell command, HTTP method, or handler. The sample API is read-only. No upstream OpenClaw runtime is installed or changed.

The administrator publishes a Semaphore group root under `keccak256("catalog:read")` in a configured registry contract. The contract is intentionally small: one immutable administrator, root, epoch, validity deadline, enabled flag, and event. `expectedEpoch` prevents accidental concurrent overwrites. There is no historic-root grace period. Production ownership transfer and recovery are not implemented; redeploy with a new trusted address when needed.

The administrator maintains and distributes group commitments off-chain. The local harness reconstructs the tree after changes. Every change creates a new epoch and invalidates outstanding challenges, even for members who remain enrolled. Re-enabling an identical root also invalidates earlier challenges.

## Transcript

Messages use JSON arrays of explicit primitive fields in a fixed order. This avoids ambiguous object ordering, delimiter joining, or implicit coercion. All network data is validated with strict schemas and bounded lengths. SHA-256 hashes are converted to unsigned decimal strings for Semaphore message/scope inputs; Semaphore applies its own circuit-compatible hash.

- Request hash: `[protocol, "request", operation, item]`.
- Scope: `[protocol, "scope", chainId, lowercasedRegistry, audience, permission, challengeId]`.
- Signed transcript and proof message: `[protocol, "authorization", chainId, lowercasedRegistry, audience, permission, challengeId, root, epoch, expiresAt, requestHash, temporaryPublicKey]`.

Challenge IDs are 256 random bits. Request keys are fresh Ed25519 key pairs. A signature covers the transcript; the zero-knowledge proof binds that same transcript to knowledge of an enrolled secret. This prevents someone possessing only the temporary key from constructing a new authorization. A copied complete presentation remains replayable until first consumption; TLS is required across untrusted networks, and this prototype provides no response encryption against first-use theft.

Clients pin the intended domain independently of the challenge response. They check domain, root, request, key, and challenge deadline before proving. An API response cannot silently redirect a client into proving for another authority.

Semaphore scope includes the verifier-issued challenge ID. Nullifiers therefore differ between fresh requests. The gateway consumes the challenge itself, not a client-selected nullifier; multiple group members cannot use the same challenge successfully. A malicious verifier can influence scopes and grouping, so cryptographic unlinkability is not a defense against every malicious-issuer or verifier correlation strategy.

## Verification and execution

1. Parse bounded input and reserve the existing challenge synchronously.
2. Check expiry and exact request/proof bindings.
3. Validate the Ed25519 signature.
4. Read the configured chain's current permission state.
5. Verify the actual Semaphore Groth16 proof at fixed tree depth 8.
6. Re-read permission state, compare root and epoch, and check expiry again.
7. Consume the challenge and return the validated request to the installed handler.

No handler executes on a failed check. Attempts that acquire a challenge consume it even on failure. Concurrent duplicates are rejected before verification. At most two verifications and 1,000 outstanding challenges are admitted by default. Pending issuance RPCs and incoming HTTP traffic still require operational rate limiting.

Consumption is atomic only inside one process. Lost responses require a new challenge. A crash after consumption must not be interpreted as evidence of an external effect. Distributed replicas need a shared atomic claim/consume store. Writes need durable action IDs, an outbox or transactional boundary, idempotency, and explicit uncertain-outcome handling.

## Chain policy

The adapter checks chain ID and reads all state at a single observed latest block. It rejects a block older than 120 seconds or more than 30 seconds into the future. The local provider has ethers caching disabled. State is read both before and after proof verification.

This is a freshness check relative to the configured RPC and wall clock, not proof of global finality. The operator trusts the RPC. A lying RPC, a reorganization, cached upstream head, or a revocation arriving after the final check can change what is observed. Authorization and off-chain execution are not atomic with the chain. A production chain needs an explicit finality and revocation-lag policy, independent RPC validation where appropriate, and an outage policy. No public testnet or L2 has been qualified.

## Artifact and dependency provenance

Pinned Semaphore packages are v4.14.3. Their prover uses v4.13.0 circuit artifacts, as verified in the installed `generate-proof` source. We use depth 8, supporting at most 256 leaves. `src/artifacts.ts` pins SHA-256 digests of the two files retrieved over HTTPS from the upstream artifact service. This is a reproducibility pin, not an independent trusted-setup audit. The verifier keys ship in the npm package and are pinned by the lockfile integrity record.

Overrides update vulnerable transitive `ws`, `underscore`, `snarkjs`, and `tmp` versions. Real proof generation and verification, contract compilation, and the complete test suite are exercised with these overrides. No forced major-version downgrade of Semaphore is used.

Primary references:

- [Semaphore proofs](https://docs.semaphore.pse.dev/guides/proofs)
- [Semaphore groups](https://docs.semaphore.pse.dev/guides/groups)
- [Semaphore identities](https://docs.semaphore.pse.dev/guides/identities)
- [Hardhat network configuration](https://hardhat.org/docs/reference/configuration)

## Next integration boundary

GatekeeperOS can be a future issuer/client or verifier adapter. It must continue resolving local grants and applying existing owner/session/audience and approval checks. Anonymous external group membership must never become a substitute for local ownership or a path to arbitrary native tools. This repository does not claim an accepted GatekeeperOS integration.

# Security boundaries

This is an experimental implementation, not an independently audited authorization product.

## Trusted components

- The administrator that enrolls identity commitments and publishes permission roots.
- The service operator's configured chain, contract address, audience, and permission mapping.
- The configured RPC and its observed chain head.
- Semaphore, its circuit/setup assumptions, verification keys, proving artifacts, and cryptographic dependencies.
- The agent-side process and host that hold its identity secret.
- The gateway process, its host, and its installed catalog handler.

The administrator can grant access to arbitrary members. A stolen identity secret can exercise its permissions. This protocol proves knowledge of that secret, not legal ownership, model identity, correct software execution, or good intentions. Prompt injection can still cause an otherwise authorized agent to misuse a permitted operation.

## Privacy limits

The verifier receives the permission/root, epoch-bound request proof, challenge, ephemeral public key binding, and request. It does not receive the identity secret or the individual membership commitment. It can still observe IP address, timing, requested resources, and service results. A singleton or small group can make identity inferable; the three-agent demo is a functional fixture, not a meaningful anonymity guarantee. Issuers may also create identifying groups or correlate issuance and use.

On-chain updates expose administrator addresses, roots, deadlines, epochs, and timing. Commitments and group witnesses distributed off-chain can reveal enrollment patterns. Avoid stable public agent identifiers or customer-specific groups when the intended privacy property requires hiding them.

## Gateway limits

- One process, in-memory challenges. Restarts invalidate all outstanding requests. Multiple replicas are unsupported without shared atomic consumption.
- The only operation is a read-only catalog lookup. No payment, command execution, or write is authorized.
- Every proof is bound to chain, contract, audience, permission, challenge, expiry, request, and temporary key. Do not remove these bindings to simplify integrations.
- RPC unavailability, stale blocks, expired permissions, disabled permissions, and malformed inputs deny access.
- A final state check narrows the revocation race but cannot atomically couple an off-chain read to a chain transaction.
- HTTP handlers do not log bodies, proofs, headers, keys, or raw provider errors. Returned errors use bounded codes.
- Body, challenge-store, and concurrent-proof limits exist. Distributed rate limiting and broader DoS resistance remain unqualified.
- External deployments require HTTPS and appropriate origin, authentication, proxy, and network policy. The sample starts only on loopback.
- A complete signed presentation stolen before use can win a race to execute the same request. A temporary signature does not prevent that; protect transport and response delivery.

## Dashboard and local console

The dashboard runs a disposable local EVM, an administrator signer, and named agent fixtures within one local harness. It is deliberately capable of granting all fixture permissions. It is not the production verifier or an authenticated multi-user administration service.

It binds to 127.0.0.1, checks exact Host and Origin for actions, rejects proxy-host overrides, uses a restrictive CSP, has no external assets, and exposes no private keys. Local processes/users with access to loopback can still act as the demo operator. Do not bind it to a public interface or replace fixture identities with real credentials.

## Required before production

Independent cryptographic/security review; authenticated operator enrollment and recovery; protected agent secrets; production artifact provenance review; distributed replay state; authenticated and rate-limited administration; transport protection; chain finality/outage policy; meaningful privacy-set design; external-network integration tests; and durable execution semantics for any future side effects.

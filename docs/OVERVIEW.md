# Private Auth

Request-bound agent authorization using local Semaphore proofs and an Ethereum permission registry.

**Status:** Unaudited prototype.

## Prove group membership

Generate a real zero-knowledge proof locally without sending the identity secret to the verifier.

## Bind each request

Bind the proof to its authority domain, request, challenge, and fresh request key.

## Exercise failure paths

Explore revocation, altered requests, outsiders, and replay rejection with a local demonstration.

## How it fits together

Local identity → Membership proof → Verify + consume → Authorized read.

## Current boundaries

Experimental and unaudited. The demo uses a disposable local chain and fixture identities. Network metadata and small groups limit anonymity; there is no production enrollment or public-chain qualification.

## Get started

See the [README](../README.md) for prerequisites, setup, configuration, and development checks.

## Further reading

- [Architecture](../docs/architecture.md)
- [Security boundaries](../docs/security.md)
- [Verification record](../docs/verification.md)

## Landing page

The companion [static landing page](site/index.html) is self-contained HTML/CSS with local assets and no analytics, external fonts, or JavaScript dependencies. Serve `docs/site/` from a static host to render it. GitHub file view shows its source. No hosting or repository-visibility change is implied by committing these files.

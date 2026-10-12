import { createPublicKey, randomBytes, verify } from "node:crypto";
import { verifyProof } from "@semaphore-protocol/proof";
import {
  challengeRequestSchema, presentationSchema, domainSchema, PROTOCOL,
  message, requestHash, scope, transcript, type Challenge, type Domain, type OperationRequest
} from "./protocol.js";
import type { AuthorizationState, RegistryReader } from "./registry.js";

export class AuthorizationError extends Error {
  constructor(public readonly code: string, public readonly status = 403) { super(code); }
}

type Entry = { challenge: Challenge; busy: boolean };
const ED25519_SPKI = Buffer.from("302a300506032b6570032100", "hex");

/** Single-process verifier with bounded, in-memory, single-use challenges. */
export class AuthorizationGateway {
  private readonly challenges = new Map<string, Entry>();
  private activeVerifications = 0;
  private readonly domain: Domain;

  constructor(
    domain: Domain,
    private readonly registry: RegistryReader,
    private readonly options: {
      now?: () => number; challengeTtlMs?: number; maxChallenges?: number; maxVerifications?: number;
    } = {}
  ) {
    this.domain = domainSchema.parse(domain);
  }

  private now(): number { return (this.options.now ?? Date.now)(); }

  private async current(): Promise<AuthorizationState> {
    let state: AuthorizationState;
    try { state = await this.registry.read(); }
    catch { throw new AuthorizationError("REGISTRY_UNAVAILABLE", 503); }
    if (!state.enabled || state.root === "0" || state.validUntil <= this.now()) {
      throw new AuthorizationError("PERMISSION_INACTIVE");
    }
    return state;
  }

  async issue(input: unknown): Promise<Challenge> {
    const parsed = challengeRequestSchema.safeParse(input);
    if (!parsed.success) throw new AuthorizationError("INVALID_REQUEST", 400);
    for (const [id, entry] of this.challenges) {
      if (entry.challenge.expiresAt <= this.now()) this.challenges.delete(id);
    }
    if (this.challenges.size >= (this.options.maxChallenges ?? 1000)) {
      throw new AuthorizationError("CAPACITY_EXCEEDED", 429);
    }
    const state = await this.current();
    // Check again after I/O so concurrent issuers cannot overfill the store.
    if (this.challenges.size >= (this.options.maxChallenges ?? 1000)) {
      throw new AuthorizationError("CAPACITY_EXCEEDED", 429);
    }
    const challenge: Challenge = {
      protocol: PROTOCOL, id: randomBytes(32).toString("hex"), domain: { ...this.domain },
      root: state.root, epoch: state.epoch,
      expiresAt: Math.min(this.now() + (this.options.challengeTtlMs ?? 120_000), state.validUntil),
      requestHash: requestHash(parsed.data.request), publicKey: parsed.data.publicKey
    };
    this.challenges.set(challenge.id, { challenge, busy: false });
    return structuredClone(challenge);
  }

  /** Returns a validated request after consuming its challenge. Never retries an effect. */
  async authorize(input: unknown): Promise<OperationRequest> {
    const parsed = presentationSchema.safeParse(input);
    if (!parsed.success) throw new AuthorizationError("INVALID_PRESENTATION", 400);
    const presentation = parsed.data;
    const entry = this.challenges.get(presentation.challengeId);
    if (!entry) throw new AuthorizationError("CHALLENGE_UNKNOWN_OR_USED");
    if (entry.busy) throw new AuthorizationError("CHALLENGE_IN_USE");
    if (this.activeVerifications >= (this.options.maxVerifications ?? 2)) {
      throw new AuthorizationError("CAPACITY_EXCEEDED", 429);
    }
    // Synchronous reservation happens before any await; only one request can enter.
    entry.busy = true;
    this.activeVerifications++;
    const { challenge } = entry;
    try {
      if (challenge.expiresAt <= this.now()) throw new AuthorizationError("CHALLENGE_EXPIRED");
      if (requestHash(presentation.request) !== challenge.requestHash) throw new AuthorizationError("REQUEST_MISMATCH");
      const { proof } = presentation;
      if (proof.merkleTreeRoot !== challenge.root || proof.scope !== scope(challenge) || proof.message !== message(challenge)) {
        throw new AuthorizationError("PROOF_BINDING_MISMATCH");
      }
      let signatureValid = false;
      try {
        const publicKey = createPublicKey({
          key: Buffer.concat([ED25519_SPKI, Buffer.from(challenge.publicKey, "hex")]), format: "der", type: "spki"
        });
        signatureValid = verify(null, transcript(challenge), publicKey, Buffer.from(presentation.signature, "hex"));
      } catch { /* malformed keys fail closed */ }
      if (!signatureValid) throw new AuthorizationError("INVALID_SIGNATURE");
      this.matchState(challenge, await this.current());
      let proofValid = false;
      try { proofValid = await verifyProof(proof); } catch { /* no library errors leave the boundary */ }
      if (!proofValid) throw new AuthorizationError("INVALID_PROOF");
      // Re-read after expensive proof verification to observe intervening revocations.
      this.matchState(challenge, await this.current());
      if (challenge.expiresAt <= this.now()) throw new AuthorizationError("CHALLENGE_EXPIRED");
      return presentation.request;
    } finally {
      // All attempts burn the challenge. Failure never becomes a reusable approval.
      this.challenges.delete(challenge.id);
      this.activeVerifications--;
    }
  }

  private matchState(challenge: Challenge, state: AuthorizationState): void {
    if (state.root !== challenge.root || state.epoch !== challenge.epoch) {
      throw new AuthorizationError("AUTHORIZATION_CHANGED");
    }
  }
}

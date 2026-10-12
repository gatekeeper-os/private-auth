import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import type { Identity } from "@semaphore-protocol/identity";
import type { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";
import {
  challengeSchema, domainFields, message, requestHash, scope, transcript, TREE_DEPTH,
  type Domain, type OperationRequest, type Presentation
} from "./protocol.js";

export interface ProofArtifacts { wasm: string; zkey: string }

/** Generates a new transport key for each request; never reuse it as an agent ID. */
export function createRequestKey(): { privateKey: KeyObject; publicKey: string } {
  const pair = generateKeyPairSync("ed25519");
  const der = pair.publicKey.export({ format: "der", type: "spki" });
  return { privateKey: pair.privateKey, publicKey: der.subarray(-32).toString("hex") };
}

/** Secrets and proof generation stay local. Caller must pin the expected verifier domain. */
export async function present(options: {
  identity: Identity; group: Group; challenge: unknown; domain: Domain;
  request: OperationRequest; key: ReturnType<typeof createRequestKey>; artifacts: ProofArtifacts;
}): Promise<Presentation> {
  const challenge = challengeSchema.parse(options.challenge);
  if (JSON.stringify(domainFields(challenge.domain)) !== JSON.stringify(domainFields(options.domain))) {
    throw new Error("UNEXPECTED_VERIFIER");
  }
  if (challenge.publicKey !== options.key.publicKey || challenge.requestHash !== requestHash(options.request)) {
    throw new Error("UNEXPECTED_REQUEST");
  }
  if (challenge.root !== options.group.root.toString()) throw new Error("GROUP_OUT_OF_DATE");
  if (challenge.expiresAt <= Date.now()) throw new Error("CHALLENGE_EXPIRED");
  if (options.group.indexOf(options.identity.commitment) < 0) throw new Error("NOT_A_MEMBER");
  const proof = await generateProof(
    options.identity, options.group, message(challenge), scope(challenge), TREE_DEPTH, options.artifacts
  );
  return {
    challengeId: challenge.id, request: options.request, proof,
    signature: sign(null, transcript(challenge), options.key.privateKey).toString("hex")
  };
}

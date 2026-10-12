import { createHash } from "node:crypto";
import { z } from "zod";

export const PROTOCOL = "gatekeeper-private-auth/v1";
export const TREE_DEPTH = 8;
export const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const decimal = z.string().regex(/^(0|[1-9][0-9]{0,77})$/);
const scalar = decimal.refine((v) => BigInt(v) < FIELD);
const digest = z.string().regex(/^[0-9a-f]{64}$/);

/** The prototype exposes one read-only operation; routes are never client-selected URLs. */
export const requestSchema = z.object({
  operation: z.literal("catalog:read"),
  item: z.enum(["sensor-a", "sensor-b"])
}).strict();
export type OperationRequest = z.infer<typeof requestSchema>;

export const domainSchema = z.object({
  chainId: decimal,
  registry: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  audience: z.string().min(1).max(200),
  permission: z.string().regex(/^0x[0-9a-f]{64}$/)
}).strict();
export type Domain = z.infer<typeof domainSchema>;

export const challengeSchema = z.object({
  protocol: z.literal(PROTOCOL),
  id: digest,
  domain: domainSchema,
  root: scalar,
  epoch: decimal,
  expiresAt: z.number().int().positive().safe(),
  requestHash: digest,
  publicKey: z.string().regex(/^[0-9a-f]{64}$/)
}).strict();
export type Challenge = z.infer<typeof challengeSchema>;

export const proofSchema = z.object({
  merkleTreeDepth: z.literal(TREE_DEPTH),
  merkleTreeRoot: scalar,
  nullifier: scalar,
  message: decimal,
  scope: decimal,
  points: z.tuple([decimal, decimal, decimal, decimal, decimal, decimal, decimal, decimal])
}).strict();

export const presentationSchema = z.object({
  challengeId: digest,
  request: requestSchema,
  proof: proofSchema,
  signature: z.string().regex(/^[0-9a-f]{128}$/)
}).strict();
export type Presentation = z.infer<typeof presentationSchema>;

export const challengeRequestSchema = z.object({
  request: requestSchema,
  publicKey: z.string().regex(/^[0-9a-f]{64}$/)
}).strict();

/** Only arrays of explicitly ordered primitive fields enter protocol hashes. */
export function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function requestHash(request: OperationRequest): string {
  return hash([PROTOCOL, "request", request.operation, request.item]);
}

/** A domain includes the chain, contract, verifier audience, and permission. */
export function domainFields(domain: Domain): string[] {
  return [domain.chainId, domain.registry.toLowerCase(), domain.audience, domain.permission];
}

export function scope(challenge: Challenge): string {
  return BigInt(`0x${hash([PROTOCOL, "scope", ...domainFields(challenge.domain), challenge.id])}`).toString();
}

export function transcript(challenge: Challenge): Buffer {
  return Buffer.from(JSON.stringify([
    PROTOCOL, "authorization", ...domainFields(challenge.domain), challenge.id,
    challenge.root, challenge.epoch, challenge.expiresAt, challenge.requestHash, challenge.publicKey
  ]));
}

export function message(challenge: Challenge): string {
  return BigInt(`0x${createHash("sha256").update(transcript(challenge)).digest("hex")}`).toString();
}

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { sign } from "node:crypto";
import { Contract, id } from "ethers";
import { localEnvironment } from "../scripts/local-environment.js";
import { AuthorizationGateway, AuthorizationError } from "../src/gateway.js";
import { EthereumRegistry, REGISTRY_ABI } from "../src/registry.js";
import { createRequestKey, present } from "../src/client.js";
import { FIELD, transcript, type Challenge, type OperationRequest } from "../src/protocol.js";

let env: Awaited<ReturnType<typeof localEnvironment>>;
const request: OperationRequest = { operation: "catalog:read", item: "sensor-a" };
before(async () => { env = await localEnvironment(); });
after(async () => {
  await env?.close();
  // Semaphore/snarkjs caches ffjavascript's worker pool. Test-process cleanup only.
  const runtime = globalThis as typeof globalThis & { curve_bn128?: { terminate(): Promise<void> } };
  await runtime.curve_bn128?.terminate();
});

async function prepareFor(gateway: AuthorizationGateway) {
  const key = createRequestKey();
  const challenge = await gateway.issue({ request, publicKey: key.publicKey });
  const presentation = await present({ identity: env.identities.bob, group: env.group, challenge,
    domain: env.domain, request, key, artifacts: env.artifacts });
  return { key, challenge, presentation };
}

function denied(code: string) {
  return (error: unknown) => error instanceof AuthorizationError && error.code === code;
}

test("real proof over HTTP authorizes one catalog read without sending an identity commitment", async () => {
  const prepared = await env.prepare("alice");
  const wire = JSON.stringify(prepared.presentation);
  for (const identity of Object.values(env.identities)) assert.equal(wire.includes(identity.commitment.toString()), false);
  const before = env.executions;
  assert.equal((await env.execute(prepared.presentation)).status, 200);
  assert.equal(env.executions, before + 1);
  assert.equal((await env.execute(prepared.presentation)).body.error, "CHALLENGE_UNKNOWN_OR_USED");
  assert.equal(env.executions, before + 1);
});

test("two concurrent submissions execute once", async () => {
  const prepared = await env.prepare("bob");
  const before = env.executions;
  const results = await Promise.all([env.execute(prepared.presentation), env.execute(prepared.presentation)]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 403]);
  assert.equal(env.executions, before + 1);
});

test("altered resource cannot reuse a valid proof", async () => {
  const prepared = await env.prepare("bob");
  prepared.presentation.request.item = "sensor-b";
  assert.equal((await env.execute(prepared.presentation)).body.error, "REQUEST_MISMATCH");
});

test("a corrupted cryptographic proof fails despite valid request binding and signature", async () => {
  const prepared = await env.prepare("bob");
  prepared.presentation.proof.points[0] = "1";
  assert.equal((await env.execute(prepared.presentation)).body.error, "INVALID_PROOF");
});

test("a forged signature fails and consumes its challenge", async () => {
  const prepared = await env.prepare("bob");
  const otherKey = createRequestKey();
  prepared.presentation.signature = sign(null, transcript(prepared.challenge), otherKey.privateKey).toString("hex");
  assert.equal((await env.execute(prepared.presentation)).body.error, "INVALID_SIGNATURE");
  assert.equal((await env.execute(prepared.presentation)).body.error, "CHALLENGE_UNKNOWN_OR_USED");
});

test("a proof created for a different audience cannot authorize this gateway", async () => {
  const key = createRequestKey();
  const challenge = await env.gateway.issue({ request, publicKey: key.publicKey });
  const otherDomain = { ...env.domain, audience: "another-api" };
  const altered = { ...challenge, domain: otherDomain };
  const presentation = await present({ identity: env.identities.bob, group: env.group,
    challenge: altered, domain: otherDomain, request, key, artifacts: env.artifacts });
  assert.equal((await env.execute(presentation)).body.error, "PROOF_BINDING_MISMATCH");
});

test("client refuses a challenge from an unexpected registry, chain, permission, or audience", async () => {
  const key = createRequestKey();
  const challenge = await env.gateway.issue({ request, publicKey: key.publicKey });
  for (const domain of [
    { ...env.domain, chainId: "1" }, { ...env.domain, registry: `0x${"11".repeat(20)}` },
    { ...env.domain, permission: id("admin:write") }, { ...env.domain, audience: "evil" }
  ]) {
    await assert.rejects(present({ identity: env.identities.bob, group: env.group,
      challenge: { ...challenge, domain }, domain: env.domain, request, key, artifacts: env.artifacts }), /UNEXPECTED_VERIFIER/);
  }
});

test("client refuses changed request/key and unenrolled identities", async () => {
  const key = createRequestKey();
  const challenge = await env.gateway.issue({ request, publicKey: key.publicKey });
  const base = { identity: env.identities.bob, group: env.group, challenge, domain: env.domain, request, key, artifacts: env.artifacts };
  await assert.rejects(present({ ...base, request: { ...request, item: "sensor-b" } }), /UNEXPECTED_REQUEST/);
  await assert.rejects(present({ ...base, key: createRequestKey() }), /UNEXPECTED_REQUEST/);
  await assert.rejects(present({ ...base, identity: env.identities.outsider }), /NOT_A_MEMBER/);
});

test("expired challenge rejects an otherwise valid proof", async () => {
  let now = Date.now();
  const gateway = new AuthorizationGateway(env.domain, env.registry, { now: () => now });
  const prepared = await prepareFor(gateway);
  now = prepared.challenge.expiresAt;
  await assert.rejects(gateway.authorize(prepared.presentation), denied("CHALLENGE_EXPIRED"));
});

test("revocation invalidates previously valid proof; remaining member can prove fresh access", async () => {
  const prepared = await env.prepare("alice");
  env.enrolled.delete("alice");
  await env.publish();
  assert.equal((await env.execute(prepared.presentation)).body.error, "AUTHORIZATION_CHANGED");
  await assert.rejects(env.prepare("alice"), /NOT_A_MEMBER/);
  assert.equal((await env.execute((await env.prepare("bob")).presentation)).status, 200);
});

test("republishing the same root still invalidates proofs bound to the old epoch", async () => {
  const prepared = await env.prepare("bob");
  const oldRoot = env.group.root;
  await env.publish();
  assert.equal(env.group.root, oldRoot);
  assert.equal((await env.execute(prepared.presentation)).body.error, "AUTHORIZATION_CHANGED");
});

test("registry failure fails closed before issuance and during authorization", async () => {
  let unavailable = false;
  const gateway = new AuthorizationGateway(env.domain, { async read() {
    if (unavailable) throw new Error("sensitive upstream diagnostic");
    return env.registry.read();
  } });
  const prepared = await prepareFor(gateway);
  unavailable = true;
  await assert.rejects(gateway.authorize(prepared.presentation), denied("REGISTRY_UNAVAILABLE"));
  await assert.rejects(gateway.issue({ request, publicKey: prepared.key.publicKey }), denied("REGISTRY_UNAVAILABLE"));
});

test("authorization rechecks state after proof verification (injected concurrent epoch change)", async () => {
  let reads = 0;
  const gateway = new AuthorizationGateway(env.domain, { async read() {
    const actual = await env.registry.read();
    reads++;
    return reads >= 3 ? { ...actual, epoch: (BigInt(actual.epoch) + 1n).toString() } : actual;
  } });
  const prepared = await prepareFor(gateway);
  await assert.rejects(gateway.authorize(prepared.presentation), denied("AUTHORIZATION_CHANGED"));
  assert.equal(reads, 3);
});

test("expiration during proof verification fails closed (injected clock advance)", async () => {
  let now = Date.now();
  let reads = 0;
  const gateway = new AuthorizationGateway(env.domain, { async read() {
    const actual = await env.registry.read();
    if (++reads === 3) now += 130_000;
    return actual;
  } }, { now: () => now });
  const prepared = await prepareFor(gateway);
  await assert.rejects(gateway.authorize(prepared.presentation), denied("CHALLENGE_EXPIRED"));
});

test("bounded challenge store resists concurrent overflow and reclaims expired entries", async () => {
  let now = Date.now();
  const gateway = new AuthorizationGateway(env.domain, env.registry, { maxChallenges: 1, now: () => now });
  const input = { request, publicKey: createRequestKey().publicKey };
  const outcomes = await Promise.allSettled([gateway.issue(input), gateway.issue(input)]);
  assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
  await assert.rejects(gateway.issue(input), denied("CAPACITY_EXCEEDED"));
  now += 121_000;
  await gateway.issue(input);
});

test("malformed proof, extra fields, and unsupported operations are rejected at the boundary", async () => {
  assert.equal((await env.post("/v1/execute", { challengeId: "bad", proof: {} })).status, 400);
  assert.equal((await env.post("/v1/challenges", { request: { operation: "admin:write", item: "sensor-a" }, publicKey: createRequestKey().publicKey })).status, 400);
  assert.equal((await env.post("/v1/challenges", { request, publicKey: createRequestKey().publicKey, administrator: true })).status, 400);
});

test("HTTP rejects browser origins, oversized payloads and non-JSON bodies", async () => {
  const crossOrigin = await fetch(`${env.url}/v1/challenges`, { method: "POST", headers: { origin: "https://evil.example" } });
  assert.equal(crossOrigin.status, 403);
  const tooLarge = await fetch(`${env.url}/v1/challenges`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ blob: "x".repeat(17_000) }) });
  assert.equal(tooLarge.status, 413);
  const wrongContentType = await fetch(`${env.url}/v1/challenges`, { method: "POST", body: "{}" });
  assert.equal(wrongContentType.status, 415);
});

test("Ethereum reader rejects wrong chain and stale chain data", async () => {
  await assert.rejects(new EthereumRegistry(env.provider, { ...env.domain, chainId: "1" }).read(), /REGISTRY_UNAVAILABLE/);
  await assert.rejects(new EthereumRegistry(env.provider, env.domain, 120, () => Date.now() + 300_000).read(), /REGISTRY_UNAVAILABLE/);
});

test("contract rejects unauthorized updates and stale administrative writes", async () => {
  const unauthorized = new Contract(env.domain.registry, REGISTRY_ABI, env.stranger);
  const block = await env.provider.getBlock("latest");
  assert.ok(block);
  await assert.rejects(unauthorized.getFunction("update")(env.domain.permission, env.epoch, env.group.root, block.timestamp + 3600, true));
  await assert.rejects(env.contract.getFunction("update")(env.domain.permission, env.epoch - 1n, env.group.root, block.timestamp + 3600, true));
});

test("contract rejects invalid roots, zero permission IDs, and expired permissions", async () => {
  const block = await env.provider.getBlock("latest");
  assert.ok(block);
  await assert.rejects(env.contract.getFunction("update")(env.domain.permission, env.epoch, FIELD, block.timestamp + 3600, true));
  await assert.rejects(env.contract.getFunction("update")(`0x${"00".repeat(32)}`, 0, env.group.root, block.timestamp + 3600, true));
  await assert.rejects(env.contract.getFunction("update")(env.domain.permission, env.epoch, env.group.root, block.timestamp - 1, true));
});

test("disabling the permission rejects outstanding proofs and new challenges", async () => {
  const prepared = await env.prepare("bob");
  await env.publish(false);
  assert.equal((await env.execute(prepared.presentation)).body.error, "PERMISSION_INACTIVE");
  assert.equal((await env.post("/v1/challenges", { request, publicKey: createRequestKey().publicKey })).body.error, "PERMISSION_INACTIVE");
});

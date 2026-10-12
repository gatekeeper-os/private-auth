import assert from "node:assert/strict";
import { localEnvironment } from "./local-environment.js";

const start = performance.now();
const env = await localEnvironment();
try {
  console.log("Gatekeeper Private Auth — local EVM + real Semaphore proofs");
  const first = await env.prepare("alice");
  const valid = await env.execute(first.presentation);
  assert.equal(valid.status, 200);
  console.log("PASS authorized member accesses catalog");
  const replay = await env.execute(first.presentation);
  assert.equal(replay.status, 403);
  console.log("PASS replay rejected");
  const changed = await env.prepare("bob");
  changed.presentation.request.item = "sensor-b";
  assert.equal((await env.execute(changed.presentation)).body.error, "REQUEST_MISMATCH");
  console.log("PASS altered request rejected");
  const revoked = await env.prepare("alice");
  env.enrolled.delete("alice");
  await env.publish();
  assert.equal((await env.execute(revoked.presentation)).body.error, "AUTHORIZATION_CHANGED");
  console.log("PASS on-chain revocation rejects a previously valid proof");
  const bob = await env.prepare("bob");
  assert.equal((await env.execute(bob.presentation)).status, 200);
  console.log("PASS remaining member succeeds against the updated root");
  await assert.rejects(env.prepare("outsider"), /NOT_A_MEMBER/);
  console.log("PASS unenrolled identity cannot generate a membership proof");
  const concurrent = await env.prepare("carol");
  const outcomes = await Promise.all([env.execute(concurrent.presentation), env.execute(concurrent.presentation)]);
  assert.equal(outcomes.filter((result) => result.status === 200).length, 1);
  assert.equal(env.executions, 3);
  console.log("PASS concurrent replay executes only once");
  console.log(`Complete in ${((performance.now() - start) / 1000).toFixed(1)}s. Experimental; no public-chain deployment or security audit.`);
} finally {
  await env.close();
}
// snarkjs retains a worker pool; this CLI exits only after its assertions and cleanup.
process.exit(0);

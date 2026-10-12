import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { ARTIFACTS, ARTIFACT_BASE } from "../src/artifacts.js";

await mkdir(".cache/semaphore", { recursive: true });
for (const artifact of ARTIFACTS) {
  const path = `.cache/semaphore/${artifact.name}`;
  let existing: Buffer | undefined;
  try { existing = await readFile(path); } catch { /* fetch absent artifacts */ }
  if (existing && createHash("sha256").update(existing).digest("hex") === artifact.sha256) {
    console.log(`${artifact.name}: verified`);
    continue;
  }
  const response = await fetch(`${ARTIFACT_BASE}${artifact.name}`, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error("ARTIFACT_DOWNLOAD_FAILED");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== artifact.sha256) throw new Error("ARTIFACT_INTEGRITY_FAILURE");
  await writeFile(`${path}.partial`, bytes);
  await rename(`${path}.partial`, path);
  console.log(`${artifact.name}: downloaded and verified`);
}

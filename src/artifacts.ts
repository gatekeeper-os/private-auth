import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ProofArtifacts } from "./client.js";

/** Pinned to the v4.13.0 artifacts used by Semaphore JS v4.14.3, tree depth 8. */
export const ARTIFACTS = [
  { name: "semaphore-8.wasm", sha256: "4edc07444a1d48d09014c963e315d3351b6e12838d83fcb1962071614b1c94b9" },
  { name: "semaphore-8.zkey", sha256: "d02521afe7133a97421244374d4bc005c1ebd7d7cf7c51e88b7e99fdaf183146" }
];
export const ARTIFACT_BASE = "https://snark-artifacts.pse.dev/semaphore/4.13.0/";

/** Fails closed on absent or changed artifacts; never silently downloads at proof time. */
export async function loadArtifacts(directory = ".cache/semaphore"): Promise<ProofArtifacts> {
  for (const artifact of ARTIFACTS) {
    const bytes = await readFile(resolve(directory, artifact.name));
    if (createHash("sha256").update(bytes).digest("hex") !== artifact.sha256) {
      throw new Error("ARTIFACT_INTEGRITY_FAILURE");
    }
  }
  return { wasm: resolve(directory, "semaphore-8.wasm"), zkey: resolve(directory, "semaphore-8.zkey") };
}

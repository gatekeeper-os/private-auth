import { dashboard } from "./dashboard.js";
const app = await dashboard();
console.log(`Gatekeeper Private Auth dashboard: ${app.origin}`);
console.log("Loopback-only demo. All identities and chain state are disposable.");
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await app.close();
  process.exit(0);
}
process.on("SIGINT", () => { void close(); });
process.on("SIGTERM", () => { void close(); });

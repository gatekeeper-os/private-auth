import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { localEnvironment } from "./local-environment.js";
import type { Presentation } from "../src/protocol.js";

const env = await localEnvironment();
const terminal = createInterface({ input: stdin, output: stdout });
let last: Presentation | undefined;
console.log(`Gatekeeper Private Auth local console. API: ${env.url}`);
console.log("Commands: status | request alice | request bob | request carol | request outsider | grant <name> | revoke <name> | replay | quit");
console.log("All identities and administrator keys are ephemeral demo fixtures. No production access.");
const timer = setInterval(() => { void env.connection.provider.request({ method: "evm_mine" }).catch(() => {}); }, 10_000);
try {
  for await (const line of terminal) {
    const [command, name] = line.trim().split(/\s+/);
    try {
      if (command === "quit") break;
      if (command === "status") {
        console.log(`Enrolled demo agents: ${[...env.enrolled].join(", ")}. Registry epoch: ${env.epoch}. Successful requests: ${env.executions}.`);
      } else if (command === "replay" && last) {
        console.log(`Replay: ${(await env.execute(last)).status}`);
      } else if ((command === "request" || command === "grant" || command === "revoke") &&
          (name === "alice" || name === "bob" || name === "carol" || name === "outsider")) {
        if (command === "request") {
          const prepared = await env.prepare(name);
          last = prepared.presentation;
          const result = await env.execute(last);
          console.log(`Authorization: ${result.status === 200 ? "allowed" : "denied"} (${result.status})`);
        } else {
          if (command === "grant") env.enrolled.add(name); else env.enrolled.delete(name);
          await env.publish();
          console.log(`Membership updated on the local chain. Epoch: ${env.epoch}.`);
        }
      } else console.log("Unknown command. Use status, request/grant/revoke <name>, replay, or quit.");
    } catch {
      console.log("Operation denied or unavailable. No permission was assumed.");
    }
  }
} finally {
  clearInterval(timer);
  terminal.close();
  await env.close();
}
process.exit(0);

const $ = (id) => document.getElementById(id);
let working = false;
const names = ["alice", "bob", "carol", "outsider"];
function text(tag, value, className) {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}
async function refresh() {
  const response = await fetch("/api/state");
  if (!response.ok) throw new Error("Console unavailable");
  const state = await response.json();
  $("members").textContent = state.enrolled.length;
  $("epoch").textContent = String(state.epoch).padStart(2, "0");
  $("executions").textContent = state.executions;
  $("agents").replaceChildren();
  for (const name of names) {
    const approved = state.enrolled.includes(name);
    const row = text("div", "", "agent-row");
    const info = text("div", "", "agent-info");
    info.append(text("div", name[0].toUpperCase(), "avatar"));
    const label = text("div", "");
    label.append(text("strong", name[0].toUpperCase() + name.slice(1)), text("small", approved ? "Approved member" : "No permission"));
    info.append(label);
    const button = text("button", approved ? "Revoke" : "Grant access");
    button.disabled = working || state.busy;
    button.setAttribute("aria-label", `${approved ? "Revoke" : "Grant"} ${name}`);
    button.addEventListener("click", () => act(approved ? "revoke" : "grant", name));
    row.append(info, button);
    $("agents").append(row);
  }
  document.querySelectorAll("[data-action]").forEach((button) => { button.disabled = working || state.busy; });
  $("execute").disabled ||= !state.pendingAgent;
  $("replay").disabled ||= !state.pendingAgent;
  $("pending").textContent = state.pendingAgent ? `Most recently prepared proof: ${state.pendingAgent}. It is bound to its original request and permission epoch; it can succeed once.` : "No prepared proof. Prepare one, revoke its agent, then submit it to test revocation.";
  if (state.events.length) {
    $("events").replaceChildren();
    for (const entry of state.events) {
      const row = text("div", "", "event");
      row.append(text("time", new Date(entry.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })),
        text("span", entry.label), text("span", entry.outcome, entry.outcome.startsWith("Denied") ? "denied" : "good"), text("small", `${entry.elapsedMs} ms`));
      $("events").append(row);
    }
  }
}
async function act(action, agent = $("agent").value) {
  if (working) return;
  working = true;
  $("feedback").textContent = action === "request" || action === "stage" ? "Generating a real zero-knowledge proof…" : "Checking authorization state…";
  try {
    await refresh();
    const response = await fetch("/api/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, agent }) });
    const result = await response.json();
    $("feedback").textContent = result.outcome || result.error || "Operation unavailable.";
  } catch { $("feedback").textContent = "Console unavailable. No permission was assumed."; }
  finally { working = false; await refresh().catch(() => {}); }
}
document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => act(button.dataset.action)));
refresh().catch(() => { $("feedback").textContent = "Could not connect to the local console."; });

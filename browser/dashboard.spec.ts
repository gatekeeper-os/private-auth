import { test, expect } from "@playwright/test";
import { dashboard } from "../scripts/dashboard.js";

let app: Awaited<ReturnType<typeof dashboard>>;
test.beforeAll(async () => { app = await dashboard(); });
test.afterAll(async () => {
  await app.close();
  const runtime = globalThis as typeof globalThis & { curve_bn128?: { terminate(): Promise<void> } };
  await runtime.curve_bn128?.terminate();
});

test("dashboard grants, proves, rejects replay, and revokes a prepared proof", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(app.origin);
  await expect(page.locator("#members")).toHaveText("3");
  await page.getByRole("button", { name: /Prove & access catalog/ }).click();
  await expect(page.locator("#feedback")).toContainText("Allowed", { timeout: 30_000 });
  await expect(page.locator("#executions")).toHaveText("1");
  await page.getByRole("button", { name: "Replay", exact: true }).click();
  await expect(page.locator("#feedback")).toContainText("CHALLENGE_UNKNOWN_OR_USED");
  await page.getByRole("button", { name: "Prepare proof", exact: true }).click();
  await expect(page.locator("#feedback")).toContainText("Proof ready", { timeout: 30_000 });
  await page.getByRole("button", { name: "Revoke alice", exact: true }).click();
  await expect(page.locator("#members")).toHaveText("2");
  await page.getByRole("button", { name: "Submit prepared", exact: true }).click();
  await expect(page.locator("#feedback")).toContainText("AUTHORIZATION_CHANGED");
  await page.getByRole("button", { name: "Grant alice", exact: true }).click();
  await expect(page.locator("#members")).toHaveText("3");
  await page.getByRole("button", { name: /Prove & access catalog/ }).click();
  await expect(page.locator("#feedback")).toContainText("Allowed", { timeout: 30_000 });
  await expect(page.locator("#executions")).toHaveText("2");
  await page.screenshot({ path: "test-results/dashboard-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: /Prove & access catalog/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/dashboard-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("local admin console rejects cross-origin writes and forged hosts", async ({ request }) => {
  const badOrigin = await request.post(`${app.origin}/api/action`, {
    headers: { origin: "https://evil.example" }, data: { action: "grant", agent: "outsider" }
  });
  expect(badOrigin.status()).toBe(403);
  const noOrigin = await request.post(`${app.origin}/api/action`, { data: { action: "grant", agent: "outsider" } });
  expect(noOrigin.status()).toBe(403);
  const badHost = await request.get(`${app.origin}/api/state`, { headers: { host: "evil.example" } });
  expect(badHost.status()).toBe(403);
});

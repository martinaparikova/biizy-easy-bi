import { expect, test } from "@playwright/test";

test("real local Ollama applies distinct donut colors from the reported Czech request", async ({ page }) => {
  test.skip(process.env.TEST_LOCAL_AI !== "1", "Opt-in integration test needs the local model installed and running.");
  test.setTimeout(600000);
  await page.goto("/");
  await expect(page.getByText("Engine ready", { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".assistant-heading")).toContainText("Local Ollama · qwen2.5:3b");
  await page.getByLabel(/Allow local AI/).check();
  await page.getByLabel("Ask your data assistant").fill("u revenue by category chci, aby casti pie chartu mely ruzne barvy, ne vse ruzove");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  const donut = page.locator(".chart-card").filter({ has: page.getByRole("heading", { name: "Revenue by category", exact: true }) });
  await expect(page.locator(".message-assistant").last()).toContainText("palette", { timeout: 245000 });
  const fills = await donut.locator(".recharts-pie-sector path").evaluateAll(elements => elements.map(element => element.getAttribute("fill")));
  expect(new Set(fills).size).toBe(3);
  expect(fills.some(fill => fill !== "#e6007e" && fill !== "#ff4da6" && fill !== "#c9006e")).toBe(true);
  await expect(page.locator("body")).toHaveCSS("font-family", '"Space Grotesk", sans-serif');
});

test("real local Ollama interprets Czech appearance and chart requests", async ({ page }) => {
  test.skip(process.env.TEST_LOCAL_AI !== "1", "Opt-in integration test needs the local model installed and running.");
  test.setTimeout(600000);
  await page.goto("/");
  await expect(page.getByText("Engine ready", { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".assistant-heading")).toContainText("Local Ollama · qwen2.5:3b");
  await page.getByLabel(/Allow local AI/).check();
  await page.getByLabel("Ask your data assistant").fill("Přepni aplikaci do světlého režimu a nastav všude font Arial.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light", { timeout: 245000 });
  await expect(page.locator("body")).toHaveCSS("font-family", "Arial, sans-serif");
  await expect(page.locator(".agent-receipt")).toBeVisible();
  await page.getByLabel("Ask your data assistant").fill("Přesuň graf Revenue by month na první místo v dashboardu. Zachovej ostatní grafy.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".chart-card h3").first()).toHaveText("Revenue by month", { timeout: 245000 });
  await expect(page.locator(".chart-card")).toHaveCount(3);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".chart-card h3").first()).toHaveText("Sales by region");
});

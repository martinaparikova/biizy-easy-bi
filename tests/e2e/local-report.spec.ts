import { expect, test } from "@playwright/test";

test("real Ollama adds a page with text and navigation", async ({ page }) => {
  test.skip(process.env.TEST_LOCAL_AI !== "1", "Requires a running local Ollama model.");
  test.setTimeout(300000);
  await page.goto("/");
  await expect(page.getByText("Engine ready", { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".assistant-heading")).toContainText("Local Ollama");
  await page.getByLabel(/Allow local AI/).check();
  await page.getByLabel("Ask your data assistant").fill("Add a report page named Products. Put Revenue by category on it, add the text Product performance and a button Back to overview that opens Overview. Keep Overview unchanged. Open Products.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Report pages" }).getByRole("button", { name: "Products", exact: true })).toHaveAttribute("aria-current", "page", { timeout: 250000 });
  await expect(page.locator(".chart-card")).toHaveCount(1);
  await expect(page.locator(".chart-card h3")).toHaveText("Revenue by category");
  await expect(page.locator(".report-block-text")).toHaveText("Product performance");
  await page.getByRole("button", { name: "Back to overview", exact: true }).click();
  await expect(page.locator(".chart-card")).toHaveCount(3);
});

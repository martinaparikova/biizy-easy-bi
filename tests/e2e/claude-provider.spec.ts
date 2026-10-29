import { expect, test } from "@playwright/test";

test("Claude Code shows sign-in instructions and explains metadata sharing", async ({ page }) => {
  await page.route("**/api/assistant", route => route.fulfill({
    json: { configured: false, provider: "claude-code", model: "sonnet" },
  }));
  await page.goto("/");
  await expect(page.getByText("Engine ready", { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".assistant-heading")).toContainText("Claude Code · setup required");
  await expect(page.locator(".ai-setup")).toContainText("Pro/Max subscription");
  await expect(page.locator(".ai-setup")).toContainText("AI_PROVIDER=ollama");
  await expect(page.locator(".ai-consent")).toContainText("Anthropic via Claude Code");
  await expect(page.locator(".ai-consent")).not.toContainText("Stays on this computer");
});

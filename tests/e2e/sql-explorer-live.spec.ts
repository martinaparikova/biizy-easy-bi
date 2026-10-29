import { expect, test } from "@playwright/test";

test("local AI drafts a DuckDB query that can be reviewed and run", async ({ page }) => {
  test.skip(process.env.TEST_LOCAL_AI !== "1", "Opt-in test calls the installed local model.");
  test.setTimeout(600000);
  await page.route("**/api/assistant", async route => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { configured: true, provider: "ollama", model: "qwen2.5:3b" } });
    } else {
      await route.continue();
    }
  });
  await page.goto("/");
  await expect(page.getByText("Engine ready", { exact: true })).toBeVisible({ timeout: 60000 });
  await page.getByLabel(/Allow local AI/).check();
  await page.getByRole("button", { name: "Explore SQL", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Explore data with SQL" });
  const queryEditor = dialog.getByLabel("DuckDB SQL query");
  const initialQuery = await queryEditor.inputValue();
  const draftButton = dialog.getByRole("button", { name: "Draft with AI" });
  await dialog.getByLabel("Describe an AI SQL query").fill("Show total revenue by region");
  await draftButton.click();
  await expect(dialog.getByLabel("Describe an AI SQL query")).toHaveValue("", { timeout: 245000 });
  await expect(queryEditor).not.toHaveValue(initialQuery);
  await expect(queryEditor).toHaveValue(/AS\s+value/i);
  await dialog.getByRole("button", { name: "Run query", exact: true }).click();
  await expect(dialog.locator(".sql-results-table tbody tr")).toHaveCount(4, { timeout: 30000 });
  await expect(dialog.getByLabel("New chart title")).not.toHaveValue("SQL result");
});

import { expect, test } from "@playwright/test";

test("Explore from a connected source opens SQL for that table", async ({ page }) => {
  await page.route("**/api/assistant", route => route.fulfill({ json: { configured: false, provider: "openai", model: "test" } }));
  await page.goto("/");
  await expect(page.getByText("Engine ready", { exact: true })).toBeVisible({ timeout: 60000 });
  await page.locator(".view-tabs").getByRole("button", { name: /Data sources/ }).click();
  const explore = page.getByRole("button", { name: "Explore Sales warehouse with SQL" });
  await expect(explore).toHaveText("Explore SQL");
  await expect(explore).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
  await expect(explore.locator(".lucide-database")).toBeVisible();
  await explore.click();
  const dialog = page.getByRole("dialog", { name: "Explore data with SQL" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("DuckDB SQL query")).toHaveValue(/FROM "sales"\s+LIMIT 100/);
  await dialog.getByRole("button", { name: "Run query", exact: true }).click();
  await expect(dialog.locator(".sql-results")).toContainText("100 rows");
});

test("manual SQL, AI query drafts, safe execution, chart creation and chart check", async ({ page }) => {
  await page.route("**/api/assistant", async route => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { configured: true, provider: "ollama", model: "qwen2.5:3b" } });
      return;
    }
    const request = route.request().postDataJSON();
    expect(request.workspace.sources[0].rows).toBeUndefined();
    expect(request.workspace.charts[0].sql).toBeUndefined();
    expect(request.workspace.charts[0].data).toBeUndefined();
    expect(request.prompt).toContain("týdenní tržby podle regionu");
    await route.fulfill({ json: {
      message: "Připravil jsem SQL návrh, před spuštěním ho zkontrolujte.",
      actions: [{
        type: "create_chart", title: "Revenue by region", kind: "bar", format: "currency", width: "half",
        sql: "SELECT r.Region AS label, CAST(SUM(s.Revenue) AS DOUBLE) AS value FROM sales s JOIN regions r ON s.Region_ID = r.Region_ID GROUP BY r.Region ORDER BY value DESC LIMIT 50",
      }],
    } });
  });
  await page.goto("/");
  await expect(page.getByText("Engine ready", { exact: true })).toBeVisible({ timeout: 60000 });
  await page.getByLabel(/Allow local AI/).check();
  await page.getByRole("button", { name: "Explore SQL", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Explore data with SQL" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Describe an AI SQL query")).toHaveCSS("border-top-width", "2px");
  await expect(dialog.getByLabel("DuckDB SQL query")).toHaveValue(/FROM "sales"/);

  await dialog.getByLabel("DuckDB SQL query").fill("SELECT Region AS label, CAST(SUM(Revenue) AS DOUBLE) AS value FROM sales JOIN regions USING (Region_ID) GROUP BY Region ORDER BY value DESC");
  await dialog.getByRole("button", { name: "Run query", exact: true }).click();
  await expect(dialog.locator(".sql-results")).toContainText("4 rows");
  await expect(dialog.locator(".sql-results-table tbody tr")).toHaveCount(4);

  await dialog.getByLabel("DuckDB SQL query").fill("DELETE FROM sales");
  await dialog.getByRole("button", { name: "Run query", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("single SELECT or WITH");

  await dialog.getByLabel("Describe an AI SQL query").fill("Připrav týdenní tržby podle regionu");
  await dialog.getByRole("button", { name: "Draft with AI" }).click();
  await expect(dialog.getByLabel("DuckDB SQL query")).toHaveValue(/GROUP BY r\.Region/);
  await expect(dialog.locator(".sql-results")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Run query", exact: true }).click();
  await expect(dialog.locator(".sql-results-table tbody tr")).toHaveCount(4);
  await expect(dialog.getByLabel("New chart title")).toHaveValue("Revenue by region");
  const chartOptions = dialog.locator(".sql-chart-options");
  const chartFooter = dialog.locator(".sql-chart-footer");
  await expect(chartFooter).toBeVisible();
  await expect(chartOptions).toBeVisible();
  await expect(dialog.locator(".sql-chart-options + .sql-chart-footer")).toBeVisible();
  await chartFooter.getByRole("button", { name: "Add chart", exact: true }).click();

  await expect(page.locator(".chart-card")).toHaveCount(4);
  const chart = page.locator(".chart-card").filter({ has: page.getByRole("heading", { name: "Revenue by region" }) });
  await expect(chart.locator(".recharts-rectangle").nth(1)).toHaveAttribute("fill", "#ff4da6");
  await chart.getByRole("button", { name: "Verify values for Revenue by region" }).click();
  const check = page.getByRole("dialog", { name: "Check Revenue by region" });
  await expect(check.getByRole("status")).toContainText("Values match");
  await expect(check).toContainText("does not independently prove");
  await expect(check.getByLabel("Generated read-only check query")).toHaveValue(/WITH chart_check AS/);
});

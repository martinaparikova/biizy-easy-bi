import { expect, test } from "@playwright/test";

test("manual pages, text and buttons persist with a quiet default canvas", async ({ page }) => {
  await page.route("**/api/assistant", route => route.fulfill({ json: { configured: false, provider: "openai", model: "test" } }));
  await page.goto("/");
  await expect(page.getByText("Engine ready", { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.getByLabel("Chart type for Sales by region")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit report", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit report", exact: true });
  await editor.getByRole("button", { name: "Add page", exact: true }).click();
  await editor.getByLabel("Page name", { exact: true }).fill("Products");
  await editor.getByRole("button", { name: "Rename", exact: true }).click();
  await editor.getByLabel("Revenue by category", { exact: true }).check();
  await editor.getByLabel("Element text", { exact: true }).fill("Product performance");
  await editor.getByRole("button", { name: "Add element", exact: true }).click();
  await editor.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(".chart-card")).toHaveCount(1);
  await expect(page.locator(".report-block-text")).toHaveText("Product performance");
  await page.getByRole("button", { name: "Edit report", exact: true }).click();
  await editor.getByRole("navigation", { name: "Report pages" }).getByRole("button", { name: "Overview", exact: true }).click();
  await editor.getByLabel("Element type").selectOption("button");
  await editor.getByLabel("Element text").fill("Open products");
  await editor.getByLabel("Button destination").selectOption({ label: "Products" });
  await editor.getByRole("button", { name: "Add element", exact: true }).click();
  await editor.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Open products", exact: true }).click();
  await expect(page.locator(".chart-card")).toHaveCount(1);
  await page.reload();
  await expect(page.getByText("Engine ready", { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".report-block-text")).toHaveText("Product performance");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("AI creates report pages and navigation; Undo restores the original report", async ({ page }) => {
  await page.route("**/api/assistant", route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { configured: true, provider: "openai", model: "test" } });
    const context = route.request().postDataJSON();
    expect(context.workspace.report.pages[0].title).toBe("Overview");
    return route.fulfill({ json: { message: "Prepared product page.", actions: [{
      type: "report", report: { activePageId: "products", pages: [
        ...context.workspace.report.pages,
        { id: "products", title: "Products", chartIds: [context.workspace.charts[2].id], blocks: [
          { id: "note", kind: "text", text: "Product performance" },
          { id: "back", kind: "button", text: "Back to overview", targetPageId: "overview" },
        ] },
      ] },
    }] } });
  });
  await page.goto("/");
  await expect(page.getByText("Engine ready", { exact: true })).toBeVisible({ timeout: 60000 });
  await page.getByLabel(/Allow sharing messages/).check();
  await page.getByLabel("Ask your data assistant").fill("Add a Products page and a back button.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".chart-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Back to overview" }).click();
  await expect(page.locator(".chart-card")).toHaveCount(3);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Report pages" }).getByRole("button")).toHaveCount(1);
});

import { expect, test } from "@playwright/test";

test("AI custom report binds real data, handles interactions, persists, revises and undoes", async ({ page }) => {
  let version = 0;
  await page.route("**/api/assistant", route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { configured: true, provider: "openai", model: "test" } });
    const context = route.request().postDataJSON();
    expect(context.workspace.charts[0].data).toBeUndefined();
    expect(context.workspace.report.pages[0].custom?.previous).toBeUndefined();
    version++;
    return route.fulfill({ json: { message: "Prepared custom view.", actions: [{
      type: "custom_report", pageId: context.workspace.report.activePageId,
      source: { html: `<h2>Custom ${version}</h2>`, css: "section{padding:24px}button{padding:10px}",
        javascript: `let expanded = false;
const rows = data.datasets.find(item => item.title === "Sales by region").rows;
function render() {
  const total = rows.reduce((sum,row) => sum + row.value, 0);
  api.render('<section><h2>Custom ${version}</h2><p>Total: ' + total + '</p><button data-action="detail" title="Revenue before tax">Info</button>' + (expanded ? '<p>Details opened</p>' : '') + '</section>', 'section{padding:24px}');
}
api.on('detail', () => { expanded = !expanded; render(); });
render();`, height: 450 },
    }] } });
  });
  await page.goto("/");
  await expect(page.getByText("Engine ready", { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".custom-report-code")).toHaveCount(0);
  await page.getByLabel(/Allow sharing messages/).check();
  const ask = async () => {
    await page.getByLabel("Ask your data assistant").fill("Create a custom interactive sales visual with an info tooltip.");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
  };
  await ask();
  const frame = page.frameLocator('iframe[title="Custom report"]');
  await expect(frame.getByRole("heading", { name: "Custom 1" })).toBeVisible();
  await expect(frame.getByText("Total: 2069955")).toBeVisible();
  await expect(frame.getByRole("button", { name: "Info" })).toHaveAttribute("title", "Revenue before tax");
  await frame.getByRole("button", { name: "Info" }).click();
  await expect(frame.getByText("Details opened")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Engine ready", { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(frame.getByRole("heading", { name: "Custom 1" })).toBeVisible();
  await page.getByLabel(/Allow sharing messages/).check();
  await ask();
  await expect(frame.getByRole("heading", { name: "Custom 2" })).toBeVisible();
  await page.getByRole("button", { name: "Previous version" }).click();
  await expect(frame.getByRole("heading", { name: "Custom 1" })).toBeVisible();
  await ask();
  await expect(frame.getByRole("heading", { name: "Custom 3" })).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(frame.getByRole("heading", { name: "Custom 1" })).toBeVisible();
  await page.getByRole("button", { name: "Standard view" }).click();
  await expect(page.locator(".chart-card")).toHaveCount(3);
});

test("custom code cannot read parent storage or make network requests; HTML is sanitized", async ({ page }) => {
  await page.route("**/api/assistant", route => route.fulfill({ json: { configured: false, provider: "openai", model: "test" } }));
  await page.goto("/");
  await expect(page.getByText("Engine ready", { exact: true })).toBeVisible({ timeout: 60000 });
  await page.getByRole("switch", { name: "Developer mode" }).click();
  await page.getByText("Custom report code", { exact: true }).click();
  let externalRequests = 0;
  await page.route("https://blocked.example/**", route => { externalRequests++; return route.abort(); });
  await page.getByLabel("Custom report JavaScript").fill(`
Promise.all([
  fetch('https://blocked.example/test').then(() => 'unexpected network', () => 'network blocked'),
  Promise.resolve().then(() => { try { return localStorage.getItem('private') } catch { return 'storage blocked' } }),
  Promise.resolve().then(() => { try { return parent.document.title } catch { return 'parent blocked' } })
]).then(results => api.render('<p>' + results.join(' / ') + '</p><a href="https://blocked.example/nav">Bad link</a><img src="https://blocked.example/image" onerror="alert(1)"><script>alert(1)</script>'));`);
  await page.getByRole("button", { name: "Apply preview" }).click();
  const frame = page.frameLocator('iframe[title="Custom report"]');
  await expect(frame.getByText("network blocked / storage blocked / parent blocked")).toBeVisible();
  await expect(frame.locator("#report-root a, #report-root script, #report-root [src], #report-root [onerror]")).toHaveCount(0);
  await expect(page.locator('iframe[title="Custom report"]')).toHaveAttribute("sandbox", "allow-scripts");
  expect(externalRequests).toBe(0);
  await page.getByLabel("Custom report JavaScript").fill("throw new Error('test render failure')");
  await page.getByRole("button", { name: "Apply preview" }).click();
  await expect(page.locator(".custom-report-preview [role='alert']")).toContainText("test render failure");
  await expect(page.getByRole("button", { name: "Ask AI to repair" })).toBeVisible();
  await page.getByRole("button", { name: "Previous version" }).click();
  await expect(frame.getByText("network blocked / storage blocked / parent blocked")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ask AI to repair" })).toHaveCount(0);
  await page.getByLabel("Custom report JavaScript").fill("const broken = ;");
  await page.getByRole("button", { name: "Apply preview" }).click();
  await expect(page.locator(".custom-report-preview [role='alert']")).toBeVisible();
  await page.getByLabel("Custom report JavaScript").fill("while (true) {}");
  await page.getByRole("button", { name: "Apply preview" }).click();
  await expect(page.locator(".custom-report-preview [role='alert']")).toContainText("within 10 seconds", { timeout: 15000 });
  await page.getByRole("button", { name: "Standard view" }).click();
  await expect(page.locator(".chart-card")).toHaveCount(3);
});

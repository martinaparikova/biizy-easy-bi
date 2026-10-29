import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("AI palette changes donut slices and legend, persists and can be undone", async ({ page }) => {
  await page.route("**/api/assistant", route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { configured: true, provider: "ollama", model: "test" } });
    const context = route.request().postDataJSON();
    const chart = context.workspace.charts.find((item: { title: string }) => item.title === "Revenue by category");
    return route.fulfill({ json: { message: "Nastavím různé barvy.", actions: [
      { type: "chart", id: chart.id, patch: { palette: ["#e6007e", "#f2c94c", "#22aabb"] } },
    ] } });
  });
  await page.goto("/");
  await expect(page.getByText("Engine ready", { exact: true })).toBeVisible({ timeout: 60000 });
  await page.getByLabel(/Allow local AI/).check();
  await page.getByLabel("Ask your data assistant").fill("u revenue by category chci, aby casti pie chartu mely ruzne barvy, ne vse ruzove");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  const chart = page.locator(".chart-card").filter({ has: page.getByRole("heading", { name: "Revenue by category", exact: true }) });
  await expect(chart.locator(".recharts-pie-sector path").nth(1)).toHaveAttribute("fill", "#f2c94c");
  await expect(chart.locator(".chart-legend i").nth(1)).toHaveCSS("background-color", "rgb(242, 201, 76)");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(chart.locator(".recharts-pie-sector path").nth(1)).toHaveAttribute("fill", "#ff4da6");
  await page.getByLabel("Ask your data assistant").fill("Změň Revenue by category na různé barvy");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(chart.locator(".recharts-pie-sector path").nth(1)).toHaveAttribute("fill", "#f2c94c");
  await page.reload();
  await expect(page.getByText("Engine ready", { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(chart.locator(".recharts-pie-sector path").nth(1)).toHaveAttribute("fill", "#f2c94c");
});

test("dark default, region filtering, AI action batch, undo and persistence", async ({ page }) => {
  await page.route("**/api/assistant", async route => {
    if (route.request().method() === "GET") await route.fulfill({ json: { configured: true, provider: "openai", model: "test" } });
    else await route.continue();
  });
  await page.goto("/");
  await expect(page).toHaveTitle("Biizy — Build reports by asking.");
  await expect(page.getByRole("button", { name: "Biizy home" })).toBeVisible();
  await expect(page.locator(".brand-wordmark > span")).toHaveText("Build reports by asking.");
  await expect(page.locator(".brand-mark rect")).toHaveCount(3);
  await expect(page.locator(".brand-mark")).toHaveCSS("color", "rgb(230, 0, 126)");
  await expect(page.locator('link[rel="icon"][href="/icon.svg"]')).toHaveCount(1);
  await expect(page.getByText("Engine ready", { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".chart-card")).toHaveCount(3);
  await expect(page.getByRole("navigation", { name: "Workspace navigation" })).toHaveCount(0);
  await expect(page.locator(".workspace-nav .view-tabs button")).toHaveCount(3);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("font-family", '"Space Grotesk", sans-serif');
  await expect(page.locator("html")).toHaveCSS("--primary", "#e6007e");
  expect(await page.evaluate(() => document.fonts.check('13px "Space Grotesk"'))).toBe(true);
  await expect(page.locator(".chat-composer")).toHaveCSS("border-top-width", "2px");
  const assistantPanel = page.getByRole("complementary", { name: "AI assistant", exact: true });
  await expect(assistantPanel.locator(".assistant-heading strong")).toHaveText("AI assistant");
  await expect(assistantPanel.locator(".data-path")).toHaveCount(0);
  for (const side of ["top", "right", "bottom", "left"]) {
    await expect(assistantPanel).toHaveCSS(`border-${side}-width`, "3px");
    await expect(assistantPanel).toHaveCSS(`border-${side}-color`, "rgb(230, 0, 126)");
  }
  const resizeHandle = page.getByRole("separator", { name: "Resize AI assistant" });
  await expect(resizeHandle).toHaveAttribute("aria-valuenow", "380");
  await resizeHandle.press("ArrowLeft");
  await expect(resizeHandle).toHaveAttribute("aria-valuenow", "400");
  await expect(page.getByRole("button", { name: "Try asking" })).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Try asking" }).click();
  await expect(page.getByRole("button", { name: "Try asking" })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Posuň Sales by region na první místo" })).toBeVisible();

  await page.locator(".filter-control summary").click();
  await page.locator(".filter-popover").getByLabel("Europe", { exact: true }).click();
  await expect(page.locator(".filter-popover").getByLabel("Europe", { exact: true })).toBeChecked();
  await expect(page.locator(".metric").first().locator("strong")).toHaveText("$571,953");
  await expect(page.locator(".chart-card").first().getByRole("img")).toHaveAttribute("aria-label", "Sales by region. Europe: $571,953");
  await page.locator(".filter-popover").getByRole("button", { name: "Clear selection" }).click();
  await expect(page.locator(".metric").first().locator("strong")).toHaveText("$2,069,955");
  await page.locator(".filter-control summary").click();

  let beforeIds: string[] = [];
  let requests = 0;
  await page.route("**/api/assistant", async route => {
    if (route.request().method() !== "POST") {
      await route.fulfill({ json: { configured: true, model: "test" } });
      return;
    }
    requests++;
    const context = route.request().postDataJSON();
    expect(context.workspace.sources[0].rows).toBeUndefined();
    expect(context.workspace.charts[0].sql).toBeUndefined();
    expect(context.workspace.charts[0].data).toBeUndefined();
    beforeIds = context.workspace.charts.map((c: { id: string }) => c.id);
    await route.fulfill({ json: {
      message: "Připravím světlejší a kompaktnější dashboard.",
      actions: [
        { type: "reorder", ids: [...beforeIds].reverse() },
        { type: "appearance", patch: { theme: "light", font: "Arial", density: "compact" } },
        { type: "chart", id: beforeIds[0], patch: { color: "#22aabb", showGrid: false, height: 300 } },
      ],
    } });
  });
  await page.getByLabel(/Allow sharing messages/).check();
  await page.getByLabel("Ask your data assistant").fill("Přesuň grafy, přepni motiv a změň font.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS("font-family", "Arial, sans-serif");
  await expect(page.locator(".chart-card h3").first()).toHaveText("Revenue by category");
  await expect(page.locator(".agent-receipt")).toContainText("3 actions applied");
  expect(requests).toBe(1);

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".chart-card h3").first()).toHaveText("Sales by region");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.getByText("Engine ready", { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByLabel(/Allow sharing messages/)).not.toBeChecked();

  await page.locator(".view-tabs").getByRole("button", { name: "Semantic model", exact: true }).click();
  await expect(page.locator(".model-board")).toHaveCSS("background-image", "none");
  await expect(page.locator(".entity-card").first()).toHaveCSS("border-top-width", "3px");
  await expect(page.locator(".entity-card").first()).toHaveCSS("border-top-color", "rgb(230, 0, 126)");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Show assistant", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "AI assistant", exact: true })).toBeVisible();
});

test("missing OpenAI configuration is explicit and leaves dashboard unchanged", async ({ page }) => {
  await page.route("**/api/assistant", async route => {
    await route.fulfill(route.request().method() === "POST" ? {
      status: 503, json: { error: "Set OPENAI_API_KEY in .env.local and restart the server." },
    } : { json: { configured: false, model: "test" } });
  });
  await page.goto("/");
  await expect(page.getByText("Engine ready", { exact: true })).toBeVisible({ timeout: 60000 });
  await page.getByLabel(/Allow sharing messages/).check();
  await page.getByLabel("Ask your data assistant").fill("Změň font na Arial");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".message-assistant").last()).toContainText("No changes were applied.");
  await expect(page.locator(".message-assistant").last()).toContainText("OPENAI_API_KEY");
  await expect(page.locator("body")).toHaveCSS("font-family", '"Space Grotesk", sans-serif');
  await expect(page.locator(".chart-card")).toHaveCount(3);
});

test("migrates saved default Roboto to Space Grotesk once", async ({ page }) => {
  await page.route("**/api/assistant", route => route.fulfill({ json: { configured: false, provider: "openai", model: "test" } }));
  await page.goto("/");
  await expect(page.getByText("Engine ready", { exact: true })).toBeVisible({ timeout: 60000 });
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("lens-workspace", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const read = db.transaction("workspace").objectStore("workspace").get("current");
      const saved = await new Promise<Record<string, unknown>>((resolve, reject) => {
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error);
      });
      saved.version = 1;
      saved.appearance = { ...(saved.appearance as object), font: "Roboto" };
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("workspace", "readwrite");
        transaction.objectStore("workspace").put(saved, "current");
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  });
  await page.reload();
  await expect(page.getByText("Engine ready", { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.locator("body")).toHaveCSS("font-family", '"Space Grotesk", sans-serif');
  expect(await page.evaluate(() => document.fonts.check('13px "Space Grotesk"'))).toBe(true);
  const savedFont = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("lens-workspace", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const request = db.transaction("workspace").objectStore("workspace").get("current");
      const saved = await new Promise<{ version: number; appearance: { font: string } }>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return { version: saved.version, font: saved.appearance.font };
    } finally {
      db.close();
    }
  });
  expect(savedFont).toEqual({ version: 2, font: "Space Grotesk" });
});

test("invalid SQL preserves the chart and dark dashboard exports as a real PDF", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Engine ready", { exact: true })).toBeVisible({ timeout: 60000 });
  await page.getByRole("switch", { name: "Developer mode", exact: true }).click();
  await page.getByRole("button", { name: "Edit SQL for Sales by region", exact: true }).click();
  const chart = page.locator(".chart-card").first();
  const before = await chart.getByRole("img").getAttribute("aria-label");
  await chart.getByRole("textbox").fill("SELECT missing AS label, 12 AS value FROM sales");
  await chart.getByRole("button", { name: "Run query", exact: true }).click();
  await expect(chart.getByRole("alert")).toContainText(/missing|not found|referenced/i);
  await expect(chart.getByRole("img")).toHaveAttribute("aria-label", before!);
  await page.getByRole("button", { name: "Edit SQL for Sales by region", exact: true }).click();
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const shareDialog = page.getByRole("dialog", { name: "Share your dashboard" });
  await expect(shareDialog.getByRole("button", { name: /Share \/ Embed/ })).toBeVisible();
  await expect(shareDialog.getByRole("button", { name: /Export PDF/ })).toBeVisible();
  await shareDialog.getByRole("button", { name: /Share \/ Embed/ }).click();
  const embedDialog = page.getByRole("dialog", { name: "Share / Embed" });
  await expect(embedDialog.getByLabel("HTML embed snippet")).toHaveValue(/<iframe/);
  await embedDialog.getByRole("button", { name: "Back", exact: true }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("dialog", { name: "Share your dashboard" }).getByRole("button", { name: /Export PDF/ }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("sales-overview.pdf");
  const filename = await download.path();
  const pdf = await readFile(filename!);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(10000);
  expect(pdf.length).toBeLessThan(3000000);
});

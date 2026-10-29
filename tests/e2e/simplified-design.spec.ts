import { expect, test, type Page } from "@playwright/test";

async function expectSurfaceContrast(page: Page, selector: string, minimum: number) {
  const ratio = await page.locator(selector).first().evaluate(element => {
    const luminance = (color: string) => {
      const values = color.match(/\d+/g)!.slice(0, 3).map(value => {
        const channel = Number(value) / 255;
        return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
      });
      return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
    };
    const card = luminance(getComputedStyle(element).backgroundColor);
    const canvas = luminance(getComputedStyle(document.body).backgroundColor);
    return (Math.max(card, canvas) + .05) / (Math.min(card, canvas) + .05);
  });
  expect(ratio).toBeGreaterThanOrEqual(minimum);
}

test("compact source actions, single enabled connector, uploads and editable model", async ({ page }) => {
  await page.route("**/api/assistant", route => route.fulfill({ json: { configured: false, provider: "openai", model: "test" } }));
  await page.goto("/");
  await expect(page.getByText("Engine ready", { exact: true })).toBeVisible({ timeout: 60000 });

  for (const theme of ["dark", "light"]) {
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expectSurfaceContrast(page, ".chart-card", 1.15);
    await page.locator(".view-tabs").getByRole("button", { name: /Data sources/ }).click();
    await expect(page.locator(".source-action-card")).toHaveCount(2);
    await expectSurfaceContrast(page, ".source-action-card", 1.15);
    await expectSurfaceContrast(page, ".source-card", 1.15);
    expect((await page.locator(".source-action-card").first().boundingBox())!.height).toBeLessThan(140);
    await page.locator(".view-tabs").getByRole("button", { name: "Semantic model", exact: true }).click();
    await expectSurfaceContrast(page, ".entity-card", 1.15);
    await expect(page.locator(".entity-card").first()).toHaveCSS("border-top-width", "3px");
    await expect(page.locator(".entity-card").first()).toHaveCSS("border-top-color", "rgb(230, 0, 126)");
    await expect(page.locator(".relationship-lines path[marker-end]").first()).toHaveAttribute("marker-end", "url(#relationship-arrow)");
    await expect(page.locator(".entity-column svg, .port-dot")).toHaveCount(0);
    expect((await page.locator(".entity-card").first().boundingBox())!.width).toBeLessThanOrEqual(241);
    if (theme === "dark") await page.getByRole("button", { name: "Switch to light mode" }).click();
    await page.locator(".view-tabs").getByRole("button", { name: "Dashboard", exact: true }).click();
  }

  await page.locator(".view-tabs").getByRole("button", { name: /Data sources/ }).click();
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Connect", exact: true });
  await expect(picker).toBeVisible();
  await expect(picker.locator(".connector-options button")).toHaveCount(26);
  await expect(picker.locator(".connector-options button:enabled")).toHaveCount(1);
  await expect(picker.getByRole("button", { name: /Snowflake/ })).toBeDisabled();
  await picker.getByRole("textbox", { name: "Search connections" }).fill("snow");
  await expect(picker.locator(".connector-options button")).toHaveCount(1);
  await picker.getByRole("textbox", { name: "Search connections" }).fill("unknown");
  await expect(picker).toContainText("No matching connections");
  await picker.getByRole("textbox", { name: "Search connections" }).fill("");
  await picker.getByRole("button", { name: /PostgreSQL/ }).click();
  const form = page.getByRole("dialog", { name: "Connect a SQL database" });
  await expect(form).toBeVisible();
  await form.getByRole("button", { name: /Fill demo details/ }).click();
  await form.getByRole("button", { name: "Connect demo data" }).click();
  await expect(page.locator(".source-card")).toHaveCount(3);
  const fileChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await (await fileChooser).setFiles({
    name: "targets.csv", mimeType: "text/csv", buffer: Buffer.from("Region_ID,Goal\n1,100\n2,200"),
  });
  await expect(page.locator(".source-card")).toHaveCount(4);
  await page.locator(".view-tabs").getByRole("button", { name: "Semantic model", exact: true }).click();
  await page.getByRole("button", { name: "Connect sales.Region_ID", exact: true }).click();
  await expect(page.getByRole("button", { name: "Connect sales.Region_ID", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Connect targets.Region_ID", exact: true }).click();
  await expect(page.locator(".relationship-row")).toHaveCount(2);
  await expect(page.locator(".relationship-lines path[marker-end]")).toHaveCount(2);
  await page.reload();
  await expect(page.getByText("Engine ready", { exact: true })).toBeVisible({ timeout: 60000 });
  await page.locator(".view-tabs").getByRole("button", { name: "Semantic model", exact: true }).click();
  await expect(page.locator(".relationship-row")).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await page.locator(".entity-card").first().boundingBox())!.width).toBeLessThanOrEqual(241);
});

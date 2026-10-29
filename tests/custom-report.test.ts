import { test } from "node:test";
import assert from "node:assert/strict";
import { customSourceSchema, customFrameDocument, customReportData, reviseCustomReport } from "../lib/custom-report";
import { defaultReport, reportAIContext } from "../lib/report";
import { DEFAULT_APPEARANCE, executeAgentActions } from "../lib/agent-executor";
import type { Chart } from "../lib/types";

const chart: Chart = { id: "private-id", title: "Sales", subtitle: "", kind: "bar", sql: "SELECT 'A' AS label, 1 AS value", data: [{ label: "A", value: 1, private: "not-for-preview" }], labelKey: "label", valueKey: "value", format: "number", width: "half" };
const source = { html: "<h2>Custom</h2>", css: "h2{color:#e6007e}", javascript: "", height: 400 };

test("custom source validates sizes and persists only three earlier versions", () => {
  assert.equal(customSourceSchema.safeParse({ ...source, height: 50 }).success, false);
  assert.equal(customSourceSchema.safeParse({ ...source, javascript: "x".repeat(40001) }).success, false);
  let current = reviseCustomReport(undefined, source);
  for (let i = 0; i < 5; i++) current = reviseCustomReport(current, { ...source, html: `<h2>${i}</h2>` });
  assert.equal(current.previous?.length, 3);
  assert.equal(current.previous?.[0].html, "<h2>3</h2>");
});

test("preview receives result bindings but no SQL, extra columns, chart IDs or credentials", () => {
  const data = customReportData([chart], DEFAULT_APPEARANCE);
  assert.deepEqual(data.datasets[0].rows, [{ label: "A", value: 1 }]);
  assert.doesNotMatch(JSON.stringify(data), /private-id|SELECT|not-for-preview/);
  const document = customFrameDocument("unit-test-nonce");
  assert.match(document, /connect-src 'none'/);
  assert.match(document, /worker-src blob:/);
  assert.doesNotMatch(document, /unsafe-eval|allow-same-origin/);
});

test("custom AI actions are atomic and current code context excludes revision history", async () => {
  const before = { charts: [chart], sources: [], relationships: [], appearance: DEFAULT_APPEARANCE, filters: [], dateRange: "all" as const, view: "dashboard" as const, title: "Demo", report: defaultReport([chart]) };
  const first = await executeAgentActions(before, { message: "Preview", actions: [{ type: "custom_report", pageId: "overview", source }] }, async () => []);
  assert.equal(first.report?.pages[0].custom?.html, source.html);
  assert.equal(before.report.pages[0].custom, undefined);
  const second = await executeAgentActions(first, { message: "Revise", actions: [{ type: "custom_report", pageId: "overview", source: { ...source, html: "<h2>Revised</h2>" } }] }, async () => []);
  assert.equal(second.report?.pages[0].custom?.previous?.length, 1);
  assert.equal(reportAIContext(second.report!).pages[0].custom?.previous, undefined);
  assert.doesNotMatch(JSON.stringify(reportAIContext(second.report!)), /value":1|SELECT/);
  await assert.rejects(executeAgentActions(before, { message: "Bad", actions: [
    { type: "appearance", patch: { theme: "light" } },
    { type: "custom_report", pageId: "missing", source },
  ] }, async () => []), /no longer exists/);
  assert.equal(before.appearance.theme, "dark");
});

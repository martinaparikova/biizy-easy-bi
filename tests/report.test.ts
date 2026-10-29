import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultReport, orderReportCharts, validateReport, reconcileReport } from "../lib/report";
import { DEFAULT_APPEARANCE, executeAgentActions } from "../lib/agent-executor";
import { resolveChartReferences } from "../lib/ai-provider";
import type { Chart } from "../lib/types";

const chart: Chart = { id: "uuid", title: "Sales", subtitle: "", kind: "bar", sql: "SELECT 'A' AS label, 1 AS value", data: [{ label: "A", value: 1 }], labelKey: "label", valueKey: "value", format: "number", width: "half" };

test("old workspaces migrate into one page; missing charts are reconciled", () => {
  const report = defaultReport([chart]);
  assert.deepEqual(report.pages[0].chartIds, ["uuid"]);
  assert.deepEqual(reconcileReport(report, []).pages[0].chartIds, []);
});

test("report reordering respects page membership and creation targets the active page", async () => {
  const second = { ...chart, id: "second" };
  const report = defaultReport([chart, second]);
  assert.deepEqual(orderReportCharts(report, ["second", "uuid"]).pages[0].chartIds, ["second", "uuid"]);
  const state = { charts: [chart], sources: [], relationships: [], appearance: DEFAULT_APPEARANCE, filters: [], dateRange: "all" as const, view: "dashboard" as const, title: "Demo", report: { activePageId: "new", pages: [...defaultReport([chart]).pages, { id: "new", title: "New", chartIds: [], blocks: [] }] } };
  const next = await executeAgentActions(state, { message: "Chart", actions: [{ type: "create_chart", title: "New chart", sql: chart.sql, kind: "bar", format: "number", width: "half" }] }, async () => chart.data);
  assert.equal(next.report?.pages[1].chartIds.length, 1);
  assert.deepEqual(next.report?.pages[0].chartIds, ["uuid"]);
});

test("report validates destinations, chart references, IDs and rejects executable content fields", () => {
  const report = defaultReport([chart]);
  assert.throws(() => validateReport({ ...report, activePageId: "missing" }, [chart]), /active page/);
  assert.throws(() => validateReport({ ...report, pages: [{ ...report.pages[0], blocks: [{ id: "button", kind: "button", text: "Open", targetPageId: "missing" }] }] }, [chart]), /destination/);
  assert.throws(() => validateReport({ ...report, pages: [{ ...report.pages[0], chartIds: ["missing"] }] }, [chart]), /missing/);
  assert.throws(() => validateReport({ ...report, script: "alert(1)" }, [chart]));
});

test("AI report changes apply atomically and short chart IDs are resolved in pages", async () => {
  const state = { charts: [chart], sources: [], relationships: [], appearance: DEFAULT_APPEARANCE, filters: [], dateRange: "all" as const, view: "dashboard" as const, title: "Demo", report: defaultReport([chart]) };
  const response = resolveChartReferences({ message: "Pages", actions: [{ type: "report", report: {
    activePageId: "products", pages: [
      { id: "overview", title: "Overview", chartIds: ["chart_1"], blocks: [{ id: "nav", kind: "button", text: "Products", targetPageId: "products" }] },
      { id: "products", title: "Products", chartIds: ["chart_1"], blocks: [{ id: "note", kind: "text", text: "Product performance", fontSize: 24 }] },
    ],
  } }] }, ["uuid"]);
  const next = await executeAgentActions(state, response, async () => []);
  assert.equal(next.report?.activePageId, "products");
  assert.equal(next.report?.pages[1].chartIds[0], "uuid");
  assert.equal(state.report.pages.length, 1);
  await assert.rejects(executeAgentActions(state, { message: "Bad", actions: [
    { type: "appearance", patch: { theme: "light" } },
    { type: "report", report: { ...state.report, activePageId: "missing" } },
  ] }, async () => []));
  assert.equal(state.appearance.theme, "dark");
});

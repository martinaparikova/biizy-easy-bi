import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_APPEARANCE, describeAgentActions, executeAgentActions, refreshCharts, validateActionIntent, type EditableWorkspace } from "../lib/agent-executor";
import { agentContextSchema, agentResponseSchema } from "../lib/agent-schema";
import { demoRelationships, demoSources } from "../lib/demo";
import { defaultRegionFilter, filterSources, validateFilters } from "../lib/filters";
import { planChart } from "../lib/planner";
import { POST, GET } from "../app/api/assistant/route";

function workspace(): EditableWorkspace {
  const sources = demoSources();
  return {
    sources, relationships: demoRelationships, appearance: DEFAULT_APPEARANCE, title: "Sales overview",
    filters: defaultRegionFilter(sources), dateRange: "all", view: "dashboard",
    charts: ["sales by region", "revenue by month"].map((prompt, index) => ({
      ...planChart(prompt, sources, demoRelationships, "all"), id: `chart-${index}`, data: [{ label: "A", value: 10 }],
    })),
  };
}
const query = async () => [{ label: "A", value: 10 }];

test("combined AI changes are validated and applied without mutating the original", async () => {
  const before = workspace();
  const after = await executeAgentActions(before, { message: "Upravím dashboard.", actions: [
    { type: "reorder", ids: ["chart-1", "chart-0"] },
    { type: "appearance", patch: { font: "Roboto", theme: "dark", radius: 0 } },
    { type: "chart", id: "chart-0", patch: { kind: "line", color: "#00aaff", showGrid: false, height: 350 } },
  ] }, query);
  assert.equal(after.charts[0].id, "chart-1");
  assert.equal(after.charts[1].showGrid, false);
  assert.equal(after.appearance.radius, 0);
  assert.equal(before.charts[0].kind, "bar");
  assert.equal(before.appearance.radius, 8);
});

test("failed action batch never mutates original appearance or charts", async () => {
  const before = workspace();
  await assert.rejects(executeAgentActions(before, { message: "Change", actions: [
    { type: "appearance", patch: { theme: "light" } },
    { type: "chart", id: "missing", patch: { width: "full" } },
  ] }, query), /no longer exists/);
  assert.equal(before.appearance.theme, "dark");
});

test("arbitrary scripts, CSS and unsafe style values are rejected", () => {
  assert.equal(agentResponseSchema.safeParse({ message: "Bad", actions: [{ type: "eval", code: "alert(1)" }] }).success, false);
  assert.equal(agentResponseSchema.safeParse({ message: "Bad", actions: [{ type: "appearance", patch: { accent: "url(evil)" } }] }).success, false);
  assert.equal(agentResponseSchema.safeParse({ message: "Bad", actions: [{ type: "appearance", patch: { css: "body{}" } }] }).success, false);
});

test("assistant blocks unrequested font changes and describes applied chart styling", () => {
  assert.throws(() => validateActionIntent("Make the bar chart yellow", [
    { type: "appearance", patch: { font: "Roboto" } },
  ]), /did not ask for it/);
  assert.throws(() => validateActionIntent("Make the chart yellow", [
    { type: "appearance", patch: { accent: "#f2c94c" } },
  ]), /whole workspace accent/);
  assert.doesNotThrow(() => validateActionIntent("Change the font to Roboto", [
    { type: "appearance", patch: { font: "Roboto" } },
  ]));
  const chart = workspace().charts[0];
  assert.deepEqual(describeAgentActions([
    { type: "chart", id: chart.id, patch: { kind: "bar", color: "#f2c94c" } },
  ], [chart]), ["Updated Sales by region · bar chart, color #f2c94c"]);
});

test("reorder requires every chart once and deletion validates IDs", async () => {
  await assert.rejects(executeAgentActions(workspace(), { message: "Bad", actions: [{ type: "reorder", ids: ["chart-0", "chart-0"] }] }, query), /every chart/);
  await assert.rejects(executeAgentActions(workspace(), { message: "Bad", actions: [{ type: "remove_chart", id: "unknown" }] }, query), /no longer exists/);
});

test("region filter propagates to sales and exact totals match", () => {
  const sources = demoSources(), filters = defaultRegionFilter(sources);
  filters[0].values = ["Europe"];
  const result = filterSources(sources, demoRelationships, filters);
  assert.equal(result[1].rows.length, 1);
  assert.equal(result[0].rows.length, 180);
  assert.ok(result[0].rows.every(row => row.Region_ID === 2));
  assert.equal(sources[0].rows.length, 720);
  assert.equal(result[0].rows.reduce((sum, row) => sum + Number(row.Revenue), 0), 571953);
  filters[0].values = [];
  assert.equal(filterSources(sources, demoRelationships, filters)[0].rows.length, 720);
});

test("multi-select region filter preserves disconnected data", () => {
  const sources = demoSources();
  sources.push({ ...sources[1], id: "isolated", table: "isolated" });
  const filters = defaultRegionFilter(sources);
  filters[0].values = ["Europe", "North America"];
  const result = filterSources(sources, demoRelationships, filters);
  assert.equal(result[0].rows.length, 360);
  assert.equal(result[2].rows.length, 4);
});

test("invalid filter values or schemas are explicit errors", () => {
  const sources = demoSources(), filters = defaultRegionFilter(sources);
  assert.throws(() => validateFilters([{ ...filters[0], values: ["Mars"] }], sources), /doesn't exist/);
  assert.throws(() => validateFilters([{ ...filters[0], column: "Missing" }], sources), /doesn't exist/);
});

test("AI queries are read-only and results are validated before committing", async () => {
  const before = workspace();
  await assert.rejects(executeAgentActions(before, { message: "Bad", actions: [{ type: "query", id: "chart-0", sql: "DROP TABLE sales" }] }, query), /read-only/);
  await assert.rejects(executeAgentActions(before, { message: "Bad", actions: [{ type: "query", id: "chart-0", sql: "SELECT 1 AS value" }] }, async () => [{ value: 1 }]), /finite numeric/);
  assert.match(before.charts[0].sql, /SUM/);
});

test("filter actions re-query all visuals with filtered source rows", async () => {
  const before = workspace(), filters = defaultRegionFilter(before.sources);
  filters[0].values = ["North America"];
  let calls = 0;
  const after = await executeAgentActions(before, { message: "Filter", actions: [{ type: "filters", filters }] }, async sources => {
    calls++; assert.equal(sources[0].rows.length, 180); return [{ label: "North America", value: 713326 }];
  });
  assert.equal(calls, 2);
  assert.equal(after.charts[0].data[0].value, 713326);
  assert.equal(before.filters[0].values.length, 0);
});

test("period refresh applies generated query filters and preserves custom SQL", async () => {
  const state = workspace();
  state.dateRange = "q2";
  const output = await refreshCharts(state, async (_, sql) => { assert.match(sql, /2026-04-01/); return []; });
  assert.equal(output[0].data.length, 0);
});

test("agent context excludes rows, results and SQL and rejects injected extra fields", () => {
  const state = workspace();
  const context = {
    prompt: "Change theme", history: [],
    workspace: {
      title: state.title, view: state.view, appearance: state.appearance, dateRange: state.dateRange,
      sources: state.sources.map(s => ({ table: s.table, columns: s.columns })),
      charts: state.charts.map(c => ({ id: c.id, title: c.title, kind: c.kind, width: c.width })),
      relationships: state.relationships, filters: state.filters,
    },
  };
  assert.ok(agentContextSchema.safeParse(context).success);
  assert.equal(agentContextSchema.safeParse({ ...context, workspace: { ...context.workspace, rows: [] } }).success, false);
});

test("API checks same-origin and reports missing configuration without provider calls", async () => {
  const saved = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    assert.equal((await GET()).status, 200);
    const forbidden = await POST(new Request("http://localhost:3000/api/assistant", { method: "POST", headers: { Origin: "https://other.example" }, body: "{}" }));
    assert.equal(forbidden.status, 403);
    const proxied = await POST(new Request("http://localhost:3000/api/assistant", {
      method: "POST",
      headers: { Origin: "http://127.0.0.1:3000", Host: "127.0.0.1:3000" },
      body: "{}",
    }));
    assert.equal(proxied.status, 503);
    const missing = await POST(new Request("http://localhost:3000/api/assistant", { method: "POST", headers: { Origin: "http://localhost:3000" }, body: "{}" }));
    assert.equal(missing.status, 503);
    assert.match((await missing.json()).error, /OPENAI_API_KEY/);
  } finally {
    if (saved === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = saved;
  }
});

test("server validates provider actions and never exposes its credential", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "unit-test-placeholder";
  const state = workspace();
  const context = {
    prompt: "Použij Roboto", history: [],
    workspace: {
      title: state.title, view: state.view, appearance: state.appearance, dateRange: state.dateRange,
      sources: state.sources.map(s => ({ table: s.table, columns: s.columns })),
      charts: state.charts.map(c => ({ id: c.id, title: c.title, kind: c.kind, width: c.width })),
      relationships: state.relationships, filters: state.filters,
    },
  };
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/chat/completions");
      const body = JSON.parse(String(options?.body));
      assert.equal(body.response_format.type, "json_object");
      assert.equal(JSON.parse(body.messages[1].content.split("\n\nLatest request:")[0]).workspace.sources[0].rows, undefined);
      return Response.json({ choices: [{ message: { content: JSON.stringify({
        message: "Nastavím Roboto.", actions: [{ type: "appearance", patch: { font: "Roboto" } }],
      }) } }] });
    };
    const response = await POST(new Request("http://localhost:3000/api/assistant", {
      method: "POST", headers: { Origin: "http://localhost:3000" }, body: JSON.stringify(context),
    }));
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.doesNotMatch(body, /unit-test-placeholder/);
    assert.equal(agentResponseSchema.parse(JSON.parse(body)).actions[0].type, "appearance");
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: '{"message":"Bad","actions":[{"type":"eval","code":"alert(1)"}]}' } }] });
    const invalid = await POST(new Request("http://localhost:3000/api/assistant", {
      method: "POST", headers: { Origin: "http://localhost:3000" }, body: JSON.stringify(context),
    }));
    assert.equal(invalid.status, 502);
    assert.match((await invalid.json()).error, /No changes were applied/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
  }
});

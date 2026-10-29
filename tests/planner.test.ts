import { test } from "node:test";
import assert from "node:assert/strict";
import { demoRelationships, demoSources } from "../lib/demo";
import { applyPeriod, planChart, validateChartResult } from "../lib/planner";
import { proposeRelationships, quoteIdentifier, validateModel } from "../lib/model";
import { sourceFromRows } from "../lib/import";
import { isReadOnlyQuery } from "../lib/engine";

test("demo contains real sales rows with shared region keys", () => {
  const [sales, regions] = demoSources();
  assert.equal(sales.rows.length, 720);
  assert.equal(regions.rows.length, 4);
  assert.ok(sales.rows.every(row => regions.rows.some(region => region.Region_ID === row.Region_ID)));
});

test("sales by region uses the semantic model, not hardcoded join keys", () => {
  const spec = planChart("Show sales by region", demoSources(), demoRelationships, "all");
  assert.match(spec.sql, /LEFT JOIN "regions" d ON t."Region_ID" = d."Region_ID"/);
  assert.match(spec.sql, /SUM\(t."Revenue"\)/);
  assert.equal(spec.title, "Sales by region");
  assert.throws(() => planChart("sales by region", demoSources(), [], "all"), /connected "region"/);
});

test("trends and date filters generate valid scoped SQL", () => {
  const spec = planChart("revenue trend by month", demoSources(), demoRelationships, "q1");
  assert.equal(spec.kind, "line");
  assert.match(spec.sql, /2026-01-01/);
  assert.match(spec.sql, /2026-03-31/);
  assert.doesNotMatch(spec.sql, /\{\{period\}\}/);
  assert.match(applyPeriod(spec.templateSql!, spec.dateColumn, "q2"), /2026-04-01/);
  assert.doesNotMatch(applyPeriod(spec.templateSql!, undefined, "q2"), /BETWEEN/);
});

test("explicit metrics and donut charts override defaults", () => {
  const spec = planChart("profit by category as donut", demoSources(), demoRelationships, "all");
  assert.match(spec.sql, /SUM\(t."Profit"\)/);
  assert.equal(spec.format, "currency");
  assert.equal(spec.kind, "donut");
});

test("source-qualified questions query uploaded data, not a similarly named demo metric", () => {
  const file = sourceFromRows("orders.csv", [["Category", "Revenue"], ["A", 100]], "csv", []);
  const spec = planChart("revenue by category from orders", [...demoSources(), file], [], "all");
  assert.match(spec.sql, /FROM "orders" t/);
  assert.throws(() => planChart("revenue by category from missing", demoSources(), [], "all"), /couldn't find the table/);
  assert.throws(() => planChart("expenses by category", demoSources(), [], "all"), /Name a numeric measure/);
  assert.match(spec.sql, /CAST\(SUM\(t."Revenue"\) AS DOUBLE\)/);
});

test("averages and counts are planned without silently substituting measures", () => {
  const sources = demoSources();
  assert.match(planChart("average revenue by category", sources, [], "all").sql, /AVG\(t."Revenue"\)/);
  assert.match(planChart("orders by category", sources, [], "all").sql, /COUNT\(\*\)/);
});

test("ambiguous joins with duplicate lookup keys are rejected", () => {
  const sources = demoSources();
  sources[1].rows.push({ ...sources[1].rows[0] });
  assert.throws(() => planChart("sales by region", sources, demoRelationships, "all"), /double-count/);
});

test("model validates types, duplicate links and real columns", () => {
  const sources = demoSources();
  assert.deepEqual(proposeRelationships(sources).map(r => r.fromColumn), ["Region_ID"]);
  assert.equal(validateModel({ relationships: demoRelationships }, sources).relationships.length, 1);
  assert.throws(() => validateModel({ relationships: [...demoRelationships, ...demoRelationships] }, sources), /already exists/);
  assert.throws(() => validateModel({ relationships: [{ ...demoRelationships[0], toColumn: "Region" }] }, sources), /data types/);
  assert.throws(() => validateModel({ relationships: [{ ...demoRelationships[0], toColumn: "missing" }] }, sources), /no longer exists/);
  assert.throws(() => validateModel({ no: [] }, sources), /relationships/);
});

test("file schema inference handles unique names, nulls and safe identifiers", () => {
  const source = sourceFromRows("test.csv", [["Category", "Revenue"], ["A", 12], ["B", null]], "csv", []);
  assert.equal(source.columns[1].type, "number");
  assert.equal(planChart("revenue by category", [source], [], "all").title, "Revenue by category");
  assert.equal(sourceFromRows("test.csv", [["Category"], ["A"]], "csv", [source]).table, "test_2");
  assert.throws(() => sourceFromRows("bad.csv", [["A", "a"], [1, 2]], "csv", []), /unique header/);
  assert.throws(() => sourceFromRows("bad.csv", [["A"]], "csv", []), /data row/);
  assert.equal(quoteIdentifier('some"column'), '"some""column"');
});

test("chart results require populated label and numeric value columns", () => {
  validateChartResult([{ label: "North", value: 12 }], "label", "value");
  assert.throws(() => validateChartResult([], "label", "value"), /no rows/);
  assert.throws(() => validateChartResult([{ label: "North", value: "12" }], "label", "value"), /finite numeric/);
  assert.throws(() => validateChartResult([{ value: 12 }], "label", "value"), /finite numeric/);
});

test("developer queries are limited to one read-only statement", () => {
  assert.ok(isReadOnlyQuery("SELECT label, value FROM sales;"));
  assert.ok(isReadOnlyQuery("WITH x AS (SELECT 1 AS value) SELECT * FROM x"));
  assert.equal(isReadOnlyQuery("DROP TABLE sales"), false);
  assert.equal(isReadOnlyQuery("SELECT 1; DELETE FROM sales"), false);
  assert.equal(isReadOnlyQuery("SELECT * FROM read_csv('https://example.com/data')"), false);
});

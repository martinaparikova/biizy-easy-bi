import { test } from "node:test";
import assert from "node:assert/strict";
import { chartVerificationSql, compareChartResults } from "../lib/sql-tools";

test("chart verification wraps the chart query and quotes result column names", () => {
  const query = chartVerificationSql('SELECT "Region name" AS category, 12.5 AS amount FROM sales;', "category", "amount");
  assert.match(query, /^WITH chart_check AS \(/);
  assert.match(query, /SELECT "category" AS label, CAST\("amount" AS DOUBLE\) AS value/);
  assert.match(query, /FROM chart_check\nORDER BY 1$/);
});

test("chart verification compares labels and numeric values independent of row order", () => {
  const result = compareChartResults(
    [{ label: "North", value: 100 }, { label: "South", value: 200 }],
    [{ label: "South", value: 200.00000001 }, { label: "North", value: 100 }],
  );
  assert.deepEqual(result, { matches: true, differences: [] });
});

test("chart verification reports changed, missing, and extra values", () => {
  const result = compareChartResults(
    [{ label: "North", value: 100 }, { label: "South", value: 200 }],
    [{ label: "North", value: 101 }, { label: "West", value: 50 }],
  );
  assert.equal(result.matches, false);
  assert.deepEqual(result.differences, [
    "North: chart 100, query 101",
    "South: chart 200, query missing",
    "West: unexpected query value 50",
  ]);
});

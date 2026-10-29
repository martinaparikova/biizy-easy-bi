import type { Row } from "./types";
import { quoteIdentifier } from "./model";

export function chartVerificationSql(sql: string, labelKey: string, valueKey: string) {
  const query = sql.trim().replace(/;\s*$/, "");
  return `WITH chart_check AS (\n${query}\n)\nSELECT ${quoteIdentifier(labelKey)} AS label, CAST(${quoteIdentifier(valueKey)} AS DOUBLE) AS value\nFROM chart_check\nORDER BY 1`;
}

export function compareChartResults(expectedRows: Row[], actual: Row[]) {
  const remaining = new Map<string, number[]>();
  for (const row of actual) {
    const key = String(row.label ?? "");
    const values = remaining.get(key) ?? [];
    values.push(Number(row.value));
    remaining.set(key, values);
  }
  const differences: string[] = [];
  for (const row of expectedRows) {
    const label = String(row.label ?? "");
    const expectedValue = Number(row.value);
    const values = remaining.get(label);
    const index = values?.findIndex(value =>
      Number.isFinite(expectedValue) && Number.isFinite(value) &&
      Math.abs(expectedValue - value) <= Math.max(0.01, Math.abs(expectedValue) * 1e-9),
    ) ?? -1;
    if (index < 0) {
      differences.push(`${label}: chart ${Number.isFinite(expectedValue) ? expectedValue : "invalid"}, query ${values?.[0] ?? "missing"}`);
      if (values?.length) {
        values.shift();
        if (!values.length) remaining.delete(label);
      }
    } else {
      values!.splice(index, 1);
      if (!values!.length) remaining.delete(label);
    }
  }
  for (const [label, values] of remaining) {
    for (const value of values) differences.push(`${label}: unexpected query value ${value}`);
  }
  return { matches: differences.length === 0, differences };
}

import type { Chart, ChartKind, DateRange, Relationship, Source, Row } from "./types";
import { quoteIdentifier as q } from "./model";

export function applyPeriod(template: string, dateColumn: string | undefined, range: DateRange) {
  const filter = range === "all" || !dateColumn ? "" :
    `AND TRY_CAST(t.${q(dateColumn)} AS DATE) BETWEEN '${range === "q1" ? "2026-01-01" : "2026-04-01"}' AND '${range === "q1" ? "2026-03-31" : "2026-06-30"}'`;
  return template.replace("{{period}}", filter);
}

const humanize = (value: string) => value.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

export function planChart(prompt: string, sources: Source[], relationships: Relationship[], range: DateRange): Omit<Chart, "data"> {
  if (!sources.length) throw new Error("Connect a data source first, then ask me to create a chart.");
  const sourceName = /\bfrom\s+([a-z0-9_]+)\s*$/i.exec(prompt)?.[1]?.toLowerCase();
  const scopedSources = sourceName ? sources.filter(s => s.table.toLowerCase() === sourceName) : sources;
  if (!scopedSources.length) throw new Error(`I couldn't find the table "${sourceName}". Use the table name shown in the semantic model.`);
  const lower = prompt.toLowerCase().replace(/\bfrom\s+([a-z0-9_]+)\s*$/, "").trim();
  const numeric = scopedSources.flatMap(source => source.columns.filter(c => c.type === "number" && !/id$|key$/i.test(c.name)).map(column => ({ source, column })));
  const explicit = numeric.find(({ column }) => lower.includes(humanize(column.name)));
  const metric = explicit ?? (/\bsales\b/.test(lower) ? numeric.find(({ column }) => /revenue|sales|amount/i.test(column.name)) : undefined);
  const count = /\b(orders|count|number of|customers)\b/.test(lower) && !/\b(sales|revenue|profit)\b/.test(lower);
  const source = metric?.source ?? scopedSources[0];
  if (!metric && !count) throw new Error(`Name a numeric measure from your data. Available measures: ${numeric.map(item => item.column.name).join(", ") || "none"}. You can also try 'count rows by category'.`);
  const measureName = count ? /\bcustomers\b/.test(lower) ? "Customers" : /\borders\b/.test(lower) ? "Orders" : "Rows" : /sales/i.test(lower) && /revenue/i.test(metric!.column.name) ? "Sales" : metric!.column.name;
  const aggregate = /\b(average|avg)\b/.test(lower) ? "AVG" : "SUM";
  const measure = count ? (/\bcustomers\b/.test(lower) && source.columns.some(c => c.name === "Customer_ID") ? `COUNT(DISTINCT t."Customer_ID")` : "COUNT(*)") : `${aggregate}(t.${q(metric!.column.name)})`;
  const dateColumn = source.columns.find(c => /date|timestamp/i.test(c.name))?.name;
  const trend = /\b(trend|month|monthly|over time)\b/.test(lower);
  let dimension: string, titleDimension: string, join = "";

  if (trend) {
    if (!dateColumn) throw new Error(`I couldn't find a date column in ${source.name}. Add a Date or Order_Date column to chart a trend.`);
    dimension = `strftime(TRY_CAST(t.${q(dateColumn)} AS DATE), '%Y-%m')`;
    titleDimension = "month";
  } else {
    const match = /\bby\s+(.+?)(?:\s+as\b|\s+chart\b|$)/.exec(lower)?.[1]?.trim();
    const desired = match?.replace(/\b(bar|line|pie|donut)\b/g, "").trim() || (lower.includes("region") ? "region" : "category");
    const local = source.columns.find(c => c.type === "text" && humanize(c.name) === desired) ??
      source.columns.find(c => c.type === "text" && humanize(c.name).includes(desired));
    if (local) {
      dimension = `t.${q(local.name)}`;
      titleDimension = humanize(local.name);
    } else {
      let found: { source: Source; name: string; from: string; to: string } | undefined;
      for (const r of relationships) {
        const forward = r.fromTable === source.table;
        if (!forward && r.toTable !== source.table) continue;
        const related = sources.find(s => s.table === (forward ? r.toTable : r.fromTable));
        const col = related?.columns.find(c => c.type === "text" && humanize(c.name).includes(desired));
        if (related && col) {
          found = { source: related, name: col.name, from: forward ? r.fromColumn : r.toColumn, to: forward ? r.toColumn : r.fromColumn };
          break;
        }
      }
      if (!found) {
        const options = source.columns.filter(c => c.type === "text" && !/id$|date/i.test(c.name)).map(c => humanize(c.name));
        throw new Error(`I couldn't find a connected "${desired}" column. Check the model, or try ${options.length ? `'${measureName.toLowerCase()} by ${options[0]}'` : "connecting a lookup table"}.`);
      }
      if (new Set(found.source.rows.map(row => row[found.to])).size !== found.source.rows.length) {
        throw new Error(`The ${found.source.table}.${found.to} key isn't unique. Joining it could double-count sales. Choose a unique lookup key in the model.`);
      }
      join = `LEFT JOIN ${q(found.source.table)} d ON t.${q(found.from)} = d.${q(found.to)}`;
      dimension = `d.${q(found.name)}`;
      titleDimension = humanize(found.name);
    }
  }
  const templateSql = `SELECT COALESCE(CAST(${dimension} AS VARCHAR), 'Unknown') AS label,\n       CAST(${measure} AS DOUBLE) AS value\nFROM ${q(source.table)} t\n${join}\nWHERE 1=1 {{period}}\nGROUP BY 1\nORDER BY ${trend ? "1 ASC" : "2 DESC"}\nLIMIT 50`;
  const kind: ChartKind = /\b(pie|donut)\b/.test(lower) ? "donut" : trend || /\bline\b/.test(lower) ? "line" : "bar";
  return {
    id: crypto.randomUUID(), title: `${aggregate === "AVG" && !count ? "Average " : ""}${measureName.replaceAll("_", " ")} by ${titleDimension}`,
    subtitle: `${source.name} · ${count ? "Count" : aggregate === "AVG" ? "Average" : "Sum"}${range !== "all" && !dateColumn ? " · no date column" : ""}`,
    kind, templateSql, dateColumn, prompt, sql: applyPeriod(templateSql, dateColumn, range),
    labelKey: "label", valueKey: "value", format: !count && /revenue|sales|profit|amount|price/i.test(metric!.column.name) ? "currency" : "number",
    width: "half",
  };
}

export function validateChartResult(rows: Row[], labelKey: string, valueKey: string) {
  if (!rows.length) throw new Error("This query returned no rows. Check your date range or query filters.");
  if (!rows.every(row => Object.hasOwn(row, labelKey) && typeof row[valueKey] === "number" && Number.isFinite(row[valueKey]))) {
    throw new Error(`Return a "${labelKey}" column and a finite numeric "${valueKey}" column to draw this chart.`);
  }
}

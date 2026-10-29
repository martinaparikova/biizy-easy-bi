import type { DashboardFilter, Relationship, Source } from "./types";

export function validateFilters(filters: DashboardFilter[], sources: Source[]) {
  if (new Set(filters.map(f => f.id)).size !== filters.length) throw new Error("Filter IDs must be unique.");
  for (const filter of filters) {
    const source = sources.find(s => s.table === filter.table);
    if (!source?.columns.some(c => c.name === filter.column)) throw new Error(`Filter column ${filter.table}.${filter.column} doesn't exist.`);
    if (filter.values.some(v => !source.rows.some(row => String(row[filter.column] ?? "") === v))) {
      throw new Error(`One of the selected values doesn't exist in ${filter.table}.${filter.column}.`);
    }
  }
}

export function filterSources(sources: Source[], relationships: Relationship[], filters: DashboardFilter[]): Source[] {
  validateFilters(filters, sources);
  let result = sources;
  for (const filter of filters.filter(f => f.values.length)) {
    const root = result.find(s => s.table === filter.table)!;
    const restricted = new Map<string, Source>();
    restricted.set(root.table, { ...root, rows: root.rows.filter(row => filter.values.includes(String(row[filter.column] ?? ""))) });
    const queue = [root.table];
    while (queue.length) {
      const table = queue.shift()!;
      for (const r of relationships) {
        const forward = r.fromTable === table;
        if (!forward && r.toTable !== table) continue;
        const targetTable = forward ? r.toTable : r.fromTable;
        if (restricted.has(targetTable)) continue;
        const target = result.find(s => s.table === targetTable);
        if (!target) throw new Error(`The filter relationship references missing table ${targetTable}.`);
        const currentKey = forward ? r.fromColumn : r.toColumn, targetKey = forward ? r.toColumn : r.fromColumn;
        const keys = new Set(restricted.get(table)!.rows.map(row => row[currentKey]).filter(v => v !== null));
        restricted.set(targetTable, { ...target, rows: target.rows.filter(row => row[targetKey] !== null && keys.has(row[targetKey])) });
        queue.push(targetTable);
      }
    }
    result = result.map(s => restricted.get(s.table) ?? s);
  }
  return result;
}

export function defaultRegionFilter(sources: Source[]): DashboardFilter[] {
  const source = sources.find(s => s.columns.some(c => /^region$/i.test(c.name)));
  const column = source?.columns.find(c => /^region$/i.test(c.name));
  return source && column ? [{ id: "region-filter", label: "Region", table: source.table, column: column.name, values: [] }] : [];
}

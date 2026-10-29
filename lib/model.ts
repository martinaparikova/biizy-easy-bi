import type { Relationship, Source, SemanticModel } from "./types";

export function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function proposeRelationships(sources: Source[]): Relationship[] {
  const proposals: Relationship[] = [];
  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      for (const column of sources[i].columns) {
        const matching = sources[j].columns.find(c => c.name.toLowerCase() === column.name.toLowerCase() && c.type === column.type);
        if (matching && /(^id$|_id$|id$|key$)/i.test(column.name)) {
          proposals.push({
            id: `${sources[i].table}-${column.name}-${sources[j].table}`,
            fromTable: sources[i].table, fromColumn: column.name,
            toTable: sources[j].table, toColumn: matching.name,
          });
        }
      }
    }
  }
  return proposals;
}

export function validateModel(input: unknown, sources: Source[]): SemanticModel {
  if (!input || typeof input !== "object" || !("relationships" in input) || !Array.isArray(input.relationships)) {
    throw new Error('The model must contain a "relationships" array.');
  }
  const relationships: Relationship[] = [];
  for (const value of input.relationships) {
    if (!value || typeof value !== "object") throw new Error("Each relationship must be an object.");
    const r = value as Record<string, unknown>;
    if (![r.fromTable, r.fromColumn, r.toTable, r.toColumn].every(v => typeof v === "string")) {
      throw new Error("Each relationship needs fromTable, fromColumn, toTable and toColumn.");
    }
    const fromTable = String(r.fromTable), toTable = String(r.toTable);
    const fromColumn = String(r.fromColumn), toColumn = String(r.toColumn);
    if (fromTable === toTable) throw new Error("Connect columns from two different tables.");
    const from = sources.find(s => s.table === fromTable)?.columns.find(c => c.name === fromColumn);
    const to = sources.find(s => s.table === toTable)?.columns.find(c => c.name === toColumn);
    if (!from || !to) throw new Error("A table or column no longer exists. Check the source schemas.");
    if (from.type !== to.type) throw new Error("The connected columns must have matching data types.");
    const duplicate = relationships.some(existing =>
      (existing.fromTable === fromTable && existing.fromColumn === fromColumn && existing.toTable === toTable && existing.toColumn === toColumn) ||
      (existing.fromTable === toTable && existing.fromColumn === toColumn && existing.toTable === fromTable && existing.toColumn === fromColumn));
    if (duplicate) throw new Error("This relationship already exists.");
    relationships.push({ id: typeof r.id === "string" ? r.id : crypto.randomUUID(), fromTable, fromColumn, toTable, toColumn });
  }
  if (new Set(relationships.map(r => r.id)).size !== relationships.length) throw new Error("Relationship IDs must be unique.");
  return { relationships };
}

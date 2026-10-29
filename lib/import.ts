import Papa from "papaparse";
import type { Cell, Row, Source } from "./types";

export const MAX_FILE_SIZE = 5 * 1024 * 1024;
export const MAX_ROWS = 20000;

function normalize(value: unknown): Cell {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  throw new Error("This file contains an unsupported cell value.");
}

export function sourceFromRows(name: string, matrix: unknown[][], kind: "csv" | "excel", existing: Source[]): Source {
  if (matrix.length < 2) throw new Error("Add a header row and at least one data row to your file.");
  const headers = matrix[0].map(v => String(v ?? "").trim());
  if (headers.some(h => !h) || new Set(headers.map(h => h.toLowerCase())).size !== headers.length) {
    throw new Error("Every column needs a non-empty, unique header.");
  }
  const dataRows = matrix.slice(1).filter(row => row.some(value => value !== null && value !== undefined && value !== ""));
  if (dataRows.length === 0) throw new Error("This file has headers but no data rows.");
  if (dataRows.length > MAX_ROWS) throw new Error(`This MVP supports up to ${MAX_ROWS.toLocaleString()} rows per file.`);
  const rows: Row[] = dataRows.map((row, index) => {
    if (row.length > headers.length) throw new Error(`Row ${index + 2} has more cells than the header row.`);
    return Object.fromEntries(headers.map((header, i) => [header, normalize(row[i])]));
  });
  const base = name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^(\d)/, "_$1").slice(0, 50) || "uploaded_data";
  let table = base, suffix = 2;
  while (existing.some(s => s.table === table)) table = `${base}_${suffix++}`;
  return {
    id: crypto.randomUUID(), name, table, kind, rows,
    description: `${kind === "excel" ? "Excel" : "CSV"} upload · local browser data`,
    columns: headers.map(header => {
      const values = rows.map(row => row[header]).filter(v => v !== null);
      const type = values.length && values.every(v => typeof v === "number") ? "number" :
        values.length && values.every(v => typeof v === "boolean") ? "boolean" : "text";
      return { name: header, type };
    }),
  };
}

export async function importFile(file: File, existing: Source[]) {
  if (file.size > MAX_FILE_SIZE) throw new Error("This MVP supports files up to 5 MB. Upload a smaller sample.");
  if (/\.csv$/i.test(file.name)) {
    const parsed = Papa.parse<unknown[]>(await file.text(), { dynamicTyping: true, skipEmptyLines: "greedy" });
    if (parsed.errors.length) throw new Error(`CSV could not be read: ${parsed.errors[0].message}`);
    return sourceFromRows(file.name, parsed.data, "csv", existing);
  }
  if (/\.xlsx$/i.test(file.name)) {
    const { default: readXlsxFile } = await import("read-excel-file");
    return sourceFromRows(file.name, await readXlsxFile(file), "excel", existing);
  }
  throw new Error("Choose a .csv or .xlsx file. Older .xls files must be saved as .xlsx first.");
}

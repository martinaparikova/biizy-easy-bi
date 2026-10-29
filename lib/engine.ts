import type { AsyncDuckDB } from "@duckdb/duckdb-wasm";
import type { Row, Source, Cell } from "./types";
import { quoteIdentifier } from "./model";

let enginePromise: Promise<AsyncDuckDB> | undefined;
let serial: Promise<unknown> = Promise.resolve();
const loaded = new Map<string, Source>();

async function getEngine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      const duckdb = await import("@duckdb/duckdb-wasm");
      const bundle = await duckdb.selectBundle({
        mvp: { mainModule: "/duckdb/duckdb-mvp.wasm", mainWorker: "/duckdb/duckdb-browser-mvp.worker.js" },
        eh: { mainModule: "/duckdb/duckdb-eh.wasm", mainWorker: "/duckdb/duckdb-browser-eh.worker.js" },
      });
      if (!bundle.mainWorker) throw new Error("This browser doesn't support the DuckDB worker. Try a current Chrome, Edge or Firefox browser.");
      const worker = new Worker(bundle.mainWorker);
      const database = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          (async () => {
            await database.instantiate(bundle.mainModule);
            await database.open({ query: { castBigIntToDouble: true, castDecimalToDouble: true } });
          })(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("The local data engine took too long to start. Check your connection to this app and refresh to retry.")), 45000);
          }),
        ]);
        return database;
      } catch (error) {
        worker.terminate();
        throw error;
      } finally {
        if (timer) clearTimeout(timer);
      }
    })().catch(error => {
      enginePromise = undefined;
      throw error;
    });
  }
  return enginePromise;
}

export function isReadOnlyQuery(sql: string) {
  const trimmed = sql.trim();
  return /^(select|with)\b/i.test(trimmed) &&
    !/;/.test(trimmed.replace(/;\s*$/, "")) &&
    !/\b(insert|update|delete|drop|create|alter|copy|attach|detach|install|load|pragma|call|export|import)\b/i.test(trimmed) &&
    !/\b(read_[a-z_]+|httpfs|sqlite_scan|postgres_scan|glob|range|generate_series|query|query_table|parquet_scan|csv_scan|json_scan|duckdb_[a-z_]+)\s*\(/i.test(trimmed) &&
    !/\b(with\s+recursive|cross\s+join)\b/i.test(trimmed);
}

function cell(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") return value;
  return String(value);
}

export function querySources(sources: Source[], sql: string): Promise<Row[]> {
  const operation = serial.then(async () => {
    if (!isReadOnlyQuery(sql)) throw new Error("Use a single SELECT or WITH query. Changes to tables and external file access are not allowed.");
    const database = await getEngine();
    const connection = await database.connect();
    try {
      for (const table of loaded.keys()) {
        if (!sources.some(s => s.table === table)) {
          await connection.query(`DROP TABLE IF EXISTS ${quoteIdentifier(table)}`);
          loaded.delete(table);
        }
      }
      for (const source of sources) {
        if (loaded.get(source.table) === source) continue;
        if (!source.rows.length) {
          const schema = source.columns.map(c => `${quoteIdentifier(c.name)} ${c.type === "number" ? "DOUBLE" : c.type === "boolean" ? "BOOLEAN" : "VARCHAR"}`).join(", ");
          await connection.query(`CREATE OR REPLACE TABLE ${quoteIdentifier(source.table)} (${schema})`);
          loaded.set(source.table, source);
          continue;
        }
        const filename = `${source.table}.json`;
        await database.registerFileText(filename, JSON.stringify(source.rows));
        try {
          await connection.query(`CREATE OR REPLACE TABLE ${quoteIdentifier(source.table)} AS SELECT * FROM read_json_auto('${filename.replaceAll("'", "''")}', maximum_object_size=16777216)`);
          loaded.set(source.table, source);
        } finally {
          await database.dropFile(filename);
        }
      }
      const result = await connection.query(`SELECT * FROM (${sql.trim().replace(/;\s*$/, "")}) AS lens_result LIMIT 5000`);
      return result.toArray().map(row => {
        const data: Row = {};
        for (const field of result.schema.fields) data[field.name] = cell(row[field.name]);
        return data;
      });
    } finally {
      await connection.close();
    }
  });
  serial = operation.catch(() => undefined);
  return operation;
}

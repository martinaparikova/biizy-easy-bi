"use client";

import { useState } from "react";
import { Bot, LoaderCircle, Play, Plus, Sparkles, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { agentResponseSchema } from "@/lib/agent-schema";
import { filterSources } from "@/lib/filters";
import { querySources } from "@/lib/engine";
import { quoteIdentifier } from "@/lib/model";
import { errorText, useWorkspace } from "@/lib/store";
import { validateChartResult } from "@/lib/planner";
import type { ChartKind, Row } from "@/lib/types";
import { reportAIContext } from "@/lib/report";

function initialQuery(table?: string) {
  return table ? `SELECT *\nFROM ${quoteIdentifier(table)}\nLIMIT 100` : "";
}

export function QueryExplorer({ open, onOpenChange, sourceTable }: { open: boolean; onOpenChange: (open: boolean) => void; sourceTable?: string }) {
  const { sources, filters, relationships, charts, title, view, appearance, dateRange, aiStatus, aiConsent, aiProvider, aiModel, addSqlChart, report } = useWorkspace();
  const [sql, setSql] = useState(() => initialQuery(sourceTable ?? sources[0]?.table));
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [aiError, setAiError] = useState("");
  const [running, setRunning] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [chartTitle, setChartTitle] = useState("SQL result");
  const [question, setQuestion] = useState("");
  const [chartKind, setChartKind] = useState<ChartKind>("bar");
  const [format, setFormat] = useState<"currency" | "number">("number");

  async function run() {
    setRunning(true);
    setError("");
    try {
      setRows(await querySources(filterSources(sources, relationships, filters), sql));
    } catch (e) {
      setRows(null);
      setError(errorText(e));
    } finally {
      setRunning(false);
    }
  }

  async function generate() {
    setAiError("");
    if (!aiConsent) {
      setAiError("Enable AI context access in the assistant before asking it to draft a query.");
      return;
    }
    if (aiStatus !== "configured") {
      setAiError(aiProvider === "ollama" ?
        `Start Ollama and make sure ${aiModel || "the local model"} is installed, then refresh Biizy.` :
        "Configure the AI provider, then refresh Biizy.");
      return;
    }
    setGenerating(true);
    try {
      if (!question.trim()) throw new Error("Describe what you want to calculate before asking AI to draft SQL.");
      const prompt = `Draft exactly one chart query for this request: ${question.trim()}.
Use chart type ${chartKind}. Return exactly one create_chart action with read-only DuckDB SQL. The query must return exactly the chart columns label and value: alias the text grouping column as label and the numeric measure as value (AS value, not numeric_value). Use only tables and columns from the workspace schema. This is a draft only; do not claim it has been run.`;
      const context = {
        prompt, history: [],
        workspace: {
          title, view, appearance, dateRange,
          report: report ? reportAIContext(report) : undefined,
          sources: sources.map(source => ({ table: source.table, columns: source.columns })),
          charts: charts.map(chart => ({
            id: chart.id, title: chart.title, kind: chart.kind, width: chart.width,
            color: chart.color, palette: chart.palette, showGrid: chart.showGrid, showLegend: chart.showLegend,
            height: chart.height, radius: chart.radius,
          })),
          relationships, filters,
        },
      };
      const response = await fetch("/api/assistant", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(context),
        signal: AbortSignal.timeout(aiProvider === "ollama" ? 245000 : aiProvider === "claude-code" ? 185000 : 70000),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        throw new Error(body && typeof body === "object" && "error" in body && typeof body.error === "string" ?
          body.error : `Assistant returned HTTP ${response.status}.`);
      }
      const result = agentResponseSchema.parse(body);
      const [action] = result.actions;
      if (result.actions.length !== 1 || action.type !== "create_chart") {
        throw new Error("The AI couldn't draft a chart query for this request. Try naming a measure and a grouping column.");
      }
      setSql(action.sql);
      setChartTitle(action.title);
      setChartKind(action.kind);
      setFormat(action.format);
      setQuestion("");
      setRows(null);
    } catch (e) {
      setAiError(errorText(e));
    } finally {
      setGenerating(false);
    }
  }

  const chartReady = rows?.length && rows.every(row => Object.hasOwn(row, "label") && typeof row.value === "number" && Number.isFinite(row.value));

  async function addChart() {
    if (!rows?.length) return;
    try {
      validateChartResult(rows, "label", "value");
      await addSqlChart({ title: chartTitle.trim() || "SQL result", sql, kind: chartKind, format });
      onOpenChange(false);
    } catch (e) {
      setError(errorText(e));
    }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sql-explorer-dialog">
      <DialogHeader>
        <DialogTitle>Explore data with SQL</DialogTitle>
        <DialogDescription>Run a read-only DuckDB query against the data connected in this workspace. Queries return up to 5,000 rows.</DialogDescription>
      </DialogHeader>
      <div className="sql-explorer-toolbar">
        <label>Table
          <select aria-label="SQL source table" value={sources.some(source => source.table === extractTable(sql)) ? extractTable(sql) : sources[0]?.table ?? ""} onChange={e => setSql(initialQuery(e.target.value))}>
            {sources.map(source => <option key={source.id} value={source.table}>{source.table}</option>)}
          </select>
        </label>
        <Button variant="outline" onClick={() => void generate()} disabled={generating || running || !sources.length || !question.trim()}>
          {generating ? <LoaderCircle className="spin" /> : <Sparkles />} Draft with AI
        </Button>
      </div>
      <label className="sql-editor-label" htmlFor="sql-explorer-ai-prompt">What should this query answer?</label>
      <div className="sql-ai-prompt"><input id="sql-explorer-ai-prompt" aria-label="Describe an AI SQL query" value={question} onChange={e => setQuestion(e.target.value)} placeholder="For example: weekly revenue by region" /><span>AI drafts the SQL for review; it won&apos;t run until you choose Run query.</span></div>
      <label className="sql-editor-label" htmlFor="sql-explorer-query">DuckDB SQL</label>
      <textarea id="sql-explorer-query" className="sql-explorer-editor" aria-label="DuckDB SQL query" value={sql} onChange={e => { setSql(e.target.value); setRows(null); }} rows={8} spellCheck={false} placeholder="SELECT * FROM sales LIMIT 100" />
      <div className="sql-explorer-actions">
        <Button onClick={() => void run()} disabled={running || !sql.trim()}>{running ? <LoaderCircle className="spin" /> : <Play />}Run query</Button>
        <span>Local tables: {sources.map(source => source.table).join(", ") || "none"}</span>
      </div>
      {aiError && <p className="form-error" role="alert">{aiError}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {rows && <section className="sql-results">
        <header><div><Table2 size={15} /><strong>Results</strong><span>{rows.length.toLocaleString()} rows</span></div>
          {!chartReady && <span>To create a chart, return text <code>label</code> and numeric <code>value</code> columns.</span>}
        </header>
        {rows.length ? <div className="sql-results-table"><table><thead><tr>{Object.keys(rows[0]).map(key => <th key={key}>{key}</th>)}</tr></thead><tbody>{rows.slice(0, 100).map((row, index) => <tr key={index}>{Object.keys(rows[0]).map(key => <td key={key}>{formatCell(row[key])}</td>)}</tr>)}</tbody></table></div> : <p className="muted-note">The query ran successfully and returned no rows.</p>}
        {rows.length > 100 && <p className="muted-note">Showing the first 100 rows. The full result set stays available in this session.</p>}
        {chartReady && <div className="sql-chart-options">
          <label>Chart title<input aria-label="New chart title" value={chartTitle} onChange={e => setChartTitle(e.target.value)} /></label>
          <label>Chart type<select aria-label="New chart type" value={chartKind} onChange={e => setChartKind(e.target.value as ChartKind)}><option value="bar">Bar</option><option value="line">Line</option><option value="donut">Donut</option></select></label>
          <label>Number format<select aria-label="Number format" value={format} onChange={e => setFormat(e.target.value as "currency" | "number")}><option value="number">Number</option><option value="currency">Currency</option></select></label>
        </div>}
        {chartReady && <div className="sql-chart-footer">
          <Button size="sm" onClick={() => void addChart()} disabled={running}><Plus />Add chart</Button>
        </div>}
      </section>}
      <p className="sql-safety-note"><Bot size={14} />The query runs locally in your browser. Only a read-only SELECT or WITH statement is allowed; external files and network access are blocked.</p>
    </DialogContent>
  </Dialog>;
}

function extractTable(sql: string) {
  return /\bfrom\s+"?([a-z_][\w$]*)"?/i.exec(sql)?.[1] ?? "";
}

function formatCell(value: Row[string]) {
  if (value === null) return "NULL";
  return String(value);
}

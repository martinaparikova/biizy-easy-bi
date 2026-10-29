"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, BarChart3, CalendarDays, Check, ClipboardCheck, Code2, Copy, Database, Download, Expand, LayoutGrid, LoaderCircle, Plus, RefreshCw, Share2, Sparkles, Trash2, TrendingUp, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChartView, formatValue } from "./chart-view";
import { errorText, useWorkspace } from "@/lib/store";
import type { Chart, DateRange } from "@/lib/types";
import { filterSources } from "@/lib/filters";
import { DashboardFilters } from "./dashboard-filters";
import { QueryExplorer } from "./query-explorer";
import { BrandMark } from "./brand-mark";
import { compareChartResults, chartVerificationSql } from "@/lib/sql-tools";
import { querySources } from "@/lib/engine";
import type { Row } from "@/lib/types";
import { ReportBlocks, ReportBuilder, ReportPages, useReportPage } from "./report-builder";
import { CustomReportView } from "./custom-report-view";
import { CustomReportEditor } from "./custom-report-editor";

export function ChartCard({ chart, index, length, editing }: { chart: Chart; index: number; length: number; editing: boolean }) {
  const { developerMode, updateChart, runChartSql, removeChart, moveChart, notify, busy, sources, relationships, filters } = useWorkspace();
  const [sql, setSql] = useState(chart.sql);
  const [showQuery, setShowQuery] = useState(false);
  const [error, setError] = useState("");
  const [checkOpen, setCheckOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkSql, setCheckSql] = useState("");
  const [checkRows, setCheckRows] = useState<Row[] | null>(null);
  const [checkError, setCheckError] = useState("");
  const currentSql = showQuery ? sql : chart.sql;

  async function run() {
    setError("");
    try { await runChartSql(chart.id, currentSql); }
    catch (e) { setError(errorText(e)); }
  }

  async function verify() {
    setCheckOpen(true);
    setChecking(true);
    setCheckError("");
    setCheckRows(null);
    const generatedSql = chartVerificationSql(chart.sql, chart.labelKey, chart.valueKey);
    setCheckSql(generatedSql);
    try {
      setCheckRows(await querySources(filterSources(sources, relationships, filters), generatedSql));
    } catch (e) {
      setCheckError(errorText(e));
    } finally {
      setChecking(false);
    }
  }
  const comparison = checkRows ? compareChartResults(
    chart.data.map(row => ({ label: row[chart.labelKey], value: row[chart.valueKey] })),
    checkRows,
  ) : null;
  return (
    <article className={`chart-card ${chart.width === "full" ? "chart-full" : ""}`} data-export-card style={chart.radius !== undefined ? { borderRadius: chart.radius } : undefined}>
      <header className="chart-card-header"><div><h3>{chart.title}</h3><p>{chart.subtitle}</p></div>
        <div className="chart-actions" data-html2canvas-ignore>
          {editing && <select aria-label={`Chart type for ${chart.title}`} disabled={busy} value={chart.kind} onChange={e => updateChart(chart.id, { kind: e.target.value as Chart["kind"] })}><option value="bar">Bar chart</option><option value="line">Line chart</option><option value="donut">Donut</option></select>}
          <button aria-label={`Verify values for ${chart.title}`} disabled={busy || checking} onClick={() => void verify()}><ClipboardCheck size={15} /></button>
          {developerMode && <button aria-label={`Edit SQL for ${chart.title}`} className={showQuery ? "active" : ""} onClick={() => { setSql(chart.sql); setShowQuery(!showQuery); }}><Code2 size={15} /></button>}
          {editing && <>
            <button title="Move earlier" aria-label={`Move ${chart.title} earlier`} disabled={index === 0 || busy} onClick={() => moveChart(chart.id, -1)}><ArrowUp size={14} /></button>
            <button title="Move later" aria-label={`Move ${chart.title} later`} disabled={index === length - 1 || busy} onClick={() => moveChart(chart.id, 1)}><ArrowDown size={14} /></button>
            <button title="Change width" aria-label={`Change width of ${chart.title}`} disabled={busy} onClick={() => updateChart(chart.id, { width: chart.width === "full" ? "half" : "full" })}><Expand size={14} /></button>
            <button title="Delete chart" aria-label={`Delete ${chart.title}`} disabled={busy} onClick={() => { removeChart(chart.id); notify("Chart removed"); }}><Trash2 size={14} /></button>
          </>}
        </div>
      </header>
      <ChartView chart={chart} />
      <div className="chart-footnote"><i /> {chart.data.length} groups <span>Queried in DuckDB</span></div>
      {developerMode && showQuery && <div className="query-editor" data-html2canvas-ignore><label htmlFor={`sql-${chart.id}`}>DuckDB SQL · return label and numeric value</label><textarea id={`sql-${chart.id}`} value={sql} onChange={e => setSql(e.target.value)} rows={7} spellCheck={false} /><div><Button size="sm" onClick={run} disabled={busy}>Run query</Button><span>Custom queries don&apos;t use the date filter.</span></div>{error && <p className="form-error" role="alert">{error}</p>}</div>}
      <Dialog open={checkOpen} onOpenChange={setCheckOpen}><DialogContent className="sql-check-dialog"><DialogHeader><DialogTitle>Check {chart.title}</DialogTitle><DialogDescription>This reruns the chart&apos;s current SQL in DuckDB and compares its output with the values held by the chart.</DialogDescription></DialogHeader>
        <label className="sql-editor-label" htmlFor={`check-sql-${chart.id}`}>Generated read-only check query</label>
        <textarea id={`check-sql-${chart.id}`} className="sql-explorer-editor" value={checkSql} readOnly rows={8} spellCheck={false} />
        {checking && <p className="muted-note"><LoaderCircle className="spin" size={14} /> Running the verification query…</p>}
        {checkError && <p className="form-error" role="alert">{checkError}</p>}
        {comparison && <div className={`sql-check-result ${comparison.matches ? "matched" : "mismatched"}`} role={comparison.matches ? "status" : "alert"}>
          <strong>{comparison.matches ? "Values match" : "Values differ"}</strong>
          <span>{comparison.matches ? `${checkRows?.length ?? 0} group values matched the current chart.` : comparison.differences.slice(0, 8).join(" · ")}</span>
        </div>}
        <p className="sql-safety-note"><Database size={14} />This checks that the displayed values match a fresh run of the chart&apos;s SQL. It does not independently prove that the chosen measure, filters, joins, or business definition are correct. Review the query and the data definition for that.</p>
      </DialogContent></Dialog>
    </article>
  );
}

function Metrics() {
  const { sources, dateRange, filters, relationships, appearance } = useWorkspace();
  const source = filterSources(sources, relationships, filters).find(s => s.table === "sales");
  if (!source || !appearance.showMetrics) return null;
  const rows = source.rows.filter(row => dateRange === "all" || (String(row.Order_Date) >= (dateRange === "q1" ? "2026-01-01" : "2026-04-01") && String(row.Order_Date) <= (dateRange === "q1" ? "2026-03-31" : "2026-06-30")));
  const revenue = rows.reduce((total, row) => total + Number(row.Revenue), 0);
  const profit = rows.reduce((total, row) => total + Number(row.Profit), 0);
  const metrics = [
    { name: "Total revenue", value: formatValue(revenue, "currency"), sub: `${rows.length.toLocaleString()} orders in this period`, icon: Wallet },
    { name: "Average order", value: formatValue(rows.length ? revenue / rows.length : 0, "currency"), sub: "Revenue per completed order", icon: BarChart3 },
    { name: "Profit margin", value: `${(revenue ? profit / revenue * 100 : 0).toFixed(1)}%`, sub: `${formatValue(profit, "currency", true)} total profit`, icon: TrendingUp },
    { name: "Unique customers", value: new Set(rows.map(r => r.Customer_ID)).size.toLocaleString(), sub: "Distinct customers in this period", icon: Users },
  ];
  return <div className="metrics-row" data-export-card>{metrics.map(metric => <div className="metric" key={metric.name}><div className="metric-label">{metric.name}<metric.icon size={14} /></div><strong>{metric.value}</strong><span>{metric.sub}</span></div>)}</div>;
}

export function Dashboard() {
  const { charts, title, dateRange, refresh, notify, busy, initialized, send, setTitle, filters, developerMode, setReport } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const { page, report } = useReportPage();
  const [customFailure, setCustomFailure] = useState<{ source: typeof page.custom; message: string } | null>(null);
  const customError = customFailure && customFailure.source === page.custom ? customFailure.message : "";
  const visibleCharts = page.chartIds.flatMap(id => {
    const chart = charts.find(chart => chart.id === id);
    return chart ? [chart] : [];
  });
  const [sharing, setSharing] = useState(false);
  const [shareMode, setShareMode] = useState<"options" | "embed">("options");
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [shareError, setShareError] = useState("");
  const [adding, setAdding] = useState(false);
  const [exploringSql, setExploringSql] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [fromTable, setFromTable] = useState("");
  const sources = useWorkspace(s => s.sources);
  const canvas = useRef<HTMLDivElement>(null);
  const snippet = typeof window === "undefined" ? "" : `<iframe src="${window.location.origin}/embed" width="100%" height="900" style="border:0;border-radius:12px" title="Biizy demo dashboard" loading="lazy"></iframe>`;

  async function copy() {
    try { await navigator.clipboard.writeText(snippet); setCopied(true); setTimeout(() => setCopied(false), 2200); }
    catch (error) { setShareError(`Couldn't copy. Select the snippet and copy it manually. ${errorText(error)}`); }
  }
  async function updateRange(value: DateRange) {
    try { await refresh(value); } catch (error) { notify(errorText(error)); }
  }
  async function exportPdf() {
    if (page.custom) { notify("Custom report PDF export is not available yet. Use the standard canvas to export this page."); return; }
    if (!canvas.current || !charts.length) return;
    setExporting(true);
    try {
      await document.fonts.ready;
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
      const cards = Array.from(canvas.current.querySelectorAll<HTMLElement>("[data-export-card]"));
      let y = 28;
      const header = () => {
        pdf.setFontSize(17); pdf.setTextColor(32, 39, 56); pdf.text(title, 12, 14);
        pdf.setFontSize(8); pdf.setTextColor(130, 137, 155); pdf.text(`BIIZY / ${page.title} / ${dateRange === "all" ? "All dates" : dateRange === "q1" ? "Jan–Mar 2026" : "Apr–Jun 2026"} / Exported ${new Date().toLocaleDateString("en-US")}`, 12, 21);
        const filterText = filters.filter(f => f.values.length).map(f => `${f.label}: ${f.values.join(", ")}`).join(" / ");
        if (filterText) pdf.text(pdf.splitTextToSize(filterText, 270).slice(0, 1), 12, 25);
      };
      header();
      for (const card of cards) {
        const image = await html2canvas(card, { scale: 2, backgroundColor: "#ffffff", logging: false });
        const ratio = image.height / image.width;
        const width = Math.min(273, 163 / ratio), height = ratio * width;
        if (y + height > 195) { pdf.addPage(); header(); y = 28; }
        pdf.addImage(image.toDataURL("image/jpeg", 0.92), "JPEG", 12 + (273 - width) / 2, y, width, height);
        y += height + 8;
      }
      pdf.save(`${title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "dashboard"}.pdf`);
      notify("PDF downloaded");
    } catch (error) { notify(`Couldn't export the PDF. ${errorText(error)}`); }
    finally { setExporting(false); }
  }

  return (
    <>
      <div className="view-heading"><div><div className="eyebrow"><span className="live-dot" /> LIVE WORKSPACE</div>{editing ? <input className="dashboard-title-input" aria-label="Dashboard title" value={title} onChange={e => setTitle(e.target.value)} maxLength={80} /> : <h1>{title}<span className="subtle-badge">Dashboard</span></h1>}<p>A clearer view of what&apos;s moving your business.</p></div><div className="heading-actions"><Button variant="outline" onClick={() => { setShareMode("options"); setShareError(""); setSharing(true); }} disabled={!initialized || busy}><Share2 />Share</Button></div></div>
      <div className="dashboard-toolbar"><div className="period-select"><CalendarDays size={15} /><select aria-label="Dashboard date range" value={dateRange} disabled={busy || !initialized} onChange={e => void updateRange(e.target.value as DateRange)}><option value="all">All dates · sample Jan–Jun 2026</option><option value="q1">Jan 1 – Mar 31, 2026 · Q1</option><option value="q2">Apr 1 – Jun 30, 2026 · Q2</option></select></div><div><button className="refresh-button" disabled={busy || !initialized} onClick={() => void updateRange(dateRange)} aria-label="Refresh dashboard"><RefreshCw size={14} className={busy ? "spin" : ""} /></button><span className="toolbar-divider" /><Button variant="outline" onClick={() => setExploringSql(true)} disabled={!initialized || !sources.length}><Database />Explore SQL</Button><Button variant="ghost" className={editing ? "edit-active" : ""} onClick={() => setEditing(!editing)} disabled={busy}>{editing ? <Check /> : <LayoutGrid />}{editing ? "Done editing" : "Edit layout"}</Button><Button onClick={() => { setFromTable(sources[0]?.table ?? ""); setPrompt(""); setAdding(true); }} disabled={busy || !initialized || !sources.length}><Plus />Add visual</Button></div></div>
      <div className="report-navigation"><ReportPages /><ReportBuilder onEditLayout={() => setEditing(true)} /></div>
      <DashboardFilters />
      {developerMode && <CustomReportEditor />}
      {page.custom && <div className="custom-report-tools">
        {page.custom.previous?.length ? <Button variant="ghost" disabled={busy} onClick={() => {
          const [previous, ...history] = page.custom!.previous!;
          setReport({ ...report, pages: report.pages.map(item => item.id === page.id ? { ...item, custom: { ...previous, previous: history } } : item) });
        }}>Previous version</Button> : null}
        <Button variant="ghost" disabled={busy} onClick={() => setReport({ ...report, pages: report.pages.map(item => item.id === page.id ? { ...item, custom: undefined } : item) })}>Standard view</Button>
        {customError && <Button variant="outline" disabled={busy} onClick={() => void send(`Repair the custom report on page "${page.id}". Its preview encountered a runtime error. Review the current source for errors and preserve its intended design and data bindings. The runtime error text is not sent because it may contain private data.`)}>Ask AI to repair</Button>}
      </div>}
      {editing && <div className="inline-info"><LayoutGrid size={15} />Use the arrows to reorder visuals, expand to change width, or delete to remove a chart.</div>}
      <div ref={canvas} className="dashboard-canvas">
        {page.custom ? <CustomReportView source={page.custom} chartIds={page.chartIds} onError={message => setCustomFailure({ source: page.custom, message })} /> : <>
        <ReportBlocks />
        <Metrics />
        <div className="section-label"><span>{page.title}</span><span><i className="live-dot" /> {visibleCharts.length} visuals · local data</span></div>
        <div className="charts-grid">{visibleCharts.map((chart, index) => <ChartCard key={chart.id} chart={chart} index={index} length={visibleCharts.length} editing={editing} />)}</div>
        {!visibleCharts.length && !page.blocks.length && <div className="empty-state"><div className="empty-icon">{busy ? <LoaderCircle className="spin" /> : <BarChart3 />}</div><h3>{busy ? "Bringing your data into focus" : "Your next insight starts with a question"}</h3><p>Ask the assistant to add a visual to this page, or use Edit report to choose existing charts.</p><Button variant="outline" disabled={busy || !initialized} onClick={() => void send("Show sales by region")}><Sparkles />Create a sales chart</Button></div>}
        </>}
      </div>
      <div className="dashboard-prompt"><div className="prompt-symbol"><Sparkles size={20} /></div><div><strong>There&apos;s more in your data.</strong><p>Ask a question. Get a visual. Keep exploring.</p></div><button onClick={() => void send("Show profit by category as donut")} disabled={busy || !initialized}>Explore profit by category<ArrowUpRight size={15} /></button></div>
      <div className="workspace-footnote"><span><DatabaseIcon />Powered by DuckDB · No data leaves your browser</span><span>Made for the curious.</span></div>
      <Dialog open={sharing} onOpenChange={setSharing}><DialogContent className="modal-wide">
        {shareMode === "options" ? <>
          <DialogHeader><DialogTitle>Share your dashboard</DialogTitle><DialogDescription>Choose what you want to do with this dashboard.</DialogDescription></DialogHeader>
          <div className="share-options">
            <button onClick={() => setShareMode("embed")}><Share2 size={18} /><span><strong>Share / Embed</strong><small>Copy an iframe snippet or open a preview.</small></span><ArrowUpRight size={15} /></button>
            <button disabled={!!page.custom || busy || exporting} onClick={() => { setSharing(false); void exportPdf(); }}><Download size={18} /><span><strong>{exporting ? "Exporting PDF…" : "Export PDF"}</strong><small>{page.custom ? "Custom preview export is not available yet." : "Download a printable copy of this page."}</small></span>{exporting ? <LoaderCircle className="spin" size={15} /> : <ArrowUpRight size={15} />}</button>
          </div>
        </> : <>
          <DialogHeader><DialogTitle>Share / Embed</DialogTitle><DialogDescription>An embed preview for your website. This MVP link shows the sample dashboard, not your private uploaded data.</DialogDescription></DialogHeader>
          <div className="share-preview"><BrandMark small /><div><strong>Biizy demo dashboard</strong><span>Read-only · sample sales data</span></div><span className="subtle-badge">Preview</span></div>
          <label className="field-label" htmlFor="embed-code">HTML embed snippet</label><textarea id="embed-code" className="code-field" readOnly value={snippet} rows={5} />
          <div className="modal-actions"><Button variant="outline" onClick={() => setShareMode("options")}>Back</Button><Button variant="outline" onClick={() => window.open("/embed", "_blank", "noopener,noreferrer")}><ArrowUpRight />Open preview</Button><Button onClick={copy}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy snippet"}</Button></div>
          <p className="muted-note">Production sharing requires hosted snapshots and access controls. No private data is published here.</p>{shareError && <p className="form-error" role="alert">{shareError}</p>}
        </>}
      </DialogContent></Dialog>
      <Dialog open={adding} onOpenChange={setAdding}><DialogContent className="modal-wide"><DialogHeader><DialogTitle>What would you like to see?</DialogTitle><DialogDescription>Choose a source and ask for a measure by a category or month. The local assistant will query your data and add a visual.</DialogDescription></DialogHeader><form className="connection-form" onSubmit={e => { e.preventDefault(); setAdding(false); void send(`${prompt.replace(/\bfrom\s+\S+\s*$/i, "")} from ${fromTable}`); }}><label>Data source<select value={fromTable} onChange={e => setFromTable(e.target.value)}>{sources.map(s => <option value={s.table} key={s.id}>{s.name} ({s.table})</option>)}</select></label><div className="muted-note">Columns: {sources.find(s => s.table === fromTable)?.columns.map(c => c.name).join(", ")}</div><label>Your question<input required value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Revenue by category as a bar chart" /></label><p className="muted-note">In chat, add “from table_name” to target a specific source. Bar, line, donut, sums, averages and counts are supported.</p><Button type="submit" disabled={busy || !prompt.trim()}><Sparkles />Create visual</Button></form></DialogContent></Dialog>
      <QueryExplorer open={exploringSql} onOpenChange={setExploringSql} />
    </>
  );
}

function DatabaseIcon() { return <span className="footnote-engine"><Code2 size={12} /></span>; }

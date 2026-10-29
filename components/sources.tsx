"use client";

import { useRef, useState } from "react";
import { ArrowRight, CircleHelp, Database, Eye, FileSpreadsheet, HardDrive, LoaderCircle, ShieldCheck, Sparkles, Table2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { demoSources } from "@/lib/demo";
import { importFile } from "@/lib/import";
import { errorText, useWorkspace } from "@/lib/store";
import type { Source } from "@/lib/types";
import { ConnectionPicker } from "./connection-picker";
import { QueryExplorer } from "./query-explorer";

export function Sources() {
  const { sources, addSource, removeSource, busy, initialized, developerMode, setView, notify } = useWorkspace();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [sqlOpen, setSqlOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [preview, setPreview] = useState<Source | null>(null);
  const [exploreSource, setExploreSource] = useState<Source | null>(null);
  const [remove, setRemove] = useState<Source | null>(null);
  const [connection, setConnection] = useState({ host: "", port: "5432", database: "", username: "", password: "" });
  const input = useRef<HTMLInputElement>(null);

  async function upload(file?: File) {
    if (!file || busy || uploading || !initialized) return;
    setError(""); setUploading(true); setDragging(false);
    try { await addSource(await importFile(file, sources)); }
    catch (e) { setError(errorText(e)); }
    finally { setUploading(false); if (input.current) input.current.value = ""; }
  }
  async function connect(event: React.FormEvent) {
    event.preventDefault(); setError("");
    try {
      if (!/^\d+$/.test(connection.port) || Number(connection.port) < 1 || Number(connection.port) > 65535) throw new Error("Enter a valid database port between 1 and 65535.");
      const sample = demoSources()[0];
      let table = "sales"; let suffix = 2;
      while (sources.some(s => s.table === table)) table = `sales_${suffix++}`;
      await addSource({ ...sample, id: crypto.randomUUID(), table, name: `${connection.database} (demo)`, description: "Mock SQL connection · sample sales rows only" });
      setSqlOpen(false); setConnection({ host: "", port: "5432", database: "", username: "", password: "" });
    } catch (e) { setError(errorText(e)); }
  }

  return <>
    <div className="view-heading"><div><h1>Data sources<span className="subtle-badge">{sources.length} connected</span></h1><p>Upload a file or connect a source.</p></div><Button variant="outline" onClick={() => setView("model")}><GitBranchIcon />View model<ArrowRight /></Button></div>
    <div className="connector-grid">
      <button className={`source-action-card ${dragging ? "drag-active" : ""}`} aria-label="Upload" disabled={busy || uploading || !initialized} onClick={() => input.current?.click()} onDragOver={e => { e.preventDefault(); if (!busy && !uploading) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); void upload(e.dataTransfer.files[0]); }}>
        {uploading ? <LoaderCircle className="spin" size={21} /> : <Upload size={21} />}
        <span><strong>{uploading ? "Uploading…" : "Upload"}</strong><small>CSV or Excel · click or drop</small></span>
        <ArrowRight size={16} />
      </button>
      <button className="source-action-card" aria-label="Connect" onClick={() => { setError(""); setPickerOpen(true); }} disabled={busy || !initialized}>
        <Database size={21} /><span><strong>Connect</strong><small>Databases, storage & apps</small></span><ArrowRight size={16} />
      </button>
    </div>
    <input ref={input} type="file" aria-label="Upload CSV or Excel" accept=".csv,.xlsx" hidden onChange={e => void upload(e.target.files?.[0])} />
    <p className="upload-limits">Files up to 5 MB / 20,000 rows. Connections currently use demo data.</p>
    <ConnectionPicker open={pickerOpen} onOpenChange={setPickerOpen} onSelect={() => setSqlOpen(true)} />
    {error && !sqlOpen && <div className="error-banner" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError("")}>Dismiss</button></div>}
    <div className="section-label"><span>CONNECTED SOURCES</span><span><HardDrive size={12} /> Stored on this device</span></div>
    <div className="sources-list">{sources.map(source => <article className="source-card" key={source.id}><div className={`source-icon ${source.kind === "sql" ? "sql" : "file"}`}>{source.kind === "sql" ? <Database size={22} /> : <FileSpreadsheet size={22} />}</div><div className="source-info"><h3>{source.name}<span className="connected-badge"><i />Connected</span></h3><p>{source.description}</p><div className="source-details"><span><Table2 size={12} />{source.rows.length.toLocaleString()} rows</span><span>{source.columns.length} columns</span><span>{source.kind === "sql" ? "SQL demo" : "Parquet conversion · simulated"}</span>{developerMode && <code>{source.table}</code>}</div></div><div className="source-card-actions"><Button variant="ghost" size="sm" aria-label={`Explore ${source.name} with SQL`} disabled={!initialized || busy} onClick={() => setExploreSource(source)}><Database />Explore SQL</Button><Button variant="ghost" size="sm" onClick={() => setPreview(source)}><Eye />Preview</Button><Button variant="ghost" size="icon" aria-label={`Remove ${source.name}`} disabled={busy} onClick={() => setRemove(source)}><Trash2 /></Button></div></article>)}</div>
    <QueryExplorer key={exploreSource?.id ?? "closed"} open={!!exploreSource} onOpenChange={open => { if (!open) setExploreSource(null); }} sourceTable={exploreSource?.table} />
    {!sources.length && <div className="empty-state"><Database /><h3>Your data belongs here</h3><p>Upload a file or connect the SQL demo to get started.</p></div>}
    <div className="privacy-card"><div><ShieldCheck size={22} /></div><div><strong>Your rows stay on this device.</strong><p>Files are queried in-browser with DuckDB and saved locally. Opt-in AI editing shares messages, schema names, selected filters and dashboard settings, not rows or results.</p></div></div>
    <Dialog open={sqlOpen} onOpenChange={open => { setSqlOpen(open); setError(""); if (!open) setConnection({ host: "", port: "5432", database: "", username: "", password: "" }); }}><DialogContent className="modal-wide"><DialogHeader><DialogTitle>Connect a SQL database</DialogTitle><DialogDescription>This is a mock connector. It loads sample sales, not data from the host you enter. Use demo values only.</DialogDescription></DialogHeader><div className="inline-info"><Sparkles size={16} /><span>Need a starting point?</span><button onClick={() => setConnection({ host: "demo.lens.local", port: "5432", database: "retail_analytics", username: "demo_reader", password: "demo-only" })}>Fill demo details<ArrowRight size={13} /></button></div><form className="connection-form" onSubmit={connect}><div className="form-two-columns"><label>Host<input required value={connection.host} onChange={e => setConnection({ ...connection, host: e.target.value })} placeholder="demo.lens.local" autoComplete="off" /></label><label>Port<input required value={connection.port} onChange={e => setConnection({ ...connection, port: e.target.value })} inputMode="numeric" /></label></div><label>Database<input required value={connection.database} onChange={e => setConnection({ ...connection, database: e.target.value })} placeholder="retail_analytics" autoComplete="off" /></label><div className="form-two-columns"><label>Username<input required value={connection.username} onChange={e => setConnection({ ...connection, username: e.target.value })} placeholder="demo_reader" autoComplete="off" /></label><label>Demo password<input type="password" value={connection.password} onChange={e => setConnection({ ...connection, password: e.target.value })} placeholder="Demo values only" autoComplete="new-password" /></label></div>{error && <p className="form-error" role="alert">{error}</p>}<p className="muted-note"><CircleHelp size={13} />For a real connection, your database administrator can provide these details. Never paste production credentials into this MVP.</p><Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Database />}Connect demo data</Button></form></DialogContent></Dialog>
    <Dialog open={!!preview} onOpenChange={open => { if (!open) setPreview(null); }}><DialogContent className="modal-preview"><DialogHeader><DialogTitle>{preview?.name}</DialogTitle><DialogDescription>First 8 rows · {preview?.rows.length.toLocaleString()} total rows. Your original data remains unchanged.</DialogDescription></DialogHeader>{preview && <div className="table-scroll"><table><thead><tr>{preview.columns.map(c => <th key={c.name}>{c.name}<small>{c.type}</small></th>)}</tr></thead><tbody>{preview.rows.slice(0, 8).map((row, i) => <tr key={i}>{preview.columns.map(c => <td key={c.name}>{String(row[c.name] ?? "—")}</td>)}</tr>)}</tbody></table></div>}</DialogContent></Dialog>
    <Dialog open={!!remove} onOpenChange={open => { if (!open) setRemove(null); }}><DialogContent><DialogHeader><DialogTitle>Remove {remove?.name}?</DialogTitle><DialogDescription>This removes its relationships and clears existing charts so stale data cannot be displayed. You can reconnect the source later.</DialogDescription></DialogHeader><div className="modal-actions"><Button variant="outline" onClick={() => setRemove(null)}>Keep source</Button><Button variant="destructive" disabled={busy} onClick={async () => { try { if (remove) await removeSource(remove.id); setRemove(null); } catch (e) { notify(errorText(e)); } }}><Trash2 />Remove source</Button></div></DialogContent></Dialog>
  </>;
}

function GitBranchIcon() { return <span className="button-model-icon"><Table2 size={14} /></span>; }

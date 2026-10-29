"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Database, KeyRound, Link2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { proposeRelationships, validateModel } from "@/lib/model";
import { errorText, useWorkspace } from "@/lib/store";
import type { Relationship } from "@/lib/types";

type Key = { table: string; column: string };
type Path = { id: string; d: string };

export function SemanticModel() {
  const { sources, relationships, setModel, developerMode, busy, initialized, setView } = useWorkspace();
  const [selected, setSelected] = useState<Key | null>(null);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ fromTable: "", fromColumn: "", toTable: "", toColumn: "" });
  const [suggestions, setSuggestions] = useState<Relationship[] | null>(null);
  const [json, setJson] = useState("");
  const [paths, setPaths] = useState<Path[]>([]);
  const board = useRef<HTMLDivElement>(null);
  const ports = useRef(new Map<string, HTMLButtonElement>());
  const dragKey = useRef<Key | null>(null);

  useEffect(() => {
    const element = board.current;
    if (!element) return;
    const update = () => {
      const origin = element.getBoundingClientRect();
      const lines = relationships.flatMap(r => {
        const from = ports.current.get(`${r.fromTable}:${r.fromColumn}`)?.getBoundingClientRect();
        const to = ports.current.get(`${r.toTable}:${r.toColumn}`)?.getBoundingClientRect();
        if (!from || !to) return [];
        const x1 = from.right - origin.left, x2 = to.left - origin.left;
        const y1 = from.top + from.height / 2 - origin.top, y2 = to.top + to.height / 2 - origin.top;
        const bend = Math.max(45, Math.abs(x2 - x1) / 2);
        return [{ id: r.id, d: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}` }];
      });
      setPaths(lines);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.querySelectorAll(".entity-card").forEach(card => observer.observe(card));
    return () => observer.disconnect();
  }, [relationships, sources]);

  async function save(next: Relationship[]) {
    setError("");
    try {
      validateModel({ relationships: next }, sources);
      await setModel({ relationships: next });
      return true;
    } catch (e) { setError(errorText(e)); return false; }
  }

  async function connect(from: Key, to: Key) {
    if (busy) return;
    const next = { id: crypto.randomUUID(), fromTable: from.table, fromColumn: from.column, toTable: to.table, toColumn: to.column };
    if (await save([...relationships, next])) setSelected(null);
  }
  function clickKey(key: Key) {
    if (selected && selected.table === key.table && selected.column === key.column) setSelected(null);
    else if (selected) void connect(selected, key);
    else { setSelected(key); setError(""); }
  }
  function openEditor(r?: Relationship) {
    setError(""); setEditingId(r?.id ?? null);
    setDraft(r ? { fromTable: r.fromTable, fromColumn: r.fromColumn, toTable: r.toTable, toColumn: r.toColumn } :
      { fromTable: sources[0]?.table ?? "", fromColumn: sources[0]?.columns[0]?.name ?? "", toTable: sources[1]?.table ?? "", toColumn: sources[1]?.columns[0]?.name ?? "" });
    setEditor(true);
  }
  async function saveDraft(e: React.FormEvent) {
    e.preventDefault();
    const next = relationships.filter(r => r.id !== editingId);
    next.push({ id: editingId ?? crypto.randomUUID(), ...draft });
    if (await save(next)) setEditor(false);
  }

  return <>
    <div className="view-heading"><div><div className="eyebrow">MAKE THE CONNECTION</div><h1>Semantic model<span className="subtle-badge">{relationships.length} relationship{relationships.length === 1 ? "" : "s"}</span></h1><p>Give your data context. Good connections make better answers.</p></div><Button variant="outline" disabled={sources.length < 2 || busy || !initialized} onClick={() => setSuggestions(proposeRelationships(sources))}><Sparkles />Suggest relationships</Button></div>
    <div className="model-summary"><div><span className="model-summary-icon"><Link2 size={18} /></span><div><strong>{selected ? `Now select a matching key in another table` : "A connected view of your business"}</strong><p>{selected ? `${selected.table}.${selected.column} selected · Escape or Cancel to stop` : "Drag a column onto another table's column, or click two columns to connect them."}</p></div></div>{selected ? <Button variant="ghost" onClick={() => setSelected(null)}><X />Cancel</Button> : <Button variant="ghost" disabled={sources.length < 2 || busy || !initialized} onClick={() => openEditor()}><Plus />Add relationship</Button>}</div>
    {error && !editor && <div className="error-banner" role="alert">{error}<button onClick={() => setError("")}>Dismiss</button></div>}
    <div className="model-board" ref={board} onKeyDown={e => { if (e.key === "Escape") setSelected(null); }}>
      <svg className="relationship-lines" aria-hidden="true">
        <defs><marker id="relationship-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--primary)" /></marker></defs>
        {paths.map(path => <path key={path.id} d={path.d} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" markerEnd="url(#relationship-arrow)" />)}
      </svg>
      {sources.map(source => <article className="entity-card" key={source.id}><header><h3>{source.table}</h3><span>{source.kind === "sql" ? "SQL demo" : source.kind.toUpperCase()}</span></header><div className="entity-columns">{source.columns.map(column => {
        const connected = relationships.some(r => r.fromTable === source.table && r.fromColumn === column.name || r.toTable === source.table && r.toColumn === column.name);
        const active = selected?.table === source.table && selected.column === column.name;
        return <button key={column.name} ref={element => { if (element) ports.current.set(`${source.table}:${column.name}`, element); else ports.current.delete(`${source.table}:${column.name}`); }} className={`entity-column ${connected ? "connected" : ""} ${active ? "selected" : ""}`} draggable={!busy} disabled={busy || !initialized} aria-label={`Connect ${source.table}.${column.name}`} aria-pressed={active} onClick={() => clickKey({ table: source.table, column: column.name })} onDragStart={e => { dragKey.current = { table: source.table, column: column.name }; e.dataTransfer.setData("text/plain", `${source.table}.${column.name}`); e.dataTransfer.effectAllowed = "link"; setSelected(dragKey.current); }} onDragEnd={() => { dragKey.current = null; }} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "link"; }} onDrop={e => { e.preventDefault(); if (dragKey.current) void connect(dragKey.current, { table: source.table, column: column.name }); }}><span>{column.name}</span><small>{column.type === "number" ? "NUMBER" : column.type === "boolean" ? "BOOL" : "TEXT"}</small></button>;
      })}</div><footer><span><i className="live-dot" />{source.rows.length.toLocaleString()} rows</span><span>{source.columns.length} fields</span></footer></article>)}
      {!sources.length && <div className="empty-state"><Database /><h3>Nothing to connect yet</h3><p>Add a source to build your semantic model.</p><Button onClick={() => setView("sources")}>Connect data</Button></div>}
      <div className="model-board-legend"><span><i />Matched key</span><span>Click or drag to connect</span></div>
    </div>
    <div className="section-label"><span>RELATIONSHIPS</span><span>Editable · no code required</span></div>
    <div className="relationships-list">{relationships.map(r => {
      const from = sources.find(s => s.table === r.fromTable), to = sources.find(s => s.table === r.toTable);
      const unique = to && new Set(to.rows.map(row => row[r.toColumn])).size === to.rows.length;
      return <div className="relationship-row" key={r.id}><span className="relationship-icon"><Link2 size={17} /></span><div><strong>{r.fromTable}<span>.{r.fromColumn}</span></strong><ArrowRight size={15} /><strong>{r.toTable}<span>.{r.toColumn}</span></strong></div><span className={`relationship-type ${unique ? "" : "warning"}`}>{unique ? `${from && new Set(from.rows.map(row => row[r.fromColumn])).size === from.rows.length ? "One" : "Many"} to one` : "Check key uniqueness"}</span><Button variant="ghost" size="sm" disabled={busy} onClick={() => openEditor(r)}>Edit</Button><Button variant="ghost" size="icon" disabled={busy} aria-label={`Delete relationship ${r.fromTable} to ${r.toTable}`} onClick={() => void save(relationships.filter(item => item.id !== r.id))}><Trash2 /></Button></div>;
    })}</div>
    {!relationships.length && <div className="inline-info"><Link2 size={15} />No relationships yet. Connect a shared key, or ask for suggestions.</div>}
    <div className="model-tip"><Sparkles size={18} /><div><strong>Let the model do the heavy lifting.</strong><p>With sales and regions connected, “sales by region” works across both sources. Prefer a unique key on your lookup table to avoid counting rows twice.</p></div></div>
    {developerMode && <div className="developer-panel"><header><div><h3>Semantic model JSON</h3><p>Advanced editing · changes are validated before saving.</p></div><Button variant="outline" size="sm" onClick={() => setJson(JSON.stringify({ relationships }, null, 2))}>Load current model</Button></header><textarea className="code-field" aria-label="Semantic model JSON" value={json} onChange={e => setJson(e.target.value)} rows={10} spellCheck={false} placeholder='{"relationships": [...]}' /><Button disabled={busy || !json.trim()} onClick={async () => { try { await setModel(JSON.parse(json)); setError(""); } catch (e) { setError(errorText(e)); } }}>Validate & save model</Button></div>}
    <Dialog open={editor} onOpenChange={setEditor}><DialogContent className="modal-wide"><DialogHeader><DialogTitle>{editingId ? "Edit relationship" : "Connect two keys"}</DialogTitle><DialogDescription>Choose matching columns in two different tables. Both columns must have the same data type.</DialogDescription></DialogHeader><form onSubmit={saveDraft} className="connection-form"><label>From table<select required value={draft.fromTable} onChange={e => setDraft({ ...draft, fromTable: e.target.value, fromColumn: sources.find(s => s.table === e.target.value)?.columns[0]?.name ?? "" })}>{sources.map(s => <option key={s.table} value={s.table}>{s.table}</option>)}</select></label><label>From column<select required value={draft.fromColumn} onChange={e => setDraft({ ...draft, fromColumn: e.target.value })}>{sources.find(s => s.table === draft.fromTable)?.columns.map(c => <option key={c.name} value={c.name}>{c.name} ({c.type})</option>)}</select></label><div className="form-connector"><Link2 size={18} /></div><label>To table<select required value={draft.toTable} onChange={e => setDraft({ ...draft, toTable: e.target.value, toColumn: sources.find(s => s.table === e.target.value)?.columns[0]?.name ?? "" })}><option value="" disabled>Select a table</option>{sources.map(s => <option key={s.table} value={s.table}>{s.table}</option>)}</select></label><label>To column<select required value={draft.toColumn} onChange={e => setDraft({ ...draft, toColumn: e.target.value })}>{sources.find(s => s.table === draft.toTable)?.columns.map(c => <option key={c.name} value={c.name}>{c.name} ({c.type})</option>)}</select></label>{error && <p className="form-error" role="alert">{error}</p>}<Button type="submit" disabled={busy}><Check />Save relationship</Button></form></DialogContent></Dialog>
    <Dialog open={suggestions !== null} onOpenChange={open => { if (!open) setSuggestions(null); }}><DialogContent className="modal-wide"><DialogHeader><DialogTitle>Suggested relationships</DialogTitle><DialogDescription>Matching ID columns are candidates, not guarantees. Review these connections before adding them. Existing relationships are kept.</DialogDescription></DialogHeader>{suggestions?.length ? suggestions.map(r => <div className="suggested-relation" key={r.id}><KeyRound size={15} /><strong>{r.fromTable}.{r.fromColumn}</strong><ArrowRight size={14} /><strong>{r.toTable}.{r.toColumn}</strong></div>) : <p className="muted-note">No matching ID columns found. You can connect columns manually.</p>}<Button disabled={busy || !suggestions?.length} onClick={async () => {
      const merged = [...relationships];
      for (const r of suggestions ?? []) {
        const exists = merged.some(current => current.fromTable === r.fromTable && current.fromColumn === r.fromColumn && current.toTable === r.toTable && current.toColumn === r.toColumn || current.toTable === r.fromTable && current.toColumn === r.fromColumn && current.fromTable === r.toTable && current.fromColumn === r.toColumn);
        if (!exists) merged.push(r);
      }
      if (await save(merged)) setSuggestions(null);
    }}><Check />Apply suggestions</Button>{error && <p className="form-error" role="alert">{error}</p>}</DialogContent></Dialog>
  </>;
}

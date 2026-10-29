"use client";

import { useState } from "react";
import { Filter, Plus, X } from "lucide-react";
import { useWorkspace, errorText } from "@/lib/store";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";

export function DashboardFilters() {
  const { sources, filters, setFilters, busy, initialized, notify } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [table, setTable] = useState("");
  const [column, setColumn] = useState("");
  async function apply(next: typeof filters) {
    try { await setFilters(next); } catch (error) { notify(`Couldn't apply filters. ${errorText(error)}`); }
  }
  return <>
    <div className="dashboard-filters">
      <span className="filter-heading"><Filter size={14} />Filters</span>
      {filters.map(filter => {
        const source = sources.find(s => s.table === filter.table);
        const values = Array.from(new Set(source?.rows.map(row => String(row[filter.column] ?? "")) ?? [])).sort();
        return <div className="filter-control" key={filter.id}>
          <details><summary>{filter.label}<span>{filter.values.length ? `${filter.values.length} selected` : "All"}</span></summary>
            <div className="filter-popover"><button disabled={busy} onClick={() => void apply(filters.map(f => f.id === filter.id ? { ...f, values: [] } : f))}>Clear selection</button>
              {values.map(value => <label key={value}><input type="checkbox" disabled={busy || !initialized} checked={filter.values.includes(value)} onChange={e => void apply(filters.map(f => f.id === filter.id ? { ...f, values: e.target.checked ? [...f.values, value] : f.values.filter(v => v !== value) } : f))} />{value || "(Empty)"}</label>)}
            </div>
          </details>
          <button className="remove-filter" disabled={busy} aria-label={`Remove ${filter.label} filter`} onClick={() => void apply(filters.filter(f => f.id !== filter.id))}><X size={12} /></button>
        </div>;
      })}
      <Button size="sm" variant="ghost" disabled={busy || !initialized || !sources.length} onClick={() => { setTable(sources[0].table); setColumn(sources[0].columns[0]?.name ?? ""); setOpen(true); }}><Plus />Add filter</Button>
      <span className="filter-scope-note">Applies through model relationships</span>
    </div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Add a dashboard filter</DialogTitle><DialogDescription>Values filter this table and tables connected through your model. Disconnected sources stay unchanged.</DialogDescription></DialogHeader><form className="connection-form" onSubmit={async e => {
      e.preventDefault();
      try {
        await setFilters([...filters, { id: crypto.randomUUID(), label: column.replaceAll("_", " "), table, column, values: [] }]);
        setOpen(false);
      } catch (error) { notify(`Couldn't add filter. ${errorText(error)}`); }
    }}><label>Table<select value={table} onChange={e => { setTable(e.target.value); setColumn(sources.find(s => s.table === e.target.value)?.columns[0]?.name ?? ""); }}>{sources.map(s => <option key={s.id} value={s.table}>{s.name}</option>)}</select></label><label>Column<select value={column} onChange={e => setColumn(e.target.value)}>{sources.find(s => s.table === table)?.columns.map(c => <option key={c.name}>{c.name}</option>)}</select></label><Button type="submit" disabled={busy || !column}>Add filter</Button></form></DialogContent></Dialog>
  </>;
}

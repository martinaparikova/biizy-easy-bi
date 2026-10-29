"use client";

import { useState } from "react";
import { Plus, Settings2, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { errorText, useWorkspace } from "@/lib/store";
import { defaultReport, reconcileReport, type Report, type ReportBlock } from "@/lib/report";

export function useReportPage() {
  const { report, charts } = useWorkspace();
  const current = reconcileReport(report ?? defaultReport(charts), charts);
  return { report: current, page: current.pages.find(page => page.id === current.activePageId) ?? current.pages[0] };
}

export function ReportPages() {
  const { report } = useReportPage();
  const { openReportPage, busy } = useWorkspace();
  return <nav className="report-pages" aria-label="Report pages">{report.pages.map(page =>
    <button key={page.id} disabled={busy} aria-current={page.id === report.activePageId ? "page" : undefined} onClick={() => openReportPage(page.id)}>{page.title}</button>,
  )}</nav>;
}

export function ReportBlocks() {
  const { page } = useReportPage();
  const openReportPage = useWorkspace(state => state.openReportPage);
  const busy = useWorkspace(state => state.busy);
  return <div className="report-blocks">{page.blocks.map(block =>
    <section className={`report-block report-block-${block.kind}`} key={block.id} data-export-card style={{ color: block.color, fontSize: block.fontSize }}>
      {block.kind === "text" ? <p>{block.text}</p> : <button disabled={busy} onClick={() => block.targetPageId && openReportPage(block.targetPageId)} style={{ background: block.color, fontSize: block.fontSize }}>{block.text}</button>}
    </section>,
  )}</div>;
}

export function ReportBuilder({ onEditLayout }: { onEditLayout: () => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const { report, page } = useReportPage();
  const { charts, setReport, busy, initialized, appearance, setAppearance, updateChart } = useWorkspace();
  const [chartId, setChartId] = useState("");
  const chart = charts.find(chart => chart.id === chartId) ?? charts[0];

  function save(next: Report) {
    try { setReport(next); setError(""); }
    catch (error) { setError(errorText(error)); }
  }
  function changePage(patch: Partial<typeof page>) {
    save({ ...report, pages: report.pages.map(item => item.id === page.id ? { ...item, ...patch } : item) });
  }
  function removePage() {
    const pages = report.pages.filter(item => item.id !== page.id).map(item => ({
      ...item, blocks: item.blocks.filter(block => block.kind !== "button" || block.targetPageId !== page.id),
    }));
    save({ activePageId: pages[0].id, pages });
  }
  function blockForm(event: React.FormEvent<HTMLFormElement>, existing?: ReportBlock) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const kind = data.get("kind") === "button" ? "button" : "text";
    const block: ReportBlock = {
      id: existing?.id ?? crypto.randomUUID(), kind, text: String(data.get("text")).trim(),
      fontSize: Number(data.get("fontSize")), color: String(data.get("color")),
      ...(kind === "button" ? { targetPageId: String(data.get("targetPageId")) } : {}),
    };
    changePage({ blocks: existing ? page.blocks.map(item => item.id === existing.id ? block : item) : [...page.blocks, block] });
  }
  function elementForm(block?: ReportBlock) {
    return <form className="report-element-form" onSubmit={event => blockForm(event, block)} key={`${page.id}-${block?.id ?? "new"}`}>
      <select name="kind" aria-label="Element type" defaultValue={block?.kind ?? "text"}><option value="text">Text</option><option value="button">Page button</option></select>
      <textarea name="text" aria-label="Element text" required maxLength={2000} defaultValue={block?.text ?? ""} placeholder="A heading, note, or button label" rows={2} />
      <div className="report-field-row">
        <label>Color<input name="color" type="color" defaultValue={block?.color ?? (block?.kind === "text" ? "#a5b0c3" : "#e6007e")} /></label>
        <label>Text size<input name="fontSize" type="number" min={12} max={48} defaultValue={block?.fontSize ?? 16} required /></label>
        <label>Button destination<select name="targetPageId" defaultValue={block?.targetPageId ?? page.id}>{report.pages.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      </div>
      <Button type="submit" variant="outline" disabled={busy}>{block ? "Save element" : "Add element"}</Button>
    </form>;
  }

  return <>
    <Button variant="ghost" disabled={busy || !initialized} onClick={() => setOpen(true)}><Settings2 />Edit report</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="report-editor">
      <DialogHeader><DialogTitle>Edit report</DialogTitle><DialogDescription>Optional controls. You can also ask the AI assistant to make these changes.</DialogDescription></DialogHeader>
      <fieldset disabled={busy} className="report-editor-fields">
        <section><h3>Pages</h3><ReportPages />
          <div className="report-field-row">
            <form key={page.id + page.title} onSubmit={event => { event.preventDefault(); changePage({ title: String(new FormData(event.currentTarget).get("title")).trim() }); }}>
              <label>Page name<input name="title" aria-label="Page name" defaultValue={page.title} required maxLength={80} /></label><Button type="submit" variant="outline" size="sm">Rename</Button>
            </form>
            <Button variant="outline" disabled={report.pages.length >= 12} onClick={() => {
              const id = crypto.randomUUID();
              save({ ...report, activePageId: id, pages: [...report.pages, { id, title: `Page ${report.pages.length + 1}`, chartIds: [], blocks: [] }] });
            }}><Plus />Add page</Button>
            <Button variant="ghost" disabled={report.pages.length === 1} onClick={removePage}><Trash2 />Delete page</Button>
          </div>
          <p className="muted-note">Deleting a page keeps its charts in the report library and removes buttons linking to it.</p>
        </section>
        <section><h3>Charts on {page.title}</h3><div className="report-chart-list">{charts.map(chart =>
          <label key={chart.id}><input type="checkbox" checked={page.chartIds.includes(chart.id)} onChange={event => changePage({ chartIds: event.target.checked ? [...page.chartIds, chart.id] : page.chartIds.filter(id => id !== chart.id) })} />{chart.title}</label>,
        )}</div>
          <Button variant="outline" onClick={() => { setOpen(false); onEditLayout(); }}>Arrange charts on canvas</Button>
          {chart && <div className="report-field-row">
            <label>Style chart<select aria-label="Style chart" value={chart.id} onChange={event => setChartId(event.target.value)}>{charts.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
            <label>Chart color<input aria-label="Chart color" type="color" value={chart.color ?? appearance.accent} onChange={event => updateChart(chart.id, { color: event.target.value })} /></label>
            <label>Height<input aria-label="Chart height" type="number" min={160} max={600} defaultValue={chart.height ?? 220} key={chart.id} onBlur={event => { const height = Number(event.target.value); if (height >= 160 && height <= 600) updateChart(chart.id, { height }); else setError("Chart height must be between 160 and 600 pixels."); }} /></label>
            <Button variant="outline" onClick={() => updateChart(chart.id, { palette: ["#e6007e", "#f2c94c", "#22aabb", "#6abf69"] })}>Different colors</Button>
          </div>}
        </section>
        <section><h3>Text &amp; buttons</h3>{page.blocks.map((block, index) => <div className="report-element-editor" key={block.id}>
          {elementForm(block)}<div className="report-field-row">
            <Button variant="ghost" size="sm" disabled={index === 0} aria-label={`Move element ${index + 1} earlier`} onClick={() => { const blocks = [...page.blocks]; [blocks[index - 1], blocks[index]] = [blocks[index], blocks[index - 1]]; changePage({ blocks }); }}><ArrowUp /></Button>
            <Button variant="ghost" size="sm" disabled={index === page.blocks.length - 1} aria-label={`Move element ${index + 1} later`} onClick={() => { const blocks = [...page.blocks]; [blocks[index + 1], blocks[index]] = [blocks[index], blocks[index + 1]]; changePage({ blocks }); }}><ArrowDown /></Button>
            <Button variant="ghost" size="sm" onClick={() => changePage({ blocks: page.blocks.filter(item => item.id !== block.id) })}><Trash2 />Delete element</Button>
          </div>
        </div>)}{elementForm()}</section>
        <section><h3>Report appearance</h3><div className="report-field-row">
          <label>Font<select aria-label="Report font" value={appearance.font} onChange={event => {
            const font = event.target.value;
            if (font === "Roboto" || font === "DM Sans" || font === "Manrope" || font === "Space Grotesk" || font === "Arial") setAppearance({ font });
          }}>{["Space Grotesk", "Roboto", "DM Sans", "Manrope", "Arial"].map(font => <option key={font}>{font}</option>)}</select></label>
          <label>Theme<select aria-label="Report theme" value={appearance.theme} onChange={event => setAppearance({ theme: event.target.value === "light" ? "light" : "dark" })}><option value="dark">Dark</option><option value="light">Light</option></select></label>
          <label>Accent<input type="color" value={appearance.accent} onChange={event => setAppearance({ accent: event.target.value })} /></label>
          <label><input type="checkbox" checked={appearance.showMetrics} onChange={event => setAppearance({ showMetrics: event.target.checked })} />Show metrics</label>
        </div></section>
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button onClick={() => setOpen(false)}>Done</Button>
    </DialogContent></Dialog>
  </>;
}

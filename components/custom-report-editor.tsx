"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { errorText, useWorkspace } from "@/lib/store";
import { reviseCustomReport, type CustomSource } from "@/lib/custom-report";
import { useReportPage } from "./report-builder";

const sample: CustomSource = {
  html: "<section><h2>Explore your data</h2><p id=\"summary\"></p><button data-action=\"details\" title=\"Show individual categories\">Show details</button><div id=\"details\"></div></section>",
  css: "section{padding:24px}h2{margin-top:0}button{padding:10px 16px;background:#e6007e;color:white;border:0;border-radius:6px}svg{width:100%;height:auto}p{line-height:1.6}",
  javascript: `const rows = data.datasets[0]?.rows ?? [];
let expanded = false;
function draw() {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const html = '<section><h2>Explore your data</h2><p>Total: ' + total.toLocaleString() + '</p><button data-action="details" title="Show individual categories">' + (expanded ? 'Hide details' : 'Show details') + '</button><div id="details"></div></section>';
  api.render(html, 'section{padding:24px}button{padding:10px 16px;background:#e6007e;color:white;border:0;border-radius:6px}p{line-height:1.6}');
}
api.on('details', () => {
  expanded = !expanded;
  const escape = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  api.render('<section><h2>Explore your data</h2><button data-action="details">Toggle details</button>' + (expanded ? rows.map(row => '<p>' + escape(row.label) + ': ' + row.value.toLocaleString() + '</p>').join('') : '') + '</section>', 'section{padding:24px}button{padding:10px;background:#e6007e;color:white;border:0;border-radius:6px}');
});
draw();`,
  height: 450,
};

export function CustomReportEditor() {
  const { report, page } = useReportPage();
  const { setReport, busy } = useWorkspace();
  const [error, setError] = useState("");

  function apply(source: CustomSource) {
    try {
      setReport({ ...report, pages: report.pages.map(item => item.id === page.id ? { ...item, custom: reviseCustomReport(item.custom, source) } : item) });
      setError("");
    } catch (error) { setError(errorText(error)); }
  }
  return <details className="custom-report-code">
    <summary>Custom report code</summary>
    <p className="muted-note">HTML, CSS and worker JavaScript. No React, imports, network access or direct DOM in the script. Use api.render(html, css), api.on(actionId, handler), and data.datasets. This replaces this page&apos;s canvas, not its stored charts.</p>
    <form key={`${page.id}-${JSON.stringify(page.custom)}`} onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      apply({ html: String(data.get("html")), css: String(data.get("css")), javascript: String(data.get("javascript")), height: Number(data.get("height")) });
    }}>
      <label>HTML<textarea name="html" aria-label="Custom report HTML" defaultValue={page.custom?.html ?? ""} rows={4} /></label>
      <label>CSS<textarea name="css" aria-label="Custom report CSS" defaultValue={page.custom?.css ?? ""} rows={4} /></label>
      <label>JavaScript<textarea name="javascript" aria-label="Custom report JavaScript" defaultValue={page.custom?.javascript ?? ""} rows={6} /></label>
      <label>Preview height<input name="height" aria-label="Custom preview height" type="number" min={200} max={1600} defaultValue={page.custom?.height ?? 450} required /></label>
      <div><Button disabled={busy} type="submit">Apply preview</Button><Button disabled={busy} type="button" variant="outline" onClick={() => apply(sample)}>Load working example</Button></div>
    </form>
    {error && <p className="form-error" role="alert">{error}</p>}
  </details>;
}

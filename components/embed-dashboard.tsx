"use client";

import { useEffect, useState } from "react";
import { ChartView } from "./chart-view";
import { BrandMark } from "./brand-mark";
import { demoRelationships, demoSources } from "@/lib/demo";
import { querySources } from "@/lib/engine";
import { planChart } from "@/lib/planner";
import { errorText } from "@/lib/store";
import type { Chart } from "@/lib/types";

export function EmbedDashboard() {
  const [charts, setCharts] = useState<Chart[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const sources = demoSources();
        const output: Chart[] = [];
        for (const prompt of ["sales by region", "revenue by month", "revenue by category as donut"]) {
          const spec = planChart(prompt, sources, demoRelationships, "all");
          output.push({ ...spec, data: await querySources(sources, spec.sql), width: prompt.includes("region") ? "full" : "half" });
        }
        if (active) setCharts(output);
      } catch (e) { if (active) setError(errorText(e)); }
    }
    void load();
    return () => { active = false; };
  }, []);
  return <main className="embed-page"><header className="embed-header"><BrandMark /><strong>Sales overview</strong><span>Biizy demo · Jan–Jun 2026</span></header><div className="inline-info">Public sample preview. No private uploaded data is included.</div>{error && <div className="error-banner" role="alert">{error}</div>}{!charts.length && !error && <div className="empty-state"><h3>Loading sample dashboard…</h3><p>Preparing the local DuckDB engine.</p></div>}<div className="charts-grid">{charts.map(chart => <article className={`chart-card ${chart.width === "full" ? "chart-full" : ""}`} key={chart.id}><header className="chart-card-header"><div><h3>{chart.title}</h3><p>{chart.subtitle}</p></div></header><ChartView chart={chart} /><div className="chart-footnote">Sample data · Read-only</div></article>)}</div></main>;
}

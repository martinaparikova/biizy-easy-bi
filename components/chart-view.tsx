"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Chart } from "@/lib/types";
import { useWorkspace } from "@/lib/store";

export const CHART_COLORS = ["#e6007e", "#ff4da6", "#c9006e", "#ff80bd", "#990052", "#ffb3d6"];
export function formatValue(value: number, format: "currency" | "number", compact = false) {
  return new Intl.NumberFormat("en-US", {
    style: format === "currency" ? "currency" : "decimal",
    currency: "USD", notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
  }).format(value);
}

export function ChartView({ chart }: { chart: Chart }) {
  const appearance = useWorkspace(s => s.appearance);
  const primary = chart.color ?? appearance.accent;
  const colors = chart.palette ?? (chart.color ? [primary] : [primary, ...CHART_COLORS.slice(1)]);
  const grid = chart.showGrid !== false;
  const textColor = appearance.theme === "dark" ? "#aab4c8" : "#6b7589";
  const gridColor = appearance.theme === "dark" ? "#303848" : "#e8ebf2";
  const height = chart.height ?? (chart.width === "full" ? 248 : 220);
  if (!chart.data.length) return <div className="chart-empty"><span>No rows in this date range.</span><p>Choose another period or check your query filters.</p></div>;
  const total = chart.data.reduce((sum, row) => sum + Number(row[chart.valueKey] ?? 0), 0);
  const data = chart.data.map(row => ({
    ...row,
    [chart.labelKey]: chart.kind === "line" && /^\d{4}-\d{2}$/.test(String(row[chart.labelKey])) ?
      new Date(`${row[chart.labelKey]}-02`).toLocaleDateString("en-US", { month: "short", year: "2-digit" }) : row[chart.labelKey],
  }));
  const tooltip = <Tooltip formatter={(value) => formatValue(Number(value), chart.format)} contentStyle={{ borderRadius: 6, border: `1px solid ${gridColor}`, backgroundColor: appearance.theme === "dark" ? "#202735" : "#ffffff", color: textColor, fontSize: 12 }} itemStyle={{ color: textColor }} cursor={{ fill: appearance.theme === "dark" ? "#ffffff08" : "#00000005" }} />;
  if (chart.kind === "donut") return (
    <div className="donut-layout">
      <div className="donut-graphic" role="img" aria-label={`${chart.title}. ${chart.data.map(row => `${row[chart.labelKey]}: ${formatValue(Number(row[chart.valueKey]), chart.format)}`).join(", ")}`}>
        <ResponsiveContainer width="100%" height={chart.height ?? 210}>
          <PieChart>
            <Pie data={data} dataKey={chart.valueKey} nameKey={chart.labelKey} innerRadius={65} outerRadius={88} paddingAngle={4} cornerRadius={4} stroke="none" isAnimationActive={false}>
              {data.map((_, index) => <Cell key={index} fill={colors[index % colors.length]} />)}
            </Pie>
            {tooltip}
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-total"><span>Total</span><strong>{formatValue(total, chart.format, true)}</strong></div>
      </div>
      {chart.showLegend !== false && <div className="chart-legend">
        {data.map((row, i) => <div key={String(row[chart.labelKey])}><i style={{ background: colors[i % colors.length] }} /><span>{String(row[chart.labelKey])}</span><strong>{total ? Math.round(Number(row[chart.valueKey]) / total * 100) : 0}%</strong></div>)}
      </div>}
    </div>
  );
  return (
    <div className="chart-plot" role="img" aria-label={`${chart.title}. ${chart.data.map(row => `${row[chart.labelKey]}: ${formatValue(Number(row[chart.valueKey]), chart.format)}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height={height}>
        {chart.kind === "line" ? (
          <AreaChart data={data} margin={{ top: 18, right: 14, bottom: 0, left: -16 }}>
            <defs><linearGradient id={`fill-${chart.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={primary} stopOpacity={0.17} /><stop offset="100%" stopColor={primary} stopOpacity={0.01} /></linearGradient></defs>
            {grid && <CartesianGrid stroke={gridColor} strokeDasharray="3 4" vertical={false} />}
            <XAxis dataKey={chart.labelKey} axisLine={false} tickLine={false} tick={{ fill: "#8c92a3", fontSize: 11 }} dy={10} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "#8c92a3", fontSize: 10 }} tickFormatter={v => formatValue(v, chart.format, true)} />
            {tooltip}
            <Area type="monotone" dataKey={chart.valueKey} name={chart.title.split(" by ")[0]} stroke={primary} strokeWidth={2.5} fill={`url(#fill-${chart.id})`} isAnimationActive={false} dot={{ fill: primary, stroke: appearance.theme === "dark" ? "#202735" : "#fff", strokeWidth: 2, r: 4 }} />
          </AreaChart>
        ) : (
          <BarChart data={data} margin={{ top: 18, right: 18, bottom: 0, left: -6 }} barSize={chart.data.length > 10 ? undefined : 60}>
            {grid && <CartesianGrid stroke={gridColor} strokeDasharray="3 4" vertical={false} />}
            <XAxis dataKey={chart.labelKey} axisLine={false} tickLine={false} tick={{ fill: "#858c9e", fontSize: 11 }} dy={10} interval={0} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "#8c92a3", fontSize: 10 }} tickFormatter={v => formatValue(v, chart.format, true)} />
            {tooltip}
            <Bar dataKey={chart.valueKey} name={chart.title.split(" by ")[0]} radius={[chart.radius ?? 4, chart.radius ?? 4, 0, 0]} isAnimationActive={false}>
              {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

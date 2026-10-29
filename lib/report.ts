import { z } from "zod";
import type { Chart } from "./types";
import { customReportSchema } from "./custom-report";

const id = z.string().min(1).max(200);
export const reportBlockSchema = z.object({
  id, kind: z.enum(["text", "button"]), text: z.string().min(1).max(2000),
  targetPageId: id.optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  fontSize: z.number().int().min(12).max(48).optional(),
}).strict();
export const reportSchema = z.object({
  activePageId: id,
  pages: z.array(z.object({
    id, title: z.string().min(1).max(80), chartIds: z.array(id).max(50),
    blocks: z.array(reportBlockSchema).max(30),
    custom: customReportSchema.optional(),
  }).strict()).min(1).max(12),
}).strict();
export type Report = z.infer<typeof reportSchema>;
export type ReportBlock = z.infer<typeof reportBlockSchema>;

export function defaultReport(charts: Chart[]): Report {
  return { activePageId: "overview", pages: [{ id: "overview", title: "Overview", chartIds: charts.map(chart => chart.id), blocks: [] }] };
}

export function validateReport(input: unknown, charts: Chart[]): Report {
  const report = reportSchema.parse(input);
  const pages = new Set(report.pages.map(page => page.id));
  if (pages.size !== report.pages.length || !pages.has(report.activePageId)) throw new Error("Report pages need unique IDs and an existing active page.");
  const chartIds = new Set(charts.map(chart => chart.id));
  const blocks = new Set<string>();
  for (const page of report.pages) {
    if (new Set(page.chartIds).size !== page.chartIds.length || page.chartIds.some(id => !chartIds.has(id))) throw new Error("A report page references a missing or duplicate chart.");
    for (const block of page.blocks) {
      if (blocks.has(block.id)) throw new Error("Report elements need unique IDs.");
      blocks.add(block.id);
      if (block.kind === "button" && (!block.targetPageId || !pages.has(block.targetPageId))) throw new Error("Choose an existing destination page for each button.");
    }
  }
  return report;
}

export function reconcileReport(report: Report, charts: Chart[]): Report {
  const ids = new Set(charts.map(chart => chart.id));
  return { ...report, pages: report.pages.map(page => ({ ...page, chartIds: page.chartIds.filter(id => ids.has(id)) })) };
}

export function orderReportCharts(report: Report, ids: string[]): Report {
  return { ...report, pages: report.pages.map(page => ({
    ...page, chartIds: ids.filter(id => page.chartIds.includes(id)),
  })) };
}

export function reportAIContext(report: Report): Report {
  return { ...report, pages: report.pages.map(page => {
    if (!page.custom) return page;
    const { html, css, javascript, height } = page.custom;
    return { ...page, custom: { html, css, javascript, height } };
  }) };
}

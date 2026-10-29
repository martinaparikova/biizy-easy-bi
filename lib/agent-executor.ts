import type { Appearance, Chart, DashboardFilter, DateRange, Relationship, Row, Source, View } from "./types";
import { agentResponseSchema, type AgentAction, type AgentResponse } from "./agent-schema";
import { validateModel } from "./model";
import { filterSources, validateFilters } from "./filters";
import { applyPeriod, planChart, validateChartResult } from "./planner";
import { isReadOnlyQuery } from "./engine";
import { defaultReport, orderReportCharts, reconcileReport, validateReport, type Report } from "./report";
import { reviseCustomReport } from "./custom-report";

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "dark", font: "Space Grotesk", accent: "#e6007e", density: "comfortable", radius: 8, showMetrics: true,
};
export type EditableWorkspace = {
  title: string; charts: Chart[]; sources: Source[]; relationships: Relationship[];
  appearance: Appearance; filters: DashboardFilter[]; dateRange: DateRange; view: View;
  report?: Report;
};
type Query = (sources: Source[], sql: string) => Promise<Row[]>;

export function validateActionIntent(prompt: string, actions: AgentAction[]) {
  const explicitlyRequestsFont = /\b(?:font\w*|p[ií]sm\w*|typograf\w*|typeface|Roboto|Arial|Manrope|Space Grotesk|DM Sans)\b/i.test(prompt);
  if (!explicitlyRequestsFont && actions.some(action => action.type === "appearance" && action.patch.font !== undefined)) {
    throw new Error("The AI proposed changing the font even though you did not ask for it. No changes were applied. Please try the request again.");
  }
  const asksForChartColor = /\b(?:chart|visual|graf\w*|vizual\w*)\b/i.test(prompt) && /\b(?:color|colour|barv\w*|žlut\w*|zlut\w*|yellow|blue|modr\w*|pink|růžov\w*|ruzov\w*|red|červen\w*|cerven\w*|green|zelen\w*)\b/i.test(prompt);
  const explicitlyRequestsWorkspaceAccent = /\b(?:accent|akcent|whole application|entire app|celou aplikaci|celé aplikaci|workspace accent)\b/i.test(prompt);
  if (asksForChartColor && !explicitlyRequestsWorkspaceAccent && actions.some(action => action.type === "appearance" && action.patch.accent !== undefined)) {
    throw new Error("The AI proposed changing the whole workspace accent instead of the chart color. No changes were applied. Please try the request again.");
  }
}

export function describeAgentActions(actions: AgentAction[], charts: Chart[]) {
  const descriptions = actions.map(action => {
    switch (action.type) {
      case "custom_report": return "Prepared custom report code for isolated preview";
      case "remove_custom_report": return "Restored the standard report page";
      case "report": return "Updated report pages, elements and navigation";
      case "appearance": {
        const labels: Partial<Record<keyof Appearance, string>> = {
          theme: "theme", font: "font", accent: "workspace accent", density: "spacing",
          radius: "corner roundness", showMetrics: "dashboard metrics",
        };
        return Object.entries(action.patch).map(([key, value]) => `${labels[key as keyof Appearance] ?? key}: ${String(value)}`).join(", ") || "Updated workspace appearance";
      }
      case "chart": {
        const title = charts.find(chart => chart.id === action.id)?.title ?? "visual";
        const changes = Object.entries(action.patch).map(([key, value]) => {
          if (key === "color") return `color ${String(value)}`;
          if (key === "palette") return `palette ${Array.isArray(value) ? value.join(", ") : String(value)}`;
          if (key === "kind") return `${String(value)} chart`;
          if (key === "showGrid") return value ? "grid shown" : "grid hidden";
          if (key === "showLegend") return value ? "legend shown" : "legend hidden";
          if (key === "width") return `${String(value)} width`;
          return `${key}: ${String(value)}`;
        });
        return `Updated ${title}${changes.length ? ` · ${changes.join(", ")}` : ""}`;
      }
      case "reorder": return "Reordered dashboard visuals";
      case "remove_chart": return `Removed ${charts.find(chart => chart.id === action.id)?.title ?? "a visual"}`;
      case "create_chart": return `Added ${action.kind} chart: ${action.title}`;
      case "query": return `Updated the query for ${charts.find(chart => chart.id === action.id)?.title ?? "a visual"}`;
      case "filters": return "Updated dashboard filters";
      case "model": return "Updated model relationships";
      case "dashboard": return `Renamed the dashboard to ${action.title}`;
      case "view": return `Opened ${action.view}`;
      case "period": return `Changed the date range to ${action.value}`;
    }
  });
  return descriptions.slice(0, 6).concat(descriptions.length > 6 ? [`and ${descriptions.length - 6} more`] : []);
}

export async function refreshCharts(state: EditableWorkspace, query: Query): Promise<Chart[]> {
  const sources = filterSources(state.sources, state.relationships, state.filters);
  const output: Chart[] = [];
  for (const chart of state.charts) {
    const sql = chart.templateSql ? applyPeriod(chart.templateSql, chart.dateColumn, state.dateRange) : chart.sql;
    const data = await query(sources, sql);
    if (data.length) validateChartResult(data, chart.labelKey, chart.valueKey);
    output.push({ ...chart, sql, data });
  }
  return output;
}

export async function executeAgentActions(state: EditableWorkspace, input: AgentResponse, query: Query): Promise<EditableWorkspace> {
  const response = agentResponseSchema.parse(input);
  let next: EditableWorkspace & { report: Report } = {
    ...state, appearance: { ...state.appearance }, filters: state.filters.map(f => ({ ...f, values: [...f.values] })),
    relationships: [...state.relationships], charts: state.charts.map(c => ({ ...c })),
    report: reconcileReport(state.report ?? defaultReport(state.charts), state.charts),
  };
  let refresh = false;
  let reportChanged = false;
  const find = (id: string) => {
    const chart = next.charts.find(c => c.id === id);
    if (!chart) throw new Error(`The chart "${id}" no longer exists. No changes were applied.`);
    return chart;
  };
  for (const action of response.actions) {
    switch (action.type) {
      case "custom_report":
      case "remove_custom_report": {
        const page = next.report.pages.find(page => page.id === action.pageId);
        if (!page) throw new Error("The target report page no longer exists.");
        next.report = { ...next.report, activePageId: page.id, pages: next.report.pages.map(item => item.id === page.id ? {
          ...item, custom: action.type === "custom_report" ? reviseCustomReport(item.custom, action.source) : undefined,
        } : item) };
        next.view = "dashboard";
        break;
      }
      case "report": next.report = action.report; reportChanged = true; next.view = "dashboard"; break;
      case "appearance": next.appearance = { ...next.appearance, ...action.patch }; break;
      case "chart": {
        const chart = find(action.id);
        if (action.patch.color && !action.patch.palette) chart.palette = undefined;
        Object.assign(chart, action.patch);
        break;
      }
      case "dashboard": next.title = action.title; break;
      case "view": next.view = action.view; break;
      case "period": next.dateRange = action.value; refresh = true; break;
      case "filters":
        validateFilters(action.filters, next.sources);
        next.filters = action.filters; refresh = true; break;
      case "model":
        next.relationships = validateModel({ relationships: action.relationships }, next.sources).relationships;
        for (const chart of next.charts) {
          if (chart.templateSql) {
            const spec = planChart(chart.prompt ?? chart.title, next.sources, next.relationships, next.dateRange);
            chart.templateSql = spec.templateSql; chart.dateColumn = spec.dateColumn; chart.sql = spec.sql;
          }
        }
        refresh = true; break;
      case "reorder":
        if (action.ids.length !== next.charts.length || new Set(action.ids).size !== next.charts.length) throw new Error("The new chart order must contain every chart exactly once.");
        next.charts = action.ids.map(id => find(id));
        next.report = orderReportCharts(next.report, action.ids); break;
      case "remove_chart": find(action.id); next.charts = next.charts.filter(c => c.id !== action.id); break;
      case "query":
        if (!isReadOnlyQuery(action.sql)) throw new Error("The AI proposed a query outside the read-only query policy.");
        Object.assign(find(action.id), { sql: action.sql, templateSql: undefined, dateColumn: undefined, subtitle: "AI SQL · period filter is defined in the query" });
        refresh = true; break;
      case "create_chart":
        if (next.charts.length >= 50) throw new Error("This workspace supports up to 50 visuals. Remove a visual first.");
        if (!isReadOnlyQuery(action.sql)) throw new Error("The AI proposed a query outside the read-only query policy.");
        next.charts.push({ id: crypto.randomUUID(), title: action.title, subtitle: "AI SQL · period filter is defined in the query", sql: action.sql, kind: action.kind, format: action.format, width: action.width, labelKey: "label", valueKey: "value", data: [] });
        next.report = { ...next.report, pages: next.report.pages.map(page => page.id === next.report.activePageId ? { ...page, chartIds: [...page.chartIds, next.charts[next.charts.length - 1].id] } : page) };
        next.view = "dashboard"; refresh = true; break;
    }
  }
  next.report = reportChanged ? validateReport(next.report, next.charts) : reconcileReport(next.report, next.charts);
  if (refresh) next = { ...next, charts: await refreshCharts(next, query) };
  return next;
}

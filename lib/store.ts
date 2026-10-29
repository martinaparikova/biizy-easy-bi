"use client";

import { create } from "zustand";
import type { Appearance, Chart, DashboardFilter, DateRange, Message, Relationship, Source, View } from "./types";
import { demoRelationships, demoSources } from "./demo";
import { querySources } from "./engine";
import { planChart, validateChartResult } from "./planner";
import { validateModel } from "./model";
import { loadWorkspace, saveWorkspace } from "./storage";
import { appearanceSchema, agentResponseSchema, chartPatch, type AgentContext } from "./agent-schema";
import { defaultReport, reconcileReport, reportAIContext, validateReport, type Report } from "./report";
import { DEFAULT_APPEARANCE, describeAgentActions, executeAgentActions, refreshCharts, validateActionIntent, type EditableWorkspace } from "./agent-executor";
import { defaultRegionFilter, filterSources, validateFilters } from "./filters";
import { z } from "zod";

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function message(role: Message["role"], content: string): Message {
  return { id: crypto.randomUUID(), role, content, time: new Date().toISOString() };
}

const PINK_ACCENT = "#e6007e";
const LEGACY_ACCENTS = new Set([
  "#5367eb", "#8191ff", "#8495f4", "#bbc5fa", "#dfe4fd",
  "#a5b0fa", "#6676ed", "#7789e3", "#8391ef", "#5c73bd",
  "#6f83d5", "#7180dd", "#798eea", "#7b87bf", "#7c8bd8",
  "#8193da", "#8a98c5", "#8a9dc5", "#8a9ddb", "#91a6d6",
  "#92a0df", "#97a8eb", "#9aadd3", "#a0afc9", "#a0afcd",
  "#a0afd6", "#a9b8d9",
]);

function normalizeAccent(color: string | undefined) {
  return color && LEGACY_ACCENTS.has(color.toLowerCase()) ? PINK_ACCENT : color;
}

type Snapshot = {
  version: 2; sources: Source[]; relationships: Relationship[]; charts: Chart[];
  messages: Message[]; dateRange: DateRange; title: string;
  appearance?: Appearance; filters?: DashboardFilter[];
  report?: Report;
};
type StoredSnapshot = Omit<Snapshot, "version"> & { version: 1 | 2 };
type Workspace = Omit<Snapshot, "version" | "appearance" | "filters"> & {
  appearance: Appearance; filters: DashboardFilter[];
  aiStatus: "checking" | "configured" | "missing" | "error"; aiConsent: boolean;
  aiProvider: "openai" | "ollama" | "claude-code"; aiModel: string;
  undoState: EditableWorkspace | null; lastActions: string[];
  setAppearance: (patch: Partial<Appearance>) => void;
  setFilters: (filters: DashboardFilter[]) => Promise<void>;
  setAiConsent: (enabled: boolean) => void;
  setReport: (report: Report) => void;
  openReportPage: (id: string) => void;
  undo: () => Promise<void>;
  view: View; developerMode: boolean; initialized: boolean; busy: boolean;
  engineStatus: "starting" | "ready" | "error"; notice: string; persistenceError: string;
  setView: (view: View) => void;
  setDeveloperMode: (enabled: boolean) => void;
  notify: (notice: string) => void;
  send: (prompt: string) => Promise<void>;
  addSqlChart: (input: { title: string; sql: string; kind: Chart["kind"]; format: Chart["format"] }) => Promise<void>;
  addSource: (source: Source) => Promise<void>;
  removeSource: (id: string) => Promise<void>;
  setModel: (input: unknown) => Promise<void>;
  refresh: (range?: DateRange) => Promise<void>;
  updateChart: (id: string, patch: z.infer<typeof chartPatch>) => void;
  runChartSql: (id: string, sql: string) => Promise<void>;
  removeChart: (id: string) => void;
  moveChart: (id: string, offset: number) => void;
  setTitle: (title: string) => void;
};

export const useWorkspace = create<Workspace>((set, get) => ({
  sources: demoSources(), relationships: demoRelationships, charts: [], messages: [],
  appearance: DEFAULT_APPEARANCE, filters: defaultRegionFilter(demoSources()),
  report: defaultReport([]),
  aiStatus: "checking", aiConsent: false, undoState: null, lastActions: [],
  aiProvider: "openai", aiModel: "",
  dateRange: "all", title: "Sales overview", view: "dashboard", developerMode: false,
  initialized: false, busy: false, engineStatus: "starting", notice: "", persistenceError: "",
  setView: view => set({ view }),
  setDeveloperMode: developerMode => set({ developerMode }),
  notify: notice => set({ notice }),
  setTitle: title => {
    if (get().busy) return;
    set({ title: title.trim() || "Untitled dashboard", undoState: null });
  },
  setAppearance: patch => {
    if (get().busy) return;
    set({ appearance: appearanceSchema.parse({ ...get().appearance, ...patch }), undoState: null });
  },
  setAiConsent: aiConsent => set({ aiConsent }),
  setReport: report => {
    if (get().busy) throw new Error("Wait for the current task before editing the report.");
    set({ report: validateReport(report, get().charts), undoState: null });
  },
  openReportPage: id => {
    const report = get().report ?? defaultReport(get().charts);
    if (!report.pages.some(page => page.id === id)) { set({ notice: "This report page no longer exists." }); return; }
    if (get().busy) return;
    set({ report: { ...report, activePageId: id } });
  },
  async setFilters(filters) {
    if (get().busy) throw new Error("Wait for the current task to finish before changing filters.");
    validateFilters(filters, get().sources);
    set({ busy: true });
    try {
      const charts = await refreshCharts({ ...get(), filters }, querySources);
      set({ filters, charts, undoState: null, notice: "Filters applied to connected tables." });
    } finally { set({ busy: false }); }
  },
  async undo() {
    if (get().busy || !get().undoState) return;
    const previous = get().undoState!;
    set({ busy: true });
    try {
      const charts = await refreshCharts(previous, querySources);
      set({ ...previous, charts, undoState: null, lastActions: [], notice: "Last AI change undone." });
    } catch (error) { set({ notice: `Couldn't undo the change. ${errorText(error)}` }); }
    finally { set({ busy: false }); }
  },
  async send(prompt) {
    if (get().busy || !prompt.trim()) return;
    set({ busy: true, messages: [...get().messages, message("user", prompt.trim())] });
    try {
      if (get().aiStatus !== "configured") {
        const provider = get().aiProvider;
        throw new Error(provider === "ollama" ? `Start Ollama and install ${get().aiModel || "the configured model"}, then refresh this page. No paid API is needed.` :
          provider === "claude-code" ? "Sign in to Claude Code with `claude auth login`, then refresh this page." :
          "Set OPENAI_API_KEY or choose AI_PROVIDER=ollama for local testing, then restart the server and refresh.");
      }
      if (!get().aiConsent) throw new Error("Enable AI context access in the assistant first. Your messages, table/column names, dashboard settings and custom report code are included; data rows, query results and SQL are not included.");
      const state = get();
      const context: AgentContext = {
        prompt: prompt.trim(),
        history: state.messages.slice(-13, -1).map(m => ({ role: m.role, content: m.content.slice(0, 4000) })),
        workspace: {
          title: state.title, view: state.view, appearance: state.appearance, dateRange: state.dateRange,
          report: reportAIContext(reconcileReport(state.report ?? defaultReport(state.charts), state.charts)),
          sources: state.sources.map(s => ({ table: s.table, columns: s.columns })),
          relationships: state.relationships, filters: state.filters,
          charts: state.charts.map(c => ({ id: c.id, title: c.title, kind: c.kind, width: c.width, color: c.color, palette: c.palette, showGrid: c.showGrid, showLegend: c.showLegend, height: c.height, radius: c.radius })),
        },
      };
      const timeout = state.aiProvider === "ollama" ? 250000 : state.aiProvider === "claude-code" ? 185000 : 70000;
      const response = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(context), signal: AbortSignal.timeout(timeout) });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : `Assistant returned HTTP ${response.status}.`);
      const result = agentResponseSchema.parse(body);
      validateActionIntent(prompt, result.actions);
      const previous = editableSnapshot(state);
      const next = await executeAgentActions(previous, result, querySources);
      const changes = describeAgentActions(result.actions, state.charts);
      set({ ...next, undoState: result.actions.length ? previous : state.undoState, lastActions: result.actions.map(action => action.type), messages: [...get().messages, message("assistant", `${result.message}${changes.length ? `\n\nChanges:\n${changes.map(change => `· ${change}`).join("\n")}\n\nYou can undo this change.` : ""}`)] });
    } catch (error) {
      set({ messages: [...get().messages, message("assistant", `No changes were applied. ${errorText(error)}`)] });
    } finally { set({ busy: false }); }
  },
  async addSource(source) {
    if (get().busy) throw new Error("Wait for the current task to finish before connecting data.");
    set({ busy: true });
    try {
      const sources = [...get().sources, source];
      await querySources(sources, `SELECT COUNT(*) AS rows FROM "${source.table}"`);
      set({
        sources, engineStatus: "ready", undoState: null,
        messages: [...get().messages, message("assistant", `Connected ${source.name}: ${source.rows.length.toLocaleString()} rows and ${source.columns.length} columns. Parquet conversion is simulated; your actual rows are loaded in DuckDB. Open Semantic model to review matching keys, or ask for a chart using these columns.`)],
        notice: `${source.name} connected`,
      });
    } finally { set({ busy: false }); }
  },
  async removeSource(id) {
    if (get().busy) throw new Error("Wait for the current task to finish before removing data.");
    const removed = get().sources.find(s => s.id === id);
    if (!removed) throw new Error("This source no longer exists.");
    const sources = get().sources.filter(s => s.id !== id);
    const relationships = get().relationships.filter(r => r.fromTable !== removed.table && r.toTable !== removed.table);
    set({ sources, relationships, filters: get().filters.filter(f => f.table !== removed.table), charts: [], undoState: null, notice: "Source removed. Charts were cleared to prevent showing stale data." });
  },
  async setModel(input) {
    if (get().busy) throw new Error("Wait for the current task to finish before editing the model.");
    const { relationships } = validateModel(input, get().sources);
    set({ busy: true });
    try {
      const charts: Chart[] = [];
      const removed: string[] = [];
      for (const chart of get().charts) {
        let spec: Omit<Chart, "data"> | undefined;
        if (chart.templateSql) {
          try { spec = planChart(chart.prompt ?? chart.title, get().sources, relationships, get().dateRange); }
          catch (error) { removed.push(`"${chart.title}": ${errorText(error)}`); continue; }
        }
        const data = await querySources(filterSources(get().sources, relationships, get().filters), spec?.sql ?? chart.sql);
        if (data.length) validateChartResult(data, chart.labelKey, chart.valueKey);
        charts.push({ ...chart, sql: spec?.sql ?? chart.sql, templateSql: spec?.templateSql ?? chart.templateSql, dateColumn: spec?.dateColumn ?? chart.dateColumn, data });
      }
      set({ relationships, charts, undoState: null, engineStatus: "ready", notice: removed.length ? `Model saved. Removed dependent charts that can no longer be joined: ${removed.join(" ")}` : "Relationships saved. Existing charts refreshed." });
    } finally { set({ busy: false }); }
  },
  async refresh(range) {
    if (get().busy) throw new Error("Wait for the current task to finish before refreshing.");
    const dateRange = range ?? get().dateRange;
    set({ busy: true });
    try {
      const charts = await refreshCharts({ ...get(), dateRange }, querySources);
      if (!get().charts.length && get().sources.length) await querySources(get().sources, "SELECT 1 AS ready");
      set({ charts, dateRange, undoState: null, engineStatus: "ready", notice: "Dashboard is up to date" });
    } catch (error) {
      set({ notice: `Couldn't refresh the dashboard. The previous data and date range are unchanged. ${errorText(error)}` });
      throw error;
    } finally { set({ busy: false }); }
  },
  updateChart(id, patch) {
    if (get().busy) return;
    const validated = chartPatch.parse(patch);
    if (!get().charts.some(chart => chart.id === id)) { set({ notice: "This chart no longer exists." }); return; }
    set({ charts: get().charts.map(c => c.id === id ? { ...c, ...(validated.color && !validated.palette ? { palette: undefined } : {}), ...validated } : c), undoState: null });
  },
  async runChartSql(id, sql) {
    if (get().busy) throw new Error("Wait for the current task to finish before running SQL.");
    const chart = get().charts.find(c => c.id === id);
    if (!chart) throw new Error("This chart no longer exists.");
    set({ busy: true });
    try {
      const data = await querySources(filterSources(get().sources, get().relationships, get().filters), sql);
      validateChartResult(data, chart.labelKey, chart.valueKey);
      set({ charts: get().charts.map(c => c.id === id ? { ...c, sql, templateSql: undefined, dateColumn: undefined, subtitle: "Custom SQL · date filter not applied", data } : c), undoState: null, notice: "Query applied", engineStatus: "ready" });
    } finally { set({ busy: false }); }
  },
  async addSqlChart(input) {
     if (get().busy) throw new Error("Wait for the current task to finish before adding a chart.");
     const title = input.title.trim();
     if (!title || title.length > 200) throw new Error("Enter a chart title between 1 and 200 characters.");
     set({ busy: true });
     try {
       const state = get();
       const data = await querySources(filterSources(state.sources, state.relationships, state.filters), input.sql);
       validateChartResult(data, "label", "value");
       const chart: Chart = {
         id: crypto.randomUUID(), title, subtitle: "Custom SQL · date filter not applied",
         kind: input.kind, sql: input.sql, data, labelKey: "label", valueKey: "value",
         format: input.format, width: "half",
       };
       const report = reconcileReport(state.report ?? defaultReport(state.charts), state.charts);
       set({ charts: [...get().charts, chart], report: { ...report, pages: report.pages.map(page => page.id === report.activePageId ? { ...page, chartIds: [...page.chartIds, chart.id] } : page) }, undoState: null, notice: "SQL chart added", engineStatus: "ready" });
     } finally { set({ busy: false }); }
  },
  removeChart(id) {
    if (get().busy) return;
    const charts = get().charts.filter(c => c.id !== id);
    set({ charts, report: reconcileReport(get().report ?? defaultReport(charts), charts), undoState: null });
  },
  moveChart(id, offset) {
    if (get().busy) return;
    const report = reconcileReport(get().report ?? defaultReport(get().charts), get().charts);
    const page = report.pages.find(page => page.id === report.activePageId);
    if (!page) { set({ notice: "This report page no longer exists." }); return; }
    const ids = [...page.chartIds], index = ids.indexOf(id), target = index + offset;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    const visible = ids.map(id => get().charts.find(chart => chart.id === id)).filter((chart): chart is Chart => chart !== undefined);
    let next = 0;
    const charts = get().charts.map(chart => ids.includes(chart.id) ? visible[next++] : chart);
    set({ charts, report: { ...report, pages: report.pages.map(item => item.id === page.id ? { ...item, chartIds: ids } : item) }, undoState: null });
  },
}));

let initialization: Promise<void> | undefined;

function snapshot(): Snapshot {
  const { sources, relationships, charts, messages, dateRange, title, appearance, filters, report } = useWorkspace.getState();
  return { version: 2, sources, relationships, charts, messages: messages.slice(-100), dateRange, title, appearance, filters, report: reconcileReport(report ?? defaultReport(charts), charts) };
}

function editableSnapshot(state: Workspace): EditableWorkspace {
  const { sources, relationships, charts, dateRange, title, appearance, filters, view, report } = state;
  return { sources, relationships, charts, dateRange, title, appearance, filters, view, report };
}

function isSnapshot(value: unknown): value is StoredSnapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (v.version === 1 || v.version === 2) && Array.isArray(v.sources) && Array.isArray(v.relationships) &&
    Array.isArray(v.charts) && Array.isArray(v.messages) && typeof v.title === "string" &&
    ["all", "q1", "q2"].includes(String(v.dateRange));
}

export function initializeWorkspace() {
  if (initialization) return initialization;
  initialization = (async () => {
    void fetch("/api/assistant").then(async response => {
      if (!response.ok) throw new Error("Couldn't check the AI configuration.");
      const value = z.object({ configured: z.boolean(), provider: z.enum(["openai", "ollama", "claude-code"]).default("openai"), model: z.string(), error: z.string().optional() }).parse(await response.json());
      useWorkspace.setState({ aiStatus: value.configured ? "configured" : "missing", aiProvider: value.provider, aiModel: value.model });
      if (value.error) useWorkspace.setState({ notice: value.error });
    }).catch(error => useWorkspace.setState({ aiStatus: "error", notice: errorText(error) }));
    let saved: unknown;
    try {
      saved = await loadWorkspace();
      if (saved !== undefined && !isSnapshot(saved)) throw new Error("The saved workspace format is unsupported.");
      if (isSnapshot(saved)) {
        validateModel({ relationships: saved.relationships }, saved.sources);
        const savedAppearance = saved.appearance ? appearanceSchema.parse(saved.appearance) : DEFAULT_APPEARANCE;
        const appearance = {
          ...savedAppearance,
          font: saved.version === 1 && savedAppearance.font === "Roboto" ? "Space Grotesk" : savedAppearance.font,
          accent: normalizeAccent(savedAppearance.accent) ?? PINK_ACCENT,
        };
        const filters = saved.filters ?? defaultRegionFilter(saved.sources);
        validateFilters(filters, saved.sources);
        const report = saved.report ? validateReport(saved.report, saved.charts) : defaultReport(saved.charts);
        useWorkspace.setState({ ...saved, charts: saved.charts.map(chart => ({ ...chart, color: normalizeAccent(chart.color) })), appearance, filters, report });
      }
    } catch (error) {
      useWorkspace.setState({ persistenceError: `Couldn't restore your saved workspace. ${errorText(error)}` });
    }
    useWorkspace.setState({ busy: true });
    try {
      const state = useWorkspace.getState();
      await querySources(state.sources, "SELECT 1 AS ready");
      if (isSnapshot(saved)) {
        const charts: Chart[] = [];
        for (const chart of state.charts) {
          const spec = chart.templateSql ? planChart(chart.prompt ?? chart.title, state.sources, state.relationships, state.dateRange) : undefined;
          const sql = spec?.sql ?? chart.sql;
          const data = await querySources(filterSources(state.sources, state.relationships, state.filters), sql);
          if (data.length) validateChartResult(data, chart.labelKey, chart.valueKey);
          charts.push({ ...chart, color: normalizeAccent(chart.color), sql, templateSql: spec?.templateSql ?? chart.templateSql, data });
        }
        useWorkspace.setState({ charts });
      } else {
        const charts: Chart[] = [];
        for (const prompt of ["sales by region", "revenue by month", "revenue by category as donut"]) {
          const spec = planChart(prompt, state.sources, state.relationships, "all");
          const data = await querySources(state.sources, spec.sql);
          validateChartResult(data, spec.labelKey, spec.valueKey);
          charts.push({ ...spec, data, width: prompt.includes("region") ? "full" : "half" });
        }
        useWorkspace.setState({
          charts, report: defaultReport(charts),
          messages: [message("assistant", "Your sample dashboard is ready. I can edit its appearance, chart order, styles, filters, queries and relationships. Enable AI context access to start. Local Ollama needs no paid API; OpenAI is optional. Try: 'Move Sales by region to the top, use Roboto, and add a region filter.'")],
        });
      }
      useWorkspace.setState({ engineStatus: "ready" });
    } catch (error) {
      useWorkspace.setState({ engineStatus: "error", notice: `DuckDB couldn't start. ${errorText(error)} Refresh to retry.`, charts: [] });
    } finally {
      useWorkspace.setState({ busy: false, initialized: true });
    }
    let saving = Promise.resolve();
    const persist = () => {
      const value = snapshot();
      saving = saving.then(() => saveWorkspace(value)).catch(error => {
        useWorkspace.setState({ persistenceError: `Changes couldn't be saved on this device. ${errorText(error)}` });
      });
    };
    if (!useWorkspace.getState().persistenceError) persist();
    useWorkspace.subscribe((state, previous) => {
      if (state.sources !== previous.sources || state.relationships !== previous.relationships || state.charts !== previous.charts ||
          state.messages !== previous.messages || state.title !== previous.title || state.dateRange !== previous.dateRange ||
          state.appearance !== previous.appearance || state.filters !== previous.filters || state.report !== previous.report) persist();
    });
  })();
  return initialization;
}

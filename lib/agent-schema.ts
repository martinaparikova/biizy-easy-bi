import { z } from "zod";
import { reportSchema } from "./report";
import { customSourceSchema } from "./custom-report";

const text = z.string().min(1).max(200);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
export const appearanceSchema = z.object({
  theme: z.enum(["dark", "light"]),
  font: z.enum(["Roboto", "DM Sans", "Manrope", "Space Grotesk", "Arial"]),
  accent: color,
  density: z.enum(["comfortable", "compact"]),
  radius: z.number().int().min(0).max(24),
  showMetrics: z.boolean(),
});
const filterSchema = z.object({
  id: text, label: text, table: text, column: text, values: z.array(z.string().max(300)).max(100),
}).strict();
const relationshipSchema = z.object({
  id: text, fromTable: text, fromColumn: text, toTable: text, toColumn: text,
}).strict();
export const chartPatch = z.object({
  title: text.optional(), subtitle: z.string().max(300).optional(),
  kind: z.enum(["bar", "line", "donut"]).optional(),
  width: z.enum(["half", "full"]).optional(), color: color.optional(),
  palette: z.array(color).min(2).max(12).optional(),
  showGrid: z.boolean().optional(), showLegend: z.boolean().optional(),
  height: z.number().int().min(160).max(600).optional(),
  radius: z.number().int().min(0).max(24).optional(),
  format: z.enum(["currency", "number"]).optional(),
}).strict();

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("custom_report"), pageId: text, source: customSourceSchema }).strict(),
  z.object({ type: z.literal("remove_custom_report"), pageId: text }).strict(),
  z.object({ type: z.literal("report"), report: reportSchema }).strict(),
  z.object({ type: z.literal("appearance"), patch: appearanceSchema.partial().strict() }).strict(),
  z.object({ type: z.literal("chart"), id: text, patch: chartPatch }).strict(),
  z.object({ type: z.literal("reorder"), ids: z.array(text).max(50) }).strict(),
  z.object({ type: z.literal("remove_chart"), id: text }).strict(),
  z.object({ type: z.literal("create_chart"), title: text, sql: z.string().min(1).max(12000), kind: z.enum(["bar", "line", "donut"]), format: z.enum(["currency", "number"]), width: z.enum(["half", "full"]) }).strict(),
  z.object({ type: z.literal("query"), id: text, sql: z.string().min(1).max(12000) }).strict(),
  z.object({ type: z.literal("filters"), filters: z.array(filterSchema).max(12) }).strict(),
  z.object({ type: z.literal("model"), relationships: z.array(relationshipSchema).max(50) }).strict(),
  z.object({ type: z.literal("dashboard"), title: text }).strict(),
  z.object({ type: z.literal("view"), view: z.enum(["dashboard", "sources", "model"]) }).strict(),
  z.object({ type: z.literal("period"), value: z.enum(["all", "q1", "q2"]) }).strict(),
]);
export const agentResponseSchema = z.object({
  message: z.string().min(1).max(4000), actions: z.array(actionSchema).max(30),
}).strict();

export const agentContextSchema = z.object({
  prompt: z.string().min(1).max(4000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }).strict()).max(12),
  workspace: z.object({
    title: text, view: z.enum(["dashboard", "sources", "model"]), appearance: appearanceSchema,
    dateRange: z.enum(["all", "q1", "q2"]),
    report: reportSchema.optional(),
    sources: z.array(z.object({ table: text, columns: z.array(z.object({ name: text, type: z.enum(["number", "text", "boolean"]) }).strict()).max(200) }).strict()).max(30),
    charts: z.array(z.object({ id: text, title: text, kind: z.enum(["bar", "line", "donut"]), width: z.enum(["half", "full"]), color: color.optional(), palette: z.array(color).min(2).max(12).optional(), showGrid: z.boolean().optional(), showLegend: z.boolean().optional(), height: z.number().optional(), radius: z.number().optional() }).strict()).max(50),
    relationships: z.array(relationshipSchema).max(50), filters: z.array(filterSchema).max(12),
  }).strict(),
}).strict();
export type AgentAction = z.infer<typeof actionSchema>;
export type AgentResponse = z.infer<typeof agentResponseSchema>;
export type AgentContext = z.infer<typeof agentContextSchema>;

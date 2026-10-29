export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell>;
export type View = "dashboard" | "sources" | "model";
export type ChartKind = "bar" | "line" | "donut";
export type Column = { name: string; type: "number" | "text" | "boolean" };
export type Source = {
  id: string;
  name: string;
  table: string;
  kind: "sql" | "csv" | "excel";
  description: string;
  columns: Column[];
  rows: Row[];
};
export type Relationship = {
  id: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
};
export type Chart = {
  id: string;
  title: string;
  subtitle: string;
  kind: ChartKind;
  sql: string;
  templateSql?: string;
  dateColumn?: string;
  prompt?: string;
  data: Row[];
  labelKey: string;
  valueKey: string;
  format: "currency" | "number";
  width: "half" | "full";
  color?: string;
  palette?: string[];
  showGrid?: boolean;
  showLegend?: boolean;
  height?: number;
  radius?: number;
};
export type Message = {
  id: string;
  role: "assistant" | "user";
  content: string;
  time: string;
};
export type DateRange = "all" | "q1" | "q2";
export type SemanticModel = { relationships: Relationship[] };
export type Appearance = {
  theme: "dark" | "light";
  font: "Roboto" | "DM Sans" | "Manrope" | "Space Grotesk" | "Arial";
  accent: string;
  density: "comfortable" | "compact";
  radius: number;
  showMetrics: boolean;
};
export type DashboardFilter = {
  id: string;
  label: string;
  table: string;
  column: string;
  values: string[];
};

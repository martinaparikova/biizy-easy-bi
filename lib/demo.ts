import type { Source, Relationship } from "./types";

const regions = ["North America", "Europe", "Asia Pacific", "Latin America"];
const products = ["Software", "Services", "Hardware"];
const channels = ["Direct", "Partner", "Online"];

export function demoSources(): Source[] {
  const rows = Array.from({ length: 720 }, (_, i) => {
    const month = (i % 6) + 1;
    const region = Math.floor(i / 6) % 4;
    const category = Math.floor(i / 24) % 3;
    const amount = Math.round((730 + ((i * 137) % 2500)) * (1 + month * 0.12) * [1.45, 1.15, 0.9, 0.65][region]);
    return {
      Order_ID: `ORD-${10001 + i}`,
      Order_Date: `2026-${String(month).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`,
      Region_ID: region + 1,
      Category: products[category],
      Channel: channels[Math.floor(i / 72) % 3],
      Revenue: amount,
      Profit: Math.round(amount * (0.18 + category * 0.065)),
      Customer_ID: `CUS-${100 + (i % 186)}`,
    };
  });
  return [
    {
      id: "demo-sales", name: "Sales warehouse", table: "sales", kind: "sql",
      description: "Demo PostgreSQL · orders, Jan–Jun 2026", rows,
      columns: [
        { name: "Order_ID", type: "text" }, { name: "Order_Date", type: "text" },
        { name: "Region_ID", type: "number" }, { name: "Category", type: "text" },
        { name: "Channel", type: "text" }, { name: "Revenue", type: "number" },
        { name: "Profit", type: "number" }, { name: "Customer_ID", type: "text" },
      ],
    },
    {
      id: "demo-regions", name: "Region lookup.csv", table: "regions", kind: "csv",
      description: "Demo file · regional names and targets",
      columns: [{ name: "Region_ID", type: "number" }, { name: "Region", type: "text" }, { name: "Target", type: "number" }],
      rows: regions.map((Region, i) => ({ Region_ID: i + 1, Region, Target: [1000000, 800000, 650000, 450000][i] })),
    },
  ];
}

export const demoRelationships: Relationship[] = [
  { id: "sales-regions", fromTable: "sales", fromColumn: "Region_ID", toTable: "regions", toColumn: "Region_ID" },
];

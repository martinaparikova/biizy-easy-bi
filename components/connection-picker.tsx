"use client";

import { useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

const connectors = [
  { category: "Databases", names: ["PostgreSQL", "MySQL", "Microsoft SQL Server", "SQLite", "Oracle", "MariaDB", "MongoDB"] },
  { category: "Warehouses", names: ["Snowflake", "Google BigQuery", "Amazon Redshift", "Databricks", "Microsoft Fabric", "Azure Synapse", "ClickHouse"] },
  { category: "Files & storage", names: ["Amazon S3", "Azure Blob Storage", "Google Cloud Storage", "Google Sheets", "OneDrive", "SharePoint"] },
  { category: "Apps & APIs", names: ["REST API", "Salesforce", "HubSpot", "Shopify", "Stripe", "Google Analytics"] },
];

export function ConnectionPicker({ open, onOpenChange, onSelect }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: () => void;
}) {
  const [search, setSearch] = useState("");
  const groups = connectors.map(group => ({
    ...group, names: group.names.filter(name => name.toLowerCase().includes(search.toLowerCase().trim())),
  })).filter(group => group.names.length);
  return <Dialog open={open} onOpenChange={value => { onOpenChange(value); if (!value) setSearch(""); }}>
    <DialogContent className="modal-wide connection-picker">
      <DialogHeader>
        <DialogTitle>Connect</DialogTitle>
        <DialogDescription>PostgreSQL demo is available now. Other connectors are not implemented yet.</DialogDescription>
      </DialogHeader>
      <label className="connector-search"><Search size={15} /><input aria-label="Search connections" placeholder="Search connections" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <div className="connector-options">
        {groups.map(group => <section key={group.category}>
          <h3>{group.category}</h3>
          <div>{group.names.map(name => {
            const enabled = name === "PostgreSQL";
            return <button key={name} disabled={!enabled} onClick={() => { onOpenChange(false); setSearch(""); onSelect(); }}>
              <span>{name}</span><small>{enabled ? "Demo" : "Not available"}</small>{enabled && <ArrowRight size={14} />}
            </button>;
          })}</div>
        </section>)}
        {!groups.length && <p className="muted-note">No matching connections. Try a database or service name.</p>}
      </div>
    </DialogContent>
  </Dialog>;
}

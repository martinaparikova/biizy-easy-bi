"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { ArrowUpRight, BarChart3, ChevronRight, Code2, Database, GitBranch, Layers, MessageSquare, Moon, Sun, PanelRightClose, PanelRightOpen, Sparkles, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { initializeWorkspace, useWorkspace } from "@/lib/store";
import type { View } from "@/lib/types";
import { Assistant } from "./assistant";
import { Dashboard } from "./dashboard";
import { SemanticModel } from "./semantic-model";
import { Sources } from "./sources";
import { BrandMark } from "./brand-mark";

const views: { id: View; title: string; icon: typeof Database }[] = [
  { id: "sources", title: "Data sources", icon: Database },
  { id: "model", title: "Semantic model", icon: GitBranch },
  { id: "dashboard", title: "Dashboard", icon: BarChart3 },
];

export function Workspace() {
  const { view, setView, developerMode, setDeveloperMode, engineStatus, sources, initialized, notice, notify, persistenceError, appearance, setAppearance } = useWorkspace();
  const [assistant, setAssistant] = useState(true);
  const [assistantWidth, setAssistantWidth] = useState(380);
  const [mobileAssistant, setMobileAssistant] = useState(false);
  const [help, setHelp] = useState(false);
  useEffect(() => { void initializeWorkspace(); }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = appearance.theme;
    root.dataset.density = appearance.density;
    root.style.setProperty("--workspace-font", `"${appearance.font}", sans-serif`);
    root.style.setProperty("--primary", appearance.accent);
    root.style.setProperty("--workspace-radius", `${appearance.radius}px`);
  }, [appearance]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => notify(""), 7000);
    return () => clearTimeout(timer);
  }, [notice, notify]);
  return (
    <div className={`app-shell ${assistant ? "" : "assistant-hidden"} ${mobileAssistant ? "mobile-assistant-open" : ""}`} style={{ "--assistant-width": `${assistantWidth}px` } as CSSProperties & { "--assistant-width": string }}>
      <header className="app-header">
        <button className="brand" onClick={() => setView("dashboard")} aria-label="Biizy home">
          <BrandMark /><span className="brand-wordmark"><strong>Biizy</strong><span>Build reports by asking.</span></span>
        </button>
        <div className="workspace-breadcrumb">
          <span className="workspace-mini-icon"><Layers size={13} /></span>
          <span>My workspace</span><ChevronRight size={12} />
          <strong>Retail analytics</strong><span className="header-demo-badge">DEMO</span>
        </div>
        <div className="app-header-actions">
          <button className="theme-button" aria-label={appearance.theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} onClick={() => setAppearance({ theme: appearance.theme === "dark" ? "light" : "dark" })}>
            {appearance.theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <div className="developer-toggle">
            <Code2 size={14} /><span>Developer mode</span>
            <Switch aria-label="Developer mode" checked={developerMode} onCheckedChange={setDeveloperMode} size="sm" />
          </div>
          <span className="header-divider" />
          <button className="avatar" onClick={() => setHelp(true)} aria-label="Workspace information">JD</button>
        </div>
      </header>
      <div className="workspace-main"><div className="workspace-nav"><div className="view-tabs" aria-label="Workspace views">{views.map(item => <button key={item.id} className={view === item.id ? "selected" : ""} onClick={() => setView(item.id)} aria-current={view === item.id ? "page" : undefined}><item.icon size={15} />{item.title}{item.id === "sources" && <span>{sources.length}</span>}</button>)}</div><div className="workspace-status"><span className={`engine-indicator ${engineStatus}`} />{engineStatus === "ready" ? "Engine ready" : engineStatus === "error" ? "Engine needs attention" : "Starting engine"}<button aria-label={assistant ? "Hide assistant" : "Show assistant"} title={assistant ? "Hide assistant" : "Show assistant"} onClick={() => setAssistant(!assistant)}>{assistant ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}</button></div></div><main className="workspace-content">
        {persistenceError && <div className="error-banner" role="alert">{persistenceError} Your workspace is available for this session.</div>}
        {view === "dashboard" && <Dashboard />}
        {view === "sources" && <Sources />}
        {view === "model" && <SemanticModel />}
      </main></div>
      {(assistant || mobileAssistant) && <Assistant width={assistantWidth} onResize={width => setAssistantWidth(Math.max(320, Math.min(560, window.innerWidth - 560, width)))} />}
      {!assistant && <button className="assistant-reopen" onClick={() => setAssistant(true)}><Sparkles size={17} />Ask your data</button>}
      <button className="mobile-assistant-toggle" aria-label={mobileAssistant ? "Hide assistant" : "Show assistant"} onClick={() => setMobileAssistant(!mobileAssistant)}><MessageSquare size={18} /></button>
      {notice && <div className={`toast ${notice.toLowerCase().includes("couldn't") ? "toast-error" : ""}`} role="status"><span>{notice}</span><button aria-label="Dismiss notification" onClick={() => notify("")}><X size={15} /></button></div>}
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="modal-wide">
          <DialogHeader>
            <DialogTitle>Build your workspace by asking.</DialogTitle>
            <DialogDescription>Connect data locally, then use Ollama or OpenAI to edit your dashboard through validated actions.</DialogDescription>
          </DialogHeader>
          <div className="help-steps">
            <div><Database /><strong>Connect</strong><p>Import CSV/XLSX or use the SQL demo. Files are limited to 5 MB and 20,000 rows.</p></div>
            <div><GitBranch /><strong>Make connections</strong><p>Drag matching keys together or ask the assistant to edit the relationships.</p></div>
            <div><BarChart3 /><strong>Shape your dashboard</strong><p>Ask in Czech or English to move charts, change their style, choose fonts and themes, or add filters. Use Undo to revert the last AI batch.</p></div>
          </div>
          <div className="inline-info"><Sparkles size={16} />Choose AI_PROVIDER=ollama for local testing without credits, or configure OpenAI. Enable context access in the assistant. SQL connections and Parquet conversion remain simulated.</div>
          <p className="muted-note">AI receives your messages, schema names, dashboard settings and custom report code, not data rows, results or existing SQL. Ollama runs locally; cloud providers receive this context. Custom JavaScript runs in an isolated preview worker, not in the application. Your workspace saves in this browser; embeds show public samples only.</p>
          <Button onClick={() => { setHelp(false); setView("sources"); }} disabled={!initialized}><ArrowUpRight />Connect your own data</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

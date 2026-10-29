"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowUpRight, ChevronDown, Database, LoaderCircle, Sparkles, Undo2 } from "lucide-react";
import { useWorkspace } from "@/lib/store";

const suggestions = ["Posuň Sales by region na první místo", "Změň grafy na modré a skryj mřížku", "Přidej filtr na region"];

export function Assistant({ width, onResize }: { width: number; onResize: (width: number) => void }) {
  const { messages, send, busy, initialized, sources, aiStatus, aiConsent, setAiConsent, undoState, undo, lastActions, aiProvider, aiModel } = useWorkspace();
  const local = aiProvider === "ollama";
  const claude = aiProvider === "claude-code";
  const providerLabel = local ? "Local Ollama" : claude ? "Claude Code" : "OpenAI";
  const [input, setInput] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages, busy]);

  function submit(value = input) {
    if (!value.trim() || busy || !initialized) return;
    setInput("");
    void send(value);
  }

  return (
    <aside className="assistant-panel" aria-label="AI assistant">
      <div
        className="assistant-resize-handle"
        role="separator"
        aria-label="Resize AI assistant"
        aria-orientation="vertical"
        aria-valuemin={320}
        aria-valuemax={560}
        aria-valuenow={Math.round(width)}
        aria-valuetext={`${Math.round(width)} pixels`}
        tabIndex={0}
        onPointerDown={event => {
          if (event.button !== 0) return;
          resizeStart.current = { x: event.clientX, width };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          if (resizeStart.current) onResize(resizeStart.current.width + resizeStart.current.x - event.clientX);
        }}
        onPointerUp={event => {
          resizeStart.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => { resizeStart.current = null; }}
        onKeyDown={event => {
          if (event.key === "ArrowLeft") { event.preventDefault(); onResize(width + 20); }
          if (event.key === "ArrowRight") { event.preventDefault(); onResize(width - 20); }
        }}
      />
      <div className="assistant-heading"><div className="assistant-orb"><Sparkles size={18} /></div><div><strong>AI assistant</strong><span><i />{aiStatus === "configured" ? `${providerLabel} · ${local ? aiModel : "configured"}` : aiStatus === "checking" ? "Checking configuration…" : aiStatus === "error" ? "Provider unavailable" : `${providerLabel} · setup required`}</span></div><span className="tiny-label">AI</span></div>
      <div className="assistant-conversation">
        {messages.length === 0 && <div className="assistant-intro"><h2>Make it yours.</h2><p>Tell your assistant what to change in your charts, filters, or dashboard.</p></div>}
        {aiStatus === "missing" && <div className="ai-setup"><strong>{local ? "Prepare local AI" : claude ? "Claude Code plan required" : "Connect OpenAI"}</strong>{local ? <p>Start Ollama and run <code>ollama pull {aiModel}</code>, then refresh. No API key or credits needed.</p> : claude ? <p>Claude Code requires a Pro/Max subscription or Anthropic API billing. To use AI for free, set <code>AI_PROVIDER=ollama</code> in <code>.env.local</code> and restart Biizy.</p> : <p>Add <code>OPENAI_API_KEY</code> to <code>.env.local</code> and restart the server. Or set <code>AI_PROVIDER=ollama</code> for local testing. Never paste a key here.</p>}</div>}
        <div className="conversation-divider"><span>YOUR WORKSPACE</span></div>
        {messages.map(message => (
          <div className={`message message-${message.role}`} key={message.id}>
            {message.role === "assistant" && <div className="message-author"><Sparkles size={13} /> Biizy assistant</div>}
            <div className="message-text">{message.content}</div>
            {message.role === "assistant" && <span className="message-time">{new Date(message.time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>}
          </div>
        ))}
        {!initialized && <div className="assistant-thinking"><LoaderCircle className="spin" size={14} /> Preparing your workspace…</div>}
        {busy && initialized && <div className="assistant-thinking"><span className="thinking-dots">•••</span>{local ? "Local model is working · CPU may take a few minutes" : claude ? "Claude is working with your workspace" : "Working with your workspace"}</div>}
        <div ref={bottom} />
      </div>
      <div className="assistant-bottom">
        {undoState && <div className="agent-receipt"><span>{lastActions.length} actions applied</span><button disabled={busy} onClick={() => void undo()}><Undo2 size={13} />Undo</button></div>}
        <label className="ai-consent"><input type="checkbox" checked={aiConsent} onChange={e => setAiConsent(e.target.checked)} /><span>{local ? "Allow local AI to use messages, schema names, selected filters, dashboard settings and custom report code. Stays on this computer; no rows or results." : claude ? "Allow sharing messages, schema names, selected filters, dashboard settings and custom report code with Anthropic via Claude Code. No rows or results." : "Allow sharing messages, schema names, selected filters, dashboard settings and custom report code with OpenAI. No rows or results."}</span></label>
        <button className="suggestion-toggle" aria-expanded={suggestionsOpen} onClick={() => setSuggestionsOpen(!suggestionsOpen)}><Sparkles size={13} />Try asking<ChevronDown size={13} /></button>
        {suggestionsOpen && <div className="suggestions">{suggestions.map(prompt => <button key={prompt} disabled={busy || !initialized} onClick={() => { setSuggestionsOpen(false); submit(prompt); }}>{prompt}<ArrowUpRight size={13} /></button>)}</div>}
        <form onSubmit={e => { e.preventDefault(); submit(); }} className="chat-composer">
          <textarea aria-label="Ask your data assistant" value={input} onChange={e => setInput(e.target.value)} placeholder="What would you like to explore?" rows={2} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} />
          <div><span><Database size={12} /> {sources.length} sources in context</span><button type="submit" aria-label="Send message" disabled={!input.trim() || busy || !initialized}><ArrowUp size={17} /></button></div>
        </form>
        <p className="assistant-disclaimer">Custom code runs in an isolated preview, not in the application.</p>
      </div>
    </aside>
  );
}

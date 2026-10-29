"use client";

import { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { Button } from "./ui/button";
import { customFrameDocument, customReportData, type CustomReport } from "@/lib/custom-report";
import { useWorkspace } from "@/lib/store";

export function CustomReportView({ source, chartIds, onError }: { source: CustomReport; chartIds: string[]; onError: (error: string) => void }) {
  const { charts, appearance } = useWorkspace();
  const dataSignature = JSON.stringify({ source, chartIds, data: customReportData(charts, appearance) });
  return <CustomReportRuntime key={dataSignature} source={source} chartIds={chartIds} onError={onError} />;
}

function CustomReportRuntime({ source, chartIds, onError }: { source: CustomReport; chartIds: string[]; onError: (error: string) => void }) {
  const { charts, appearance } = useWorkspace();
  const [session] = useState(() => ({ source, chartIds, charts, appearance }));
  const frame = useRef<HTMLIFrameElement>(null);
  const [nonce] = useState(() => crypto.randomUUID().replaceAll("-", ""));
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const lastError = useRef(onError);
  const stopPreview = useRef<() => void>(() => {});
  useEffect(() => { lastError.current = onError; }, [onError]);

  useEffect(() => {
    let stopped = false;
    let completed = false;
    const send = (message: object) => frame.current?.contentWindow?.postMessage({ channel: "biizy-host", ...message }, "*");
    const fail = (message: string) => {
      if (stopped) return;
      stopped = true;
      send({ type: "stop" });
      setError(message);
      lastError.current(message);
    };
    const timeout = setTimeout(() => {
      if (!completed) fail("Custom report did not finish starting within 10 seconds. Restore the previous version or ask AI to repair it.");
    }, 10000);
    stopPreview.current = () => {
      stopped = true;
      clearTimeout(timeout);
      send({ type: "stop" });
      setError("Preview stopped. Use Standard view or apply a new revision to restart.");
    };
    const receive = (event: MessageEvent<unknown>) => {
      if (event.source !== frame.current?.contentWindow || stopped || !event.data || typeof event.data !== "object") return;
      const message = event.data as Record<string, unknown>;
      if (message.channel !== "biizy-custom") return;
      if (message.type === "ready") {
        const data = customReportData(session.charts, session.appearance);
        data.datasets = data.datasets.filter((_, index) => session.chartIds.includes(session.charts[index].id));
        send({ type: "start", source: session.source, data });
      } else if (message.type === "error") {
        fail(typeof message.message === "string" ? message.message.slice(0, 2000) : "Custom report returned an unknown error.");
      } else if (message.type === "complete") {
        completed = true;
        clearTimeout(timeout);
        lastError.current("");
      } else if (message.type === "render") {
        if (typeof message.html !== "string" || typeof message.css !== "string" || message.html.length > 100000 || message.css.length > 30000) {
          fail("Custom report output is invalid or too large.");
          return;
        }
        const html = DOMPurify.sanitize(message.html, {
          USE_PROFILES: { html: true, svg: true },
          FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form", "a", "link", "meta", "base", "foreignObject", "image", "use", "animate", "set"],
          FORBID_ATTR: ["href", "xlink:href", "src", "srcset", "action", "formaction", "target", "autofocus"],
          ADD_ATTR: ["data-action"],
        });
        send({ type: "display", html, css: message.css });
        setReady(true);
      }
    };
    window.addEventListener("message", receive);
    return () => { clearTimeout(timeout); window.removeEventListener("message", receive); send({ type: "stop" }); };
  }, [session]);

  return <section className="custom-report-preview" aria-label="Custom report preview">
    {!ready && !error && <p className="muted-note">Preparing custom report…</p>}
    {error && <div className="error-banner" role="alert">Custom report needs a repair. {error}</div>}
    <iframe ref={frame} title="Custom report" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={customFrameDocument(nonce)} style={{ height: source.height }} />
    <Button variant="ghost" onClick={() => stopPreview.current()}>Stop preview</Button>
  </section>;
}

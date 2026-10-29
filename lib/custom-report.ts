import { z } from "zod";
import type { Appearance, Chart } from "./types";

export const customSourceSchema = z.object({
  html: z.string().max(40000),
  css: z.string().max(30000),
  javascript: z.string().max(40000),
  height: z.number().int().min(200).max(1600),
}).strict();
export const customReportSchema = customSourceSchema.extend({
  previous: z.array(customSourceSchema).max(3).optional(),
}).strict();
export type CustomSource = z.infer<typeof customSourceSchema>;
export type CustomReport = z.infer<typeof customReportSchema>;

export function reviseCustomReport(previous: CustomReport | undefined, source: CustomSource): CustomReport {
  const parsed = customSourceSchema.parse(source);
  if (!previous) return { ...parsed, previous: [] };
  const { previous: history, ...current } = previous;
  return { ...parsed, previous: [current, ...(history ?? [])].slice(0, 3) };
}

export function customReportData(charts: Chart[], appearance: Appearance) {
  return {
    appearance,
    datasets: charts.map((chart, index) => ({
      id: `chart_${index + 1}`, title: chart.title, format: chart.format,
      rows: chart.data.map(row => ({ label: String(row[chart.labelKey] ?? ""), value: Number(row[chart.valueKey] ?? 0) })),
    })),
  };
}

export function customFrameDocument(nonce: string) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; worker-src blob:; connect-src 'none'; img-src data:; font-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;min-height:100%;font-family:Arial,sans-serif}*{box-sizing:border-box}button,input,select{font:inherit}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #e6007e;outline-offset:3px}</style>
<style id="report-style"></style></head><body><main id="report-root"></main>
<script nonce="${nonce}">
(() => {
  let worker;
  let started = false;
  let eventCount = 0;
  let eventStart = Date.now();
  const send = (message) => parent.postMessage({channel:"biizy-custom",...message}, "*");
  const workerBootstrap = \`
    const send = postMessage.bind(self);
    const handlers = new Map();
    const api = {
      render(html, css = "") { send({type:"render",html,css}); },
      on(id, handler) { handlers.set(id, handler); }
    };
    self.addEventListener("error", event => { send({type:"error",message:event.message}); });
    self.addEventListener("unhandledrejection", event => { send({type:"error",message:String(event.reason)}); });
    self.onmessage = event => {
      if (event.data.type === "event") {
        const handler = handlers.get(event.data.id);
        if (handler) {
          try { handler(event.data); } catch (error) { send({type:"error",message:String(error)}); }
        }
      }
    };
  \`;
  addEventListener("message", event => {
    if (event.source !== parent || !event.data || event.data.channel !== "biizy-host") return;
    if (event.data.type === "start" && !started) {
      started = true;
      const {source,data} = event.data;
      document.documentElement.style.colorScheme = data.appearance.theme;
      document.body.style.background = data.appearance.theme === "dark" ? "#222b39" : "#ffffff";
      document.body.style.color = data.appearance.theme === "dark" ? "#e5e9f2" : "#252c3e";
      const program = workerBootstrap + "\\nconst data = " + JSON.stringify(data) + ";\\napi.render(" + JSON.stringify(source.html) + "," + JSON.stringify(source.css) + ");\\n" +
        "try {\\n" + source.javascript + "\\npostMessage({type:'complete'}); } catch(error) { postMessage({type:'error',message:String(error)}); }";
      const url = URL.createObjectURL(new Blob([program], {type:"text/javascript"}));
      worker = new Worker(url);
      worker.onerror = event => { send({type:"error",message:event.message || "Custom report script failed."}); };
      worker.onmessage = event => {
        if (Date.now() - eventStart > 1000) { eventStart = Date.now(); eventCount = 0; }
        if (++eventCount > 30) { worker.terminate(); send({type:"error",message:"Custom report exceeded its update limit."}); return; }
        if (event.data && event.data.type === "render") send({type:"render",html:event.data.html,css:event.data.css});
        if (event.data && event.data.type === "error") send({type:"error",message:String(event.data.message).slice(0,2000)});
        if (event.data && event.data.type === "complete") send({type:"complete"});
      };
      worker.addEventListener("message", () => URL.revokeObjectURL(url), {once:true});
    }
    if (event.data.type === "display") {
      document.getElementById("report-style").textContent = event.data.css;
      document.getElementById("report-root").innerHTML = event.data.html;
    }
    if (event.data.type === "stop") { if (worker) worker.terminate(); }
  });
  ["click","change"].forEach(type => document.addEventListener(type, event => {
    const target = event.target.closest("[data-action]");
    if (target && worker) worker.postMessage({type:"event",id:target.dataset.action,event:type,value:target.value ?? ""});
  }));
  send({type:"ready"});
})();
</script></body></html>`;
}

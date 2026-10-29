# Biizy

**Build reports by asking.** Pronounced "bee-zee". The logo is a simple pink, three-bar chart, shared across the workspace, embed preview, and browser icon.

## Report builder

Chat remains the primary interface. **Edit report** opens optional controls; chart type/layout controls appear only when arranging charts.

- Up to 12 named report pages, with existing charts selectable on each page. A chart may appear on several pages; its data and styling are shared. New SQL/AI charts are added to the active page.
- Plain-text headings/notes and page-navigation buttons, with text size and color. Text/buttons appear above charts and can be edited, reordered or deleted.
- Report font, light/dark theme, accent and metric visibility; chart color/palette and height. Use **Arrange charts on canvas** for type, order, width and removal.
- Pages/elements persist locally. Older saved dashboards migrate into **Overview** without losing charts. Deleting a page keeps charts in the library and removes buttons pointing to it.
- AI uses a validated `report` action for the complete page/element structure. Invalid chart references or button destinations reject the entire batch. Undo restores the previous report and charts.
- PDF exports the active page (including text/buttons); iframe sharing still shows only the public sample, not a private multi-page report.

The standard builder uses validated components and page-navigation buttons. Filters, appearance and date ranges are global; it does not implement weekly/monthly controls. Ask for weekly aggregation via chart SQL instead. For bespoke visuals and local interactions, use the isolated custom-report runtime below.

## Custom report foundation

The AI contract now accepts `custom_report` (`pageId` plus a complete `{html, css, javascript, height}` source) and `remove_custom_report`. This prepares provider-independent code generation without changing the configured LLM. A custom report replaces one page's canvas; its charts remain stored. **Standard view**, **Previous version** (up to three persisted revisions), and AI **Undo** provide recovery. Code editors and a working interactive example appear only in **Developer mode**.

This is not limited to Recharts templates: author HTML/SVG/CSS, tooltips, information icons and local controls. JavaScript executes in a dedicated Web Worker inside an opaque-origin iframe (`sandbox="allow-scripts"`, deliberately no `allow-same-origin`). It has no direct DOM or application access. Only trusted bootstrap code runs in the iframe. Worker render messages are checked and sanitized with DOMPurify in the host, then displayed inside the iframe. Links, forms, scripts, embedded frames, resource URLs and event-handler attributes are removed; CSP restricts network/resource loading. No libraries, React/JSX, package imports, server code, application file edits or direct database calls are supported by this first runtime.

Runtime contract:

```javascript
const dataset = data.datasets.find(item => item.title === "Sales by region");
// Dataset rows are { label: string, value: number } from existing DuckDB chart results.
api.render('<button data-action="details" title="Show details">Info</button>', 'button { padding: 12px; }');
api.on("details", event => {
  // event.event is "click" or "change"; event.value carries an input/select value.
  api.render("<p>Details opened</p>", "p { font-size: 18px; }");
});
```

Only charts assigned to the current page supply results to the local preview; schema names, source rows, SQL, credentials and extra result columns are not provided to its worker. `data.appearance` contains the workspace theme/font settings. Use dataset titles rather than positional IDs; data is refreshed when filters, periods or results change. Escape labels before building HTML. Local preview calculations are not independently verified business metrics; retain standard chart SQL for cross-checking.

The provider receives current custom source to support iterative edits, but not prior revisions or live datasets. Code, report text, prompts and filters may contain sensitive literals: the consent UI explicitly includes custom report code. Repair is user-triggered, not an automatic provider call, and does not transmit runtime error text (which might contain data). Runtime errors remain visible; no fallback silently claims a successful report.

Bounds: source HTML/JS 40,000 characters each, CSS 30,000; height 200–1,600 px; render HTML 100,000; 30 worker updates per second; startup watchdog 10 seconds; a stop control terminates the preview worker. These are prototype safeguards, **not production CPU/memory quotas or a fully hardened hostile-code service**. Production requires isolated hosting, resource budgets, dependency review, and tenant/access controls. Custom preview PDF export is explicitly unavailable; public embeds still show samples only.

The manual builder and AI action execution are regression-tested. The opt-in live test (`TEST_LOCAL_AI=1`, `tests/e2e/local-report.spec.ts`) exposes a current limitation: a combined page/text/navigation request failed twice on CPU-only Qwen 2.5 3B within the four-minute provider limit. Do not treat mocked-provider tests as proof that this model can reliably build reports. Try smaller requests or a more capable provider/model; no fallback silently changes the report.

A conversational self-service BI MVP with Claude Code, local Ollama or OpenAI workspace editing. Next.js App Router, React, Tailwind CSS, shadcn/ui (Base UI), Zustand, DuckDB-WASM, Recharts, html2canvas and jsPDF. Query execution and data storage stay in-browser; AI editing uses an explicit opt-in metadata context.

## Run locally

Requires Node.js 20.9+ and npm. From this directory:

```powershell
npm install
npm run dev
```

Open http://localhost:3000. The sample dashboard and manual controls do not require a database server. AI chat can use a signed-in Claude Code CLI, local Ollama, or optional OpenAI. The install script copies DuckDB's worker and WASM into `public/duckdb`; those generated assets are not committed. All fonts, scripts and WASM are served locally. First-time DuckDB startup loads approximately 35–40 MB of WASM.

## Claude Code workspace editing

Claude Code CLI requires a Claude Pro/Max subscription or Anthropic API billing. If available, sign in with your Claude account:

```powershell
claude auth login
claude auth status
```

Set `AI_PROVIDER=claude-code` and `CLAUDE_MODEL=sonnet` in `.env.local`, then restart Biizy. The app detects the native Windows CLI at `%USERPROFILE%\\.local\\bin\\claude.exe` or uses `claude` from `PATH`. Set `CLAUDE_CLI_PATH` to the full `claude.exe` path if it is installed elsewhere. No Anthropic API key is used by this integration. Requests use the Claude Code account and are subject to the account's plan and Anthropic's usage limits; CLI installation does not make model inference offline or guarantee unlimited usage. If you don't have a paid plan or API billing, use the free local Ollama configuration below.

Claude Code runs in non-interactive print mode with `--bare`, no tools enabled, no project working directory, and session persistence disabled. It receives only the prompt, recent chat history, workspace metadata and current custom report code explicitly allowed by the consent control; **source rows, chart results and existing SQL are not sent**. The app requests schema-constrained JSON actions, validates them, then applies them atomically with Undo. Claude cannot read or change project files or run shell commands. It can generate isolated custom report source through the dedicated action, in addition to chart SQL/styles, pages, filters, relationships, appearance and navigation.

## Local testing without paid API usage

Install [Ollama](https://ollama.com/download/windows), start it and download the local model:

```powershell
ollama pull qwen2.5:3b
```

Copy `.env.example` to `.env.local` (the example defaults to local mode):

```dotenv
AI_PROVIDER=ollama
OLLAMA_MODEL=qwen2.5:3b
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

Set `AI_PROVIDER=ollama` to use this option. Restart Biizy and refresh the page. The assistant checks whether Ollama is responding and the exact model is installed, displays **Local Ollama**, and uses the same validated actions and undo as other providers. Enable local context access in the sidebar; no OpenAI API key or credits are needed. The server calls only a loopback Ollama endpoint; remote/cloud endpoints are rejected. Requests and metadata stay on this computer. Model downloads require an internet connection; inference uses your own hardware.

The 3B model is a modest CPU-friendly starting point for a 16 GB RAM machine with integrated graphics. It is less capable than larger cloud models. CPU responses, especially first-load requests, can take several minutes; local calls time out after four minutes. Complex or unsupported requests can fail validation without modifying the workspace. Start with short requests such as `Přepni do světlého režimu` or `Změň font na Arial`. Use `OLLAMA_MODEL` to select another already-installed local model when hardware permits. Ollama handles the local model's lifecycle separately from Biizy.

For hosted production, choose explicitly between application-funded cloud API use, customer-provided keys or self-hosted inference. Subscription quotas are a product decision; this prototype has no billing subsystem. No API bill does not mean free production hosting or hardware.

## Optional OpenAI setup

The right-hand **AI assistant** panel has a pink frame and can be widened by dragging its left edge (or using arrow keys on the resize handle). Example prompts are collapsed under **Try asking**. Workspace navigation is available only in the top tabs, not duplicated in the assistant.

Chart styling supports a single color or a `palette` of 2–12 hex colors for categorical bars and donut slices; the legend uses the same palette. Ask for distinct slice colors by naming the chart. Setting a single color clears the previous palette. AI requests use short per-request chart references mapped back to the current workspace IDs; unknown references are rejected, never guessed. Ollama receives the full workspace instructions, with an 8,192-token context and up to 2,048 output tokens. Larger contexts may require more memory.

Set `AI_PROVIDER=openai` and `OPENAI_API_KEY` in `.env.local`, then restart the server. Do not paste the key into chat or commit it. `OPENAI_MODEL` defaults to `gpt-4.1-mini`; use a Chat Completions model supporting JSON object output. The key is read only by the server route, never exposed through a `NEXT_PUBLIC_` variable.

The assistant shows whether the server is configured. Before sending a message, enable context sharing in its sidebar. Requests send your messages (up to 12 recent messages), table and column names/types, chart IDs/titles/styles, relationships, selected filter values, period and appearance. **No source rows, chart results, existing SQL or uploaded files are sent.** Messages and selected filter values can still contain sensitive information: use non-sensitive demo data. Without configuration or consent, the assistant reports an error and does not change the workspace. There is no silent local-planner fallback.

Try Czech or English requests, including combinations:

- `Posuň Sales by region na první místo a zvětši ho přes celou šířku.`
- `Změň všude font na Roboto a přepni do tmavého režimu.`
- `Změň grafy na modré, skryj mřížku a nastav výšku na 300 pixelů.`
- `Přidej filtr na region.`
- `Zobraz pouze Europe a North America.`
- `Přejmenuj dashboard na Výsledky prodeje a skryj metriky.`

The model returns a schema-validated action batch. Supported actions include appearance, chart styles (type, color, width, height, border radius, grid, donut legend and titles), chart ordering/removal, new read-only SQL charts, replacement queries, filters, model relationships, dashboard name, period and navigation. The application validates referenced IDs, schemas, filters and query results before committing **any** changes. Failed batches leave the workspace unchanged. **Undo** restores the last successful AI batch; manual edits invalidate that undo snapshot. AI confirmation text is shown only after execution. Undo history is session-only.

This is a report-focused workspace editor, not a VS Code agent: it cannot install packages or write application files. Bespoke HTML/SVG/CSS and worker JavaScript are supported only through the isolated custom-report contract. Ambiguous/unsupported requests should be explained or clarified by the model; LLM output is not guaranteed.

The endpoint is intended for a local prototype. It checks same-origin browser requests, validates input size and structure, and has timeouts, but does **not** implement authentication, durable quotas or tenant isolation. Add those before public hosting with an API key.

## Data protection before serving customers

The current application is a single-user local prototype: source rows and workspace settings are stored in the browser's local storage layer, and the configured Ollama inference runs on the same computer. It has no user accounts, hosted workspace storage, tenant isolation, or production-grade access controls. Do not expose this instance to the internet or use it as a secure multi-customer service.

Before a hosted release, implement and independently test:

- **Authentication and tenant isolation:** Entra ID or another established identity provider, server-verified tenant membership on every read/write, tenant-scoped database keys and object-storage paths, and automated cross-tenant access tests. Never trust a tenant ID supplied only by the browser.
- **Least-privilege access:** workspace owner/editor/viewer roles, explicit dashboard sharing, short-lived signed links/tokens, CSRF protections, rate limits, and an audit trail for source, permission, export, and deletion events.
- **Secrets and encryption:** database credentials encrypted with a managed key vault and never returned to the browser, TLS for all hosted connections, encrypted storage/backups, key rotation, and redaction from logs and errors.
- **Data lifecycle:** documented retention per source and AI provider, a verified deletion/export workflow, backups with expiry, regional hosting choices, and a documented incident-response procedure.
- **Optional cloud AI:** explicit per-workspace consent, least-context request construction, provider-side training/retention terms reviewed for the chosen commercial plan, per-tenant budgets and quotas, and a local-only option when policy requires it. AI must not receive data rows, credentials, existing SQL, or query results unless a separately explained feature explicitly needs them and the user approves.
- **SQL isolation:** keep query execution inside an isolated engine, bind or validate identifiers, enforce read-only single statements, cap execution time and results, disable external file/network extensions, and test hostile SQL inputs. The browser-side guard in this prototype is a development safeguard, not a hosted security boundary.

Fabric/OneLake supplies identity integration and more mature workspace/data permission controls, but hosting Biizy in Azure or Fabric would not automatically make the application secure: Biizy still needs its own application authentication, tenant boundaries, secret management, and permission checks. Validate Microsoft licensing and access-policy details for the actual deployment.

```powershell
npm run lint
npm test
npm run build
npm start
```

## Explore the MVP

- **Dashboard:** Starts with 720 sample orders and a four-row region lookup. Initial visuals are queried against DuckDB, not static chart data. Metric cards reflect the sample sales table and active period.
- **Assistant:** The configured provider interprets free-form requests and proposes validated actions. Chart SQL supports flexible aggregations; custom-report source runs only in the isolated worker/preview. Provider, schema, runtime or query failures are reported explicitly.
- **Appearance:** A simplified solid-color workspace, dark by default, using locally served Space Grotesk. A header button switches light/dark manually. AI can change theme, font (Space Grotesk/Roboto/DM Sans/Manrope/Arial), accent, spacing, corner radius and metric visibility. Settings persist.
- **Filters:** A Region multi-select is provided for the sample model. Add or remove filters manually or through chat. Values filter actual source rows before querying and propagate through model relationships, including to the metric cards. Disconnected sources stay unchanged; this is stated beside filter controls. Empty selection means all values. Filters and selections persist.
- **Data sources:** Two compact actions: **Upload** opens a file picker and also accepts CSV/XLSX drops; **Connect** opens a searchable list of databases, warehouses, storage and apps. Only **PostgreSQL demo** is enabled; all other entries are disabled placeholders, not real integrations. The mock connector pre-fills safe example details and loads sample orders. Real passwords are neither needed nor persisted. Each connected source offers **Explore** to open the SQL Explorer preselected to that table, and an eight-row preview.
- **File limits:** 5 MB and 20,000 rows per file, first worksheet for XLSX. Older XLS files must be converted to XLSX. Empty or duplicate headers are rejected; blank cells become null. Source table names are sanitized and made unique. CSV numeric cells are inferred automatically.
- **Semantic model:** Compact table cards show actual column names and types without column icons or connector dots. Drag a column onto another table's column, click two columns, or use the relationship form. Connections appear as lines and matched rows are highlighted. Suggestions match common ID/key columns with compatible types. Relationships are validated, including duplicate connections. Chart joins reject non-unique lookup keys to avoid double-counting. Removing a relationship removes dependent generated charts with an explanation; unaffected charts remain.
- **Visuals:** Use Add visual to choose a source and ask a question, or ask directly in chat. AI editing needs the selected provider (local model or cloud key) and context consent. Table names appear in the model. Relationships provide join context without sending actual rows.
- **SQL explorer:** Open **Explore SQL** to inspect current in-browser DuckDB tables or write a read-only SELECT/WITH query. Ask AI to draft a query from a natural-language description; it fills an editable SQL draft but does not execute it. Review, run, inspect the result table, then optionally add a result with `label` and numeric `value` columns as a dashboard chart. AI receives only schema and settings covered by the existing consent control, never source rows or query results.
- **Chart checks:** Each visual can rerun its current chart SQL and compare fresh query results with the values held by the displayed chart. The SQL is visible. A matching check catches stale/rendering mismatches; it does **not** independently prove that the metric, join, filters, or business definition is correct.
- **Layout:** Edit layout to reorder charts with arrow controls, choose half/full width, remove visuals, and edit the dashboard name. Chart types can be changed independently.
- **Date range:** All dates, Q1 2026, or Q2 2026. The initial demo charts use their source's first Date/Timestamp-named column. Sources without such a column are not period-filtered. Dates are parsed using DuckDB `TRY_CAST` (use ISO dates). Invalid dates are excluded when a period is selected. **AI/custom SQL controls its own date predicates**; its subtitle states this. The selected period is included in AI context. Region and other source-row filters still apply to AI/custom SQL. Empty periods display a no-data message.
- **Developer mode:** Hidden by default. Reveal chart SQL editors and semantic-model JSON. SQL must return `label` and finite numeric `value` columns. The planner casts aggregates to DOUBLE for chart rendering; do the same for custom HUGEINT aggregates if needed. Only a single SELECT/WITH statement is accepted, capped at 5,000 result rows. Generated charts are capped at 50 groups. Numeric visualization uses JavaScript double precision; not suitable for exact financial accounting.
- **Navigation and sharing:** Use the top tabs to move between sources, semantic model and dashboard; a duplicate left navigation rail is intentionally omitted. The single **Share** action offers either PDF export or **Share / Embed**. The iframe preview shows read-only **sample data only**; it does not publish the user's dashboard or uploaded data.
- **Export:** PDF downloads the current dashboard cards with headings, period labels and page breaks. Queries and layout controls are excluded. Each chart is kept on one page; unusually tall cards may be scaled down. Start export from **Share → Export PDF**.
- **Persistence:** Sources, relationships, chart results, layout, dashboard name, messages, period, appearance and filters are saved in this browser's IndexedDB. Saved charts are re-queried with active filters on reload. Storage errors are surfaced in the UI. Clearing site data removes the workspace. Developer mode, AI context-sharing consent and undo history are session-only. Older saved workspaces receive dark/Space Grotesk defaults and a Region filter where applicable.

## Architecture and boundaries

`lib/engine.ts` owns a lazy, single-worker DuckDB instance and serializes source loading/query operations. Parsed file rows are staged as JSON and materialized as DuckDB tables. **Parquet conversion is simulated**, not a real Parquet pipeline. `lib/planner.ts` remains responsible for initial demo charts. `lib/agent-schema.ts` defines the expandable validated action contract; `lib/ai-provider.ts` selects local Ollama or OpenAI, and `app/api/assistant/route.ts` validates the request and response; `lib/agent-executor.ts` stages complete batches before committing. `lib/filters.ts` filters source rows and propagates selections through relationships. `lib/store.ts` owns async actions, undo and persistence.

The app calls its selected AI provider only after configuration and user opt-in. OpenAI is optional; local Ollama never routes requests to a cloud fallback. It does **not** connect to a real SQL database, implement authentication, or provide hosted private embedding. Real database connections need a server-side read-only connector and secret management. Production embedding needs published snapshots plus access controls.

Developer SQL validation is a convenience boundary, **not a production SQL sandbox**. Do not run untrusted queries. Imports use the actual rows but support simple tabular, scalar values, not Excel formulas recalculation, merged headers, nested records or multiple worksheets. This prototype should not be used as an exact financial reporting system.

## Tests

`npm test` covers demo referential integrity, source-qualified planning, joins, duplicate lookup rejection, model validation, date filters, chart result shapes, file schema inference, quoting, the single-statement guard, atomic AI actions, rejected arbitrary code/styles, chart IDs/order, region propagation and exact totals, metadata-only context, and API error behavior. Tests use no live OpenAI key or paid calls. The fixture `tests/fixtures/orders.csv` is a three-row upload sample: North America totals $250 and Europe $200 after connecting `Region_ID` to the sample `regions` table.

The interface is responsive, supports keyboard-based relationship selection, uses accessible dialogs and labeled controls, and respects reduced-motion preferences.

Browser regression tests use real DuckDB-WASM and intercepted AI responses, not paid provider calls:

```powershell
npx playwright install chromium
npm run test:e2e
```

They verify the dark/Space Grotesk defaults, clear relationship arrows and table outlines, visible AI input, exact regional totals in metrics and SQL charts, combined Czech-request action execution, undo, appearance persistence, consent reset, solid model background, mobile layout and missing-key behavior.

To exercise the real local model (requires a running Ollama and the configured model; can take several minutes on CPU):

```powershell
$env:TEST_LOCAL_AI="1"
npm run test:e2e -- --grep=real
```

This opt-in test verifies actual Czech interpretation, appearance changes, chart reordering and undo with no mocked provider response or API costs.

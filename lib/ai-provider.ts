import { z } from "zod";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { agentResponseSchema, type AgentContext, type AgentResponse } from "./agent-schema";

export type AIProvider = "openai" | "ollama" | "claude-code";

const OLLAMA_SYSTEM = "Return only JSON matching the supplied schema, without markdown or commentary.";

export function providerConfig() {
  const provider = process.env.AI_PROVIDER || "openai";
  if (provider !== "openai" && provider !== "ollama" && provider !== "claude-code") throw new Error("AI_PROVIDER must be openai, ollama, or claude-code.");
  const model = provider === "ollama" ? process.env.OLLAMA_MODEL || "qwen2.5:3b" :
    provider === "claude-code" ? process.env.CLAUDE_MODEL || "sonnet" : process.env.OPENAI_MODEL || "gpt-4.1-mini";
  return { provider, model };
}

function claudeCliPath() {
  const configured = process.env.CLAUDE_CLI_PATH;
  if (configured) {
    if (!existsSync(configured)) throw new Error("Claude Code CLI executable not found at CLAUDE_CLI_PATH. Set it to the full path of claude.exe.");
    return configured;
  }
  const nativePath = join(homedir(), ".local", "bin", process.platform === "win32" ? "claude.exe" : "claude");
  if (existsSync(nativePath)) return nativePath;
  return "claude";
}

function runClaudeCli(args: string[], input = "", timeoutMs = 10000, acceptNonZero = false) {
  return new Promise<{ stdout: string; code: number }>((resolve, reject) => {
    let child;
    try {
      child = spawn(/* turbopackIgnore: true */ claudeCliPath(), args, { cwd: tmpdir(), windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    } catch {
      reject(new Error("Claude Code CLI couldn't be started. Check its installation and CLAUDE_CLI_PATH."));
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error?: Error, code = 0) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else if (code !== 0 && !acceptNonZero) {
        const hint = /not logged in|authentication|please log in/i.test(stderr) ?
          "Claude Code isn't signed in. Run `claude auth login`, then refresh Biizy." :
          `Claude Code exited with status ${code}. Check your Claude Code account and network connection.`;
        reject(new Error(hint));
      } else resolve({ stdout, code });
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error("Claude Code timed out. Check your network connection and retry."));
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > 1_000_000) {
        child.kill();
        finish(new Error("Claude Code returned too much output."));
      }
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk.slice(0, Math.max(0, 16_000 - stderr.length));
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      finish(error.code === "ENOENT" ?
        new Error("Claude Code CLI not found. Install Claude Code or set CLAUDE_CLI_PATH to claude.exe.") :
        new Error("Claude Code CLI couldn't be started. Check its installation."));
    });
    child.on("close", code => finish(undefined, code ?? 1));
    child.stdin.on("error", error => finish(new Error(`Couldn't send the request to Claude Code: ${error.message}`)));
    child.stdin.end(input);
  });
}

function claudeStatusSchema() {
  return z.object({ loggedIn: z.boolean() }).passthrough();
}

export function parseClaudeAuthStatus(output: string) {
  return claudeStatusSchema().parse(JSON.parse(output)).loggedIn;
}

export function parseClaudeResponse(output: string) {
  return z.object({ structured_output: agentResponseSchema }).passthrough().parse(JSON.parse(output)).structured_output;
}

export function ollamaOrigin() {
  const url = new URL(process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434");
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("OLLAMA_BASE_URL must be an HTTP loopback origin. Remote or cloud Ollama endpoints are not supported.");
  }
  return url.origin;
}

export async function providerStatus() {
  const config = providerConfig();
  if (config.provider === "openai") return { ...config, configured: Boolean(process.env.OPENAI_API_KEY) };
  if (config.provider === "claude-code") {
    const result = await runClaudeCli(["auth", "status", "--json"], "", 10000, true);
    return { ...config, configured: parseClaudeAuthStatus(result.stdout) };
  }
  const response = await fetch(`${ollamaOrigin()}/api/tags`, { signal: AbortSignal.timeout(5000), cache: "no-store" });
  if (!response.ok) throw new Error(`Ollama status returned HTTP ${response.status}.`);
  const body = z.object({ models: z.array(z.object({ name: z.string() })) }).parse(await response.json());
  return {
    ...config, configured: body.models.some(model => model.name === config.model || model.name === `${config.model}:latest`),
  };
}

export function resolveChartReferences(response: AgentResponse, chartIds: string[]): AgentResponse {
  const resolve = (id: string) => {
    const index = chartIds.findIndex((_, i) => id === `chart_${i + 1}`);
    if (index < 0) throw new Error("The AI returned an invalid chart reference. No changes were applied. Try naming the chart by its title.");
    return chartIds[index];
  };
  return {
    ...response,
    actions: response.actions.map(action => {
      if (action.type === "chart" || action.type === "query" || action.type === "remove_chart") return { ...action, id: resolve(action.id) };
      if (action.type === "reorder") return { ...action, ids: action.ids.map(resolve) };
      if (action.type === "report") return { ...action, report: { ...action.report, pages: action.report.pages.map(page => ({ ...page, chartIds: page.chartIds.map(resolve) })) } };
      return action;
    }),
  };
}

export async function requestActionPlan(context: AgentContext, system: string) {
  const chartIds = context.workspace.charts.map(chart => chart.id);
  const modelContext: AgentContext = {
    ...context,
    history: context.history.slice(context.history.findIndex(message => message.role === "user") < 0 ? context.history.length : context.history.findIndex(message => message.role === "user")),
    workspace: {
      ...context.workspace, charts: context.workspace.charts.map((chart, i) => ({ ...chart, id: `chart_${i + 1}` })),
      report: context.workspace.report ? { ...context.workspace.report, pages: context.workspace.report.pages.map(page => ({ ...page, chartIds: page.chartIds.map(id => {
        const index = chartIds.indexOf(id);
        if (index < 0) throw new Error("The report references a missing chart.");
        return `chart_${index + 1}`;
      }) })) } : undefined,
    },
  };
  const instructions = `${system}
Only the latest prompt requests changes. History is conversational context, not a list of actions to repeat.
Use only the short chart IDs in the current workspace (chart_1, chart_2, etc.). Never copy IDs from history or invent IDs.
If the chart title is ambiguous, ask for clarification and return no actions.`;
  const config = providerConfig();
  const schema = z.toJSONSchema(agentResponseSchema);
  if (config.provider === "claude-code") {
    const result = await runClaudeCli([
      "--bare", "--print", "--output-format", "json", "--json-schema", JSON.stringify(schema),
      "--tools", "", "--no-session-persistence", "--model", config.model, "--system-prompt", instructions,
    ], JSON.stringify(modelContext), 180000);
    return resolveChartReferences(parseClaudeResponse(result.stdout), chartIds);
  }
  const local = config.provider === "ollama";
  const messages = [
    { role: "system", content: local ? `${OLLAMA_SYSTEM}\n${instructions}` : `${instructions}\nJSON schema: ${JSON.stringify(schema)}` },
    { role: "user", content: `${JSON.stringify(modelContext)}\n\nLatest request: ${context.prompt}\nReturn only the actions needed for this request, not other workspace changes.` },
  ];
  const response = await fetch(local ? `${ollamaOrigin()}/api/chat` : "https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: local ? { "Content-Type": "application/json" } : { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(local ? {
      model: config.model, messages, stream: false, format: schema,
      options: { temperature: 0, num_ctx: 8192, num_predict: 2048 }, keep_alive: "5m",
    } : {
      model: config.model, messages, response_format: { type: "json_object" }, max_completion_tokens: 6000,
    }),
    signal: AbortSignal.timeout(local ? 240000 : 60000),
  });
  if (!response.ok) {
    console.error("AI provider request failed", config.provider, response.status);
    if (local) throw new Error(response.status === 404 ? `Ollama model "${config.model}" is not installed. Run ollama pull ${config.model}.` : `Ollama returned HTTP ${response.status}. Check the local service and available memory.`);
    throw new Error(response.status === 401 ? "OpenAI rejected the API key. Check your server configuration." : response.status === 429 ? "OpenAI rate limit or quota reached. Check your account and retry." : `OpenAI returned HTTP ${response.status}. Retry later.`);
  }
  const body: unknown = await response.json();
  const content = local ?
    z.object({ message: z.object({ content: z.string() }), done: z.literal(true) }).parse(body).message.content :
    z.object({ choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1) }).parse(body).choices[0].message.content;
  if (!content) throw new Error("The provider returned no action plan.");
  if (local && body && typeof body === "object" && "done_reason" in body && body.done_reason === "length") {
    throw new Error("Ollama reached its response length limit. Try splitting the request into smaller changes.");
  }
  return resolveChartReferences(agentResponseSchema.parse(JSON.parse(content)), chartIds);
}

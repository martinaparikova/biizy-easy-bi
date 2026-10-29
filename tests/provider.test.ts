import { test } from "node:test";
import assert from "node:assert/strict";
import { ollamaOrigin, parseClaudeAuthStatus, parseClaudeResponse, providerConfig, providerStatus, requestActionPlan, resolveChartReferences } from "../lib/ai-provider";
import type { AgentContext } from "../lib/agent-schema";
import { DEFAULT_APPEARANCE } from "../lib/agent-executor";

const context: AgentContext = {
  prompt: "Změň font na Roboto", history: [],
  workspace: { title: "Demo", view: "dashboard", appearance: DEFAULT_APPEARANCE, dateRange: "all", sources: [], charts: [], filters: [], relationships: [] },
};

test("local provider accepts only loopback origins and rejects remote/cloud addresses", () => {
  const previous = process.env.OLLAMA_BASE_URL;
  try {
    for (const endpoint of ["https://ollama.com", "http://example.com", "http://127.0.0.1:11434/path", "http://user:password@localhost:11434", "http://localhost:11434?x=1"]) {
      process.env.OLLAMA_BASE_URL = endpoint;
      assert.throws(ollamaOrigin, /loopback/);
    }
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434";
    assert.equal(ollamaOrigin(), "http://127.0.0.1:11434");
  } finally {
    if (previous === undefined) delete process.env.OLLAMA_BASE_URL; else process.env.OLLAMA_BASE_URL = previous;
  }
});

test("Ollama status checks installed model and requests use structured output without credentials", async () => {
  const previous = { provider: process.env.AI_PROVIDER, model: process.env.OLLAMA_MODEL, origin: process.env.OLLAMA_BASE_URL };
  const originalFetch = globalThis.fetch;
  try {
    process.env.AI_PROVIDER = "ollama";
    process.env.OLLAMA_MODEL = "qwen2.5:3b";
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434";
    let installed = true;
    globalThis.fetch = async (url, options) => {
      if (String(url).endsWith("/api/tags")) return Response.json({ models: installed ? [{ name: "qwen2.5:3b" }] : [] });
      assert.equal(url, "http://127.0.0.1:11434/api/chat");
      assert.equal(new Headers(options?.headers).has("Authorization"), false);
      const body = JSON.parse(String(options?.body));
      assert.equal(body.stream, false);
      assert.equal(body.format.type, "object");
      assert.ok(body.format.properties.actions);
      assert.equal(body.options.temperature, 0);
      assert.equal(body.options.num_ctx, 8192);
      assert.equal(body.options.num_predict, 2048);
      assert.match(body.messages[0].content, /Only the latest prompt/);
      assert.match(body.messages[0].content, /Test/);
      assert.match(body.messages[1].content, /Latest request: Změň font na Roboto/);
      assert.doesNotMatch(body.messages[0].content, /JSON schema:/);
      return Response.json({ message: { content: JSON.stringify({
        message: "Nastavím Roboto.", actions: [{ type: "appearance", patch: { font: "Roboto" } }],
      }) }, done: true });
    };
    assert.equal((await providerStatus()).configured, true);
    installed = false;
    assert.equal((await providerStatus()).configured, false);
    assert.equal((await requestActionPlan(context, "Test")).actions[0].type, "appearance");
    globalThis.fetch = async () => Response.json({ error: "missing" }, { status: 404 });
    await assert.rejects(requestActionPlan(context, "Test"), /ollama pull qwen2.5:3b/);
    process.env.AI_PROVIDER = "invalid";
    assert.throws(providerConfig, /AI_PROVIDER/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of [["AI_PROVIDER", previous.provider], ["OLLAMA_MODEL", previous.model], ["OLLAMA_BASE_URL", previous.origin]]) {
      if (value === undefined) delete process.env[name!]; else process.env[name!] = value;
    }
  }
});

test("short chart references map exactly and reject invented or stale IDs", () => {
  const result = resolveChartReferences({ message: "Palette", actions: [
    { type: "chart", id: "chart_2", patch: { palette: ["#e6007e", "#f2c94c", "#22aabb"] } },
    { type: "reorder", ids: ["chart_2", "chart_1"] },
  ] }, ["uuid-a", "uuid-b"]);
  assert.equal(result.actions[0].type === "chart" && result.actions[0].id, "uuid-b");
  assert.deepEqual(result.actions[1], { type: "reorder", ids: ["uuid-b", "uuid-a"] });
  for (const id of ["chart_3", "stale-uuid", "chart_01"]) {
    assert.throws(() => resolveChartReferences({ message: "Bad", actions: [{ type: "chart", id, patch: { color: "#f2c94c" } }] }, ["uuid-a"]), /invalid chart reference/);
  }
});

test("Claude Code provider selects the CLI model without requiring an API key", () => {
  const previous = { provider: process.env.AI_PROVIDER, model: process.env.CLAUDE_MODEL, key: process.env.OPENAI_API_KEY };
  try {
    process.env.AI_PROVIDER = "claude-code";
    process.env.CLAUDE_MODEL = "sonnet";
    delete process.env.OPENAI_API_KEY;
    assert.deepEqual(providerConfig(), { provider: "claude-code", model: "sonnet" });
  } finally {
    for (const [name, value] of [["AI_PROVIDER", previous.provider], ["CLAUDE_MODEL", previous.model], ["OPENAI_API_KEY", previous.key]]) {
      if (value === undefined) delete process.env[name!]; else process.env[name!] = value;
    }
  }
});

test("Claude CLI auth and structured responses are validated without exposing CLI metadata", () => {
  assert.equal(parseClaudeAuthStatus(JSON.stringify({ loggedIn: true, authMethod: "claude.ai", email: "not used" })), true);
  assert.equal(parseClaudeAuthStatus(JSON.stringify({ loggedIn: false, authMethod: "none" })), false);
  assert.deepEqual(parseClaudeResponse(JSON.stringify({
    result: "metadata is ignored",
    structured_output: { message: "Změním písmo.", actions: [{ type: "appearance", patch: { font: "Roboto" } }] },
  })), { message: "Změním písmo.", actions: [{ type: "appearance", patch: { font: "Roboto" } }] });
  assert.throws(() => parseClaudeResponse(JSON.stringify({
    structured_output: { message: "Unsafe", actions: [{ type: "arbitrary_code", code: "run()" }] },
  })));
  assert.throws(() => parseClaudeAuthStatus(JSON.stringify({ authMethod: "none" })));
});

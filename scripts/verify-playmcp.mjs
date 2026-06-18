import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const port = 3091;
const source = await readFile(new URL("../src/mcpServer.ts", import.meta.url), "utf8");
const toolNames = [...source.matchAll(/server\.registerTool\(\s*\n\s*"([^"]+)"/g)].map(match => match[1]);

assert(toolNames.length >= 3 && toolNames.length <= 10, `expected 3-10 tools, found ${toolNames.length}`);
for (const name of toolNames) {
  assert(/^[A-Za-z0-9_-]{1,128}$/.test(name), `invalid tool name: ${name}`);
  assert(!/kakao/i.test(name), `tool name must not contain kakao: ${name}`);
}
assert((source.match(/annotations:/g) ?? []).length >= toolNames.length, "every tool should define annotations");
assert((source.match(/readOnlyHint/g) ?? []).length >= 1, "annotations should include readOnlyHint");
assert(!/name:\s*"[^"]*kakao/i.test(source), "server name must not contain kakao");

const child = spawn("node", ["dist/index.js"], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, PORT: String(port) },
  stdio: "ignore"
});

try {
  await waitForHealth(port);
  const badVersion = await fetch(`http://localhost:${port}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "verify", version: "0.1.0" }
      }
    })
  });
  assert(badVersion.status === 400, `expected unsupported version 400, got ${badVersion.status}`);
  console.log(`PlayMCP verify passed: ${toolNames.length} tools, protocol guard active.`);
} finally {
  child.kill();
}

async function waitForHealth(targetPort) {
  for (let i = 0; i < 20; i += 1) {
    try {
      const response = await fetch(`http://localhost:${targetPort}/health`);
      if (response.ok) return;
    } catch {
      await delay(250);
    }
  }
  throw new Error("health endpoint did not become ready");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

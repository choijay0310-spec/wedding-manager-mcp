import cors from "cors";
import express from "express";
import { createWeddingMcpServer } from "./mcpServer.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(cors({
  origin: "*",
  exposedHeaders: ["mcp-session-id", "mcp-protocol-version"],
  allowedHeaders: ["Content-Type", "mcp-session-id", "mcp-protocol-version", "Last-Event-ID"]
}));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "Wedding Manager MCP" });
});

function isSupportedProtocolVersion(version: unknown): boolean {
  if (typeof version !== "string") return true;
  return version >= "2025-03-26" && version <= "2025-11-25";
}

function protocolVersionFromRequest(req: express.Request): unknown {
  if (typeof req.headers["mcp-protocol-version"] === "string") {
    return req.headers["mcp-protocol-version"];
  }
  if (req.body?.method === "initialize") {
    return req.body?.params?.protocolVersion;
  }
  return undefined;
}

function sendProtocolError(res: express.Response, id: unknown): void {
  res.status(400).json({
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code: -32600,
      message: "Unsupported MCP protocol version. PlayMCP requires 2025-03-26 through 2025-11-25."
    }
  });
}

app.all("/mcp", async (req, res) => {
  const requestedVersion = protocolVersionFromRequest(req);
  if (!isSupportedProtocolVersion(requestedVersion)) {
    sendProtocolError(res, req.body?.id);
    return;
  }

  let server: ReturnType<typeof createWeddingMcpServer> | undefined;
  let transport: StreamableHTTPServerTransport | undefined;

  try {
    server = createWeddingMcpServer();
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });

    res.on("close", () => {
      transport?.close();
      server?.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error(JSON.stringify({
      service: "Wedding Manager MCP",
      event: "mcp_request_failed",
      message: error instanceof Error ? error.message : String(error)
    }));
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        id: req.body?.id ?? null,
        error: { code: -32603, message: "Internal MCP server error." }
      });
    }
  }
});

app.listen(port, () => {
  console.log(`Wedding Manager MCP listening on port ${port}`);
});

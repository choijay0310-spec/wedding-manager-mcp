# Wedding Manager MCP Agents

This project is for the Agentic Player 10 PlayMCP contest.

## Rules

- Follow `../play mcp 서버 개발 가이드.md`.
- Keep the server stateless unless the user explicitly asks to add OAuth/storage.
- Do not include `kakao` in server name or tool names.
- Keep tools between 3 and 10 total.
- Every tool must include `annotations.title`, `readOnlyHint`, `destructiveHint`, `openWorldHint`, and `idempotentHint`.
- Tool descriptions must include `Wedding Manager MCP(웨딩 매니저 MCP)`.
- Return concise markdown text. Do not return raw third-party API payloads.

## Subagents

Use the local files in `.agents/` as project-specific role prompts when splitting work.

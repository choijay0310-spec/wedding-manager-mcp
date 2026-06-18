# Wedding Manager MCP

Wedding Manager MCP(웨딩 매니저 MCP)는 결혼 준비 일정, 예산, 업체 견적, 가족 공유 문구를 정리하는 PlayMCP 출품 후보 서버입니다.

## PlayMCP Compliance

- Transport: Streamable HTTP at `/mcp`
- Protocol target: MCP SDK `1.29.0`
- Server name and tool names do not contain `kakao`
- Stateless by default; no account, DB, OAuth, or personal data persistence
- Tool count: 5
- Every tool includes `description`, `inputSchema`, and complete `annotations`
- Tool output is concise text, not raw API payloads

## Tools

- `wedding_timeline`: 예식일 기준 준비 일정 생성
- `wedding_budget_review`: 예산 항목 분석
- `vendor_quote_compare`: 업체 견적 비교
- `wedding_task_brief`: 역할 분담 브리프 작성
- `wedding_message_writer`: 가족/업체/친구에게 보낼 문구 작성

## Local Development

```bash
npm install
npm run dev
```

Health check:

```bash
curl http://localhost:3000/health
```

MCP Inspector:

```bash
npm run inspect
```

## PlayMCP in KC

Use this folder as a standalone Git repository root, or set the Dockerfile path to `wedding-manager-mcp/Dockerfile` when deploying from a monorepo.

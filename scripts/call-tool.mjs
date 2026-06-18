import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const samples = {
  wedding_timeline: {
    weddingDate: "2026-10-03",
    currentDate: "2026-06-18",
    priorities: ["예산", "웨딩홀", "양가 공유"]
  },
  wedding_budget_review: {
    totalBudget: "3천만원",
    expectedGiftMoney: "1천만원",
    items: [
      { name: "웨딩홀 식대와 대관료", amount: "1600만원", required: true },
      { name: "스드메 패키지", amount: "350만원", required: true },
      { name: "본식 스냅", amount: "180만원", required: true },
      { name: "드레스 업그레이드", amount: "80만원", required: false },
      { name: "청첩장과 답례품", amount: "120만원", required: true }
    ]
  },
  vendor_quote_compare: {
    quotes: [
      {
        vendorName: "A 웨딩홀",
        category: "웨딩홀",
        price: "1800만원",
        included: ["식대", "대관료"],
        excluded: ["봉사료", "음주류"],
        memo: "보증인원 200명"
      },
      {
        vendorName: "B 웨딩홀",
        category: "웨딩홀",
        price: "1950만원",
        included: ["식대", "대관료", "봉사료", "음주류", "보증인원"],
        excluded: [],
        memo: "보증인원 180명"
      }
    ]
  },
  wedding_task_brief: {
    audience: "양가 부모님",
    tasks: [
      { owner: "신랑", task: "웨딩홀 잔금일 확인", dueDate: "2026-09-01", status: "진행중" },
      { owner: "신부", task: "청첩장 문구 확정", dueDate: "2026-07-20", status: "todo" },
      { owner: "양가", task: "혼주 한복 일정 확정", dueDate: "2026-07-10", status: "확인필요" }
    ]
  },
  wedding_message_writer: {
    recipient: "업체",
    purpose: "본식 스냅 계약 전 확인",
    facts: ["원본 파일 포함 여부", "출장비 별도 여부", "잔금일과 취소 수수료 기준일"],
    tone: "정중하게"
  }
};

const requested = process.argv[2] ?? "all";
const toolNames = requested === "all" ? Object.keys(samples) : [requested];
for (const toolName of toolNames) {
  if (!samples[toolName]) {
    throw new Error(`Unknown sample tool: ${toolName}`);
  }
}

const port = 3201;
const child = spawn("node", ["dist/index.js"], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, PORT: String(port) },
  stdio: "ignore"
});

try {
  await waitForHealth(port);
  for (const toolName of toolNames) {
    const text = await callTool(port, toolName, samples[toolName]);
    console.log(`\n=== ${toolName} ===\n${text}\n`);
  }
} finally {
  child.kill();
}

async function callTool(portNumber, name, args) {
  const response = await fetch(`http://localhost:${portNumber}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "accept": "application/json, text/event-stream"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name, arguments: args }
    })
  });
  const body = await response.text();
  if (!response.ok) throw new Error(body);
  const dataLine = body.split("\n").find(line => line.startsWith("data: "));
  if (!dataLine) return body;
  const parsed = JSON.parse(dataLine.slice(6));
  return parsed.result?.content?.map(item => item.text).join("\n") ?? JSON.stringify(parsed, null, 2);
}

async function waitForHealth(portNumber) {
  for (let i = 0; i < 20; i += 1) {
    try {
      const response = await fetch(`http://localhost:${portNumber}/health`);
      if (response.ok) return;
    } catch {
      await delay(250);
    }
  }
  throw new Error("server did not become ready");
}

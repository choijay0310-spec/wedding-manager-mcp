import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const serviceName = "Wedding Manager MCP(웨딩 매니저 MCP)";

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true
};

const moneySchema = z.preprocess(value => parseMoney(value), z.number().nonnegative());
const optionalMoneySchema = z.preprocess(value => value == null || value === "" ? undefined : parseMoney(value), z.number().nonnegative().optional());

function parseMoney(value: unknown): unknown {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return value;

  const normalized = value.replace(/[, 원]/g, "").trim();
  if (/^\d+(\.\d+)?$/.test(normalized)) return Number(normalized);

  const match = normalized.match(/^(\d+(?:\.\d+)?)(천)?만$/);
  if (match) {
    const amount = Number(match[1]);
    return amount * (match[2] ? 10_000_000 : 10_000);
  }

  return value;
}

function parseDate(value: string): Date | null {
  const normalized = normalizeDateText(value);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function normalizeDateText(value: string): string {
  const trimmed = value.trim();
  const dashed = trimmed.match(/^(\d{4})[-.](\d{1,2})[-.](\d{1,2})$/);
  if (dashed) {
    return `${dashed[1]}-${dashed[2].padStart(2, "0")}-${dashed[3].padStart(2, "0")}`;
  }

  const korean = trimmed.match(/^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일?$/);
  if (korean) {
    return `${korean[1]}-${korean[2].padStart(2, "0")}-${korean[3].padStart(2, "0")}`;
  }

  return trimmed;
}

function daysBetween(from: Date, to: Date): number {
  const day = 24 * 60 * 60 * 1000;
  return Math.ceil((to.getTime() - from.getTime()) / day);
}

function money(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function normalizeStatus(status: string | undefined): "todo" | "doing" | "done" | "blocked" {
  if (!status) return "todo";
  const lower = status.toLowerCase();
  if (["done", "완료", "끝", "처리완료"].includes(lower)) return "done";
  if (["doing", "진행", "진행중", "작업중"].includes(lower)) return "doing";
  if (["blocked", "보류", "막힘", "확인필요"].includes(lower)) return "blocked";
  return "todo";
}

function normalizeRecipient(value: string): "family" | "vendor" | "friend" | "partner" {
  const lower = value.toLowerCase();
  if (["업체", "vendor", "웨딩홀", "스드메", "플래너"].some(token => lower.includes(token))) return "vendor";
  if (["가족", "부모", "양가", "family"].some(token => lower.includes(token))) return "family";
  if (["친구", "지인", "friend"].some(token => lower.includes(token))) return "friend";
  return "partner";
}

function normalizeTone(value: string | undefined): "polite" | "warm" | "firm" | "short" {
  if (!value) return "polite";
  const lower = value.toLowerCase();
  if (["짧게", "간단", "short"].some(token => lower.includes(token))) return "short";
  if (["단호", "확실", "firm"].some(token => lower.includes(token))) return "firm";
  if (["따뜻", "부드럽", "warm"].some(token => lower.includes(token))) return "warm";
  return "polite";
}

function timelineForDday(dday: number): string[] {
  if (dday < 0) {
    return [
      "예식이 이미 지난 날짜입니다. 정산, 사진 셀렉, 감사 인사, 계약 잔금 확인을 중심으로 정리하세요.",
      "업체별 잔금/추가금 영수증을 모으고, 축의금 기록과 실제 지출을 분리해 마감하세요.",
      "부모님, 사회자, 축가/도움 준 지인에게 감사 메시지를 먼저 보내세요."
    ];
  }
  if (dday > 240) {
    return [
      "웨딩홀 후보의 보증 인원, 식대, 음주류, 봉사료, 대관료 포함 여부를 같은 표로 비교하세요.",
      "양가가 원하는 날짜/지역/예산 상한을 먼저 합의해 검색 범위를 줄이세요.",
      "스드메는 계약 전 원본비, 헬퍼비, 피팅비, 출장비가 별도인지 확인하세요."
    ];
  }
  if (dday > 120) {
    return [
      "웨딩홀 계약 조건과 스드메 진행 일정을 캘린더에 고정하세요.",
      "혼주 한복/예복, 본식 스냅, DVD, 사회자, 축가 후보를 결정 단계로 넘기세요.",
      "계약금/중도금/잔금일을 따로 적어 현금 지출 시점을 놓치지 않게 하세요."
    ];
  }
  if (dday > 45) {
    return [
      "청첩장 문구, 모바일 청첩장, 하객 리스트, 식전영상, BGM을 확정하세요.",
      "보증 인원과 실제 참석 예상 인원의 차이를 다시 계산하세요.",
      "사회자 큐시트와 혼주/친구 역할 분담표를 공유 가능한 문장으로 정리하세요."
    ];
  }
  return [
    "최종 하객 수, 좌석/테이블, 식권, 답례품, 버스/주차 안내를 마감하세요.",
    "업체별 최종 잔금, 추가 옵션, 당일 담당자 연락처를 한 장으로 모으세요.",
    "양가와 공유할 당일 동선, 혼주 도착 시간, 촬영 순서를 짧게 정리하세요."
  ];
}

function classifyBudgetItem(name: string): "venue" | "vendor" | "beauty" | "guest" | "optional" | "other" {
  if (/홀|식대|보증|대관|음주|봉사/.test(name)) return "venue";
  if (/스냅|DVD|영상|사회|축가|플래너/.test(name)) return "vendor";
  if (/드레스|메이크|헤어|예복|한복|헬퍼|피팅/.test(name)) return "beauty";
  if (/청첩|답례|버스|주차|하객|식권/.test(name)) return "guest";
  if (/옵션|추가|업그레이드|앨범|원본/.test(name)) return "optional";
  return "other";
}

function quoteRisk(quote: { category: string; included?: string[]; excluded?: string[]; memo?: string }): string[] {
  const text = `${quote.category} ${(quote.included ?? []).join(" ")} ${quote.memo ?? ""}`;
  const checks = /홀|venue|식장/.test(text)
    ? ["식대", "보증인원", "봉사료", "음주류", "대관료"]
    : /스냅|사진|DVD|영상/.test(text)
      ? ["원본", "보정", "작가", "출장비", "앨범"]
      : /드레스|메이크|스드메/.test(text)
        ? ["피팅비", "헬퍼비", "업그레이드", "원본", "출장비"]
        : ["부가세", "출장비", "취소수수료", "잔금일"];

  const excludedNames = quote.excluded ?? [];
  const missing = checks.filter(item => !text.includes(item) && !excludedNames.some(excluded => excluded.includes(item)));
  const excluded = excludedNames.map(item => `${item} 별도`);
  return [...new Set([...missing, ...excluded])];
}

export function createWeddingMcpServer(): McpServer {
  const server = new McpServer({
    name: "wedding-manager-mcp",
    version: "0.1.0"
  });

  server.registerTool(
    "wedding_timeline",
    {
      title: "Wedding Timeline",
      description: `${serviceName}가 예식일까지 남은 기간을 기준으로 지금 해야 할 결혼 준비 일정과 확인 질문을 정리합니다.`,
      inputSchema: {
        weddingDate: z.string().describe("Wedding date. Supports YYYY-MM-DD, YYYY.M.D, or 2026년 10월 3일."),
        currentDate: z.string().optional().describe("Current date. Defaults to today."),
        priorities: z.array(z.string()).optional().describe("Known priorities such as venue, budget, family, guests, honeymoon.")
      },
      annotations: { title: "결혼 준비 일정", ...readOnlyAnnotations }
    },
    async ({ weddingDate, currentDate, priorities }) => {
      const target = parseDate(weddingDate);
      const today = currentDate ? parseDate(currentDate) : new Date();
      if (!target || !today) {
        return { content: [{ type: "text", text: "날짜를 확인해 주세요. 예: 2026-10-03, 2026.10.3, 2026년 10월 3일" }] };
      }

      const dday = daysBetween(today, target);
      const tasks = timelineForDday(dday);
      const focus = priorities?.length ? priorities.join(", ") : "예산, 하객, 업체 계약";

      return {
        content: [{
          type: "text",
          text: [
            `## ${serviceName} timeline`,
            dday >= 0 ? `예식일까지 D-${dday}일입니다.` : `예식일로부터 ${Math.abs(dday)}일 지났습니다.`,
            `우선순위: ${focus}`,
            "",
            "### 지금 바로 할 일",
            ...tasks.map(task => `- ${task}`),
            "",
            "### 놓치기 쉬운 확인 질문",
            "- 계약서에 포함/별도 비용이 문장으로 적혀 있나요?",
            "- 부모님께 공유해야 할 결정 사항이 3개 이하로 정리되어 있나요?",
            "- 잔금일과 취소 수수료 기준일을 캘린더에 넣었나요?"
          ].join("\n")
        }]
      };
    }
  );

  server.registerTool(
    "wedding_budget_review",
    {
      title: "Wedding Budget Review",
      description: `${serviceName}가 결혼 준비 예산, 예상 축의금 반영 후 현금 부담, 누락된 지출 항목, 줄일 수 있는 비용 후보를 점검합니다.`,
      inputSchema: {
        totalBudget: moneySchema.describe("Total wedding budget in KRW. Strings like 3천만원 are accepted."),
        expectedGiftMoney: optionalMoneySchema.describe("Expected congratulatory money offset, if the user wants cash-flow view."),
        items: z.array(z.object({
          name: z.string(),
          amount: moneySchema,
          required: z.boolean().optional()
        })).describe("Budget items with KRW amounts.")
      },
      annotations: { title: "결혼 예산 점검", ...readOnlyAnnotations }
    },
    async ({ totalBudget, expectedGiftMoney, items }) => {
      const spent = items.reduce((sum, item) => sum + item.amount, 0);
      const remaining = totalBudget - spent;
      const cashNeed = spent - (expectedGiftMoney ?? 0);
      const buckets = items.reduce<Record<string, number>>((acc, item) => {
        const bucket = classifyBudgetItem(item.name);
        acc[bucket] = (acc[bucket] ?? 0) + item.amount;
        return acc;
      }, {});
      const missing = [
        ["venue", "웨딩홀/식대/보증인원"],
        ["beauty", "드레스/메이크업/예복/한복"],
        ["vendor", "스냅/DVD/사회자/축가"],
        ["guest", "청첩장/답례품/버스/주차"]
      ].filter(([key]) => !buckets[key]).map(([, label]) => label);
      const optionalCandidates = items.filter(item => item.required === false || classifyBudgetItem(item.name) === "optional");

      return {
        content: [{
          type: "text",
          text: [
            `## ${serviceName} budget review`,
            `총예산: ${money(totalBudget)}`,
            `입력된 지출 합계: ${money(spent)}`,
            `잔여/초과: ${money(remaining)}`,
            expectedGiftMoney ? `예상 축의금 반영 후 현금 부담: ${money(cashNeed)}` : "예상 축의금은 입력되지 않았습니다. 현금 흐름은 보수적으로 지출 전액 기준으로 보세요.",
            "",
            "### 항목별 분포",
            `- 웨딩홀/식대: ${money(buckets.venue ?? 0)}`,
            `- 스드메/예복/한복: ${money(buckets.beauty ?? 0)}`,
            `- 본식 업체: ${money(buckets.vendor ?? 0)}`,
            `- 하객/운영: ${money(buckets.guest ?? 0)}`,
            `- 옵션/기타: ${money((buckets.optional ?? 0) + (buckets.other ?? 0))}`,
            "",
            "### 바로 볼 리스크",
            remaining < 0 ? `- 예산을 ${money(Math.abs(remaining))} 초과했습니다.` : `- 현재 ${money(remaining)} 여유가 있습니다.`,
            missing.length ? `- 아직 입력되지 않은 큰 항목: ${missing.join(", ")}` : "- 주요 항목은 모두 한 번씩 입력되어 있습니다.",
            optionalCandidates.length ? `- 줄이기 후보: ${optionalCandidates.map(item => `${item.name} ${money(item.amount)}`).join(", ")}` : "- 선택/옵션 항목이 따로 표시되지 않았습니다.",
            "- 하객 50명이 늘거나 줄면 식대와 답례품이 크게 바뀝니다. 식대 단가를 별도 항목으로 두면 재계산이 쉬워집니다."
          ].join("\n")
        }]
      };
    }
  );

  server.registerTool(
    "vendor_quote_compare",
    {
      title: "Vendor Quote Compare",
      description: `${serviceName}가 웨딩홀, 스드메, 본식 스냅 등 업체 견적을 비교하고 별도 비용과 계약 리스크를 찾아줍니다.`,
      inputSchema: {
        quotes: z.array(z.object({
          vendorName: z.string(),
          category: z.string(),
          price: moneySchema,
          included: z.array(z.string()).optional(),
          excluded: z.array(z.string()).optional(),
          memo: z.string().optional()
        })).min(2).describe("At least two vendor quotes to compare.")
      },
      annotations: { title: "업체 견적 비교", ...readOnlyAnnotations }
    },
    async ({ quotes }) => {
      const enriched = quotes
        .map(quote => ({ ...quote, risks: quoteRisk(quote) }))
        .sort((a, b) => a.price - b.price);
      const cheapest = enriched[0];
      const bestComparable = [...enriched].sort((a, b) => a.risks.length - b.risks.length || a.price - b.price)[0];

      return {
        content: [{
          type: "text",
          text: [
            `## ${serviceName} vendor comparison`,
            `가장 낮은 견적: ${cheapest.vendorName} ${money(cheapest.price)}`,
            `가장 비교 가능한 견적: ${bestComparable.vendorName} (${bestComparable.risks.length}개 확인 필요)`,
            "",
            "### 견적별 리스크",
            ...enriched.map(quote => {
              const risk = quote.risks.length ? `확인 필요: ${quote.risks.join(", ")}` : "핵심 누락 항목이 적습니다";
              const excluded = quote.excluded?.length ? ` / 별도: ${quote.excluded.join(", ")}` : "";
              return `- ${quote.vendorName} (${quote.category}) ${money(quote.price)}: ${risk}${excluded}`;
            }),
            "",
            "### 업체에 보낼 확인 질문",
            "- 이 견적에 부가세, 봉사료, 출장비, 원본/보정본, 취소 수수료가 모두 포함되어 있나요?",
            "- 계약 후 추가될 수 있는 옵션과 최대 금액을 적어주실 수 있나요?",
            "- 잔금일과 일정 변경 수수료 기준일을 계약서에 명시할 수 있나요?"
          ].join("\n")
        }]
      };
    }
  );

  server.registerTool(
    "wedding_task_brief",
    {
      title: "Wedding Task Brief",
      description: `${serviceName}가 결혼 준비 작업을 담당자별로 정리하고 가족이나 파트너에게 공유할 수 있는 진행 브리프를 만듭니다.`,
      inputSchema: {
        tasks: z.array(z.object({
          task: z.string(),
          owner: z.string(),
          dueDate: z.string().optional(),
          status: z.string().optional()
        })).describe("Wedding tasks to summarize."),
        audience: z.string().optional().describe("Audience such as parents, partner, planner, or friends.")
      },
      annotations: { title: "역할 분담 브리프", ...readOnlyAnnotations }
    },
    async ({ tasks, audience }) => {
      const active = tasks.map(task => ({ ...task, normalizedStatus: normalizeStatus(task.status) })).filter(task => task.normalizedStatus !== "done");
      const blocked = active.filter(task => task.normalizedStatus === "blocked");
      return {
        content: [{
          type: "text",
          text: [
            `## ${serviceName} task brief`,
            `공유 대상: ${audience ?? "결혼 준비 팀"}`,
            "",
            "### 담당자별 진행 필요",
            ...(active.length ? active.map(task => `- ${task.owner}: ${task.task}${task.dueDate ? ` (${task.dueDate}까지)` : ""}${task.normalizedStatus === "blocked" ? " - 확인 필요" : ""}`) : ["- 현재 남은 작업이 없습니다."]),
            "",
            blocked.length ? `### 먼저 풀어야 할 막힘\n${blocked.map(task => `- ${task.task}`).join("\n")}` : "### 먼저 풀어야 할 막힘\n- 현재 보류로 표시된 작업은 없습니다.",
            "",
            "### 그대로 보낼 공유 문구",
            `현재 남은 결혼 준비 작업은 ${active.length}개입니다. 담당자별로 필요한 것만 정리했으니 각자 맡은 항목의 일정과 막힌 부분만 확인 부탁드립니다.`
          ].join("\n")
        }]
      };
    }
  );

  server.registerTool(
    "wedding_message_writer",
    {
      title: "Wedding Message Writer",
      description: `${serviceName}가 가족, 파트너, 친구, 웨딩 업체에 보낼 결혼 준비 공유 문구와 확인 요청 메시지를 작성합니다.`,
      inputSchema: {
        recipient: z.string().describe("Recipient such as family, 업체, friend, partner."),
        purpose: z.string().describe("Message purpose."),
        facts: z.array(z.string()).describe("Facts to include."),
        tone: z.string().optional().describe("Tone such as 정중하게, 따뜻하게, 단호하게, 짧게.")
      },
      annotations: { title: "공유 문구 작성", ...readOnlyAnnotations }
    },
    async ({ recipient, purpose, facts, tone }) => {
      const target = normalizeRecipient(recipient);
      const normalizedTone = normalizeTone(tone);
      const factLine = facts.join(", ");
      const vendorEnding = normalizedTone === "firm" ? "가능 여부와 추가 비용을 오늘 중 회신 부탁드립니다." : "확인 가능하실 때 회신 부탁드립니다.";
      const variants = target === "vendor"
        ? [
            `안녕하세요. ${purpose} 관련해서 확인 요청드립니다. ${factLine}. ${vendorEnding}`,
            `안녕하세요. 아래 내용 기준으로 진행 가능 여부와 견적 변동 여부 확인 부탁드립니다.\n${facts.map(fact => `- ${fact}`).join("\n")}\n감사합니다.`
          ]
        : [
            `${purpose} 관련해서 공유드려요. ${factLine}. 확인 필요한 부분 있으면 편하게 말씀 주세요.`,
            `안녕하세요. 결혼 준비 상황 공유드립니다.\n${facts.map(fact => `- ${fact}`).join("\n")}\n각자 확인 필요한 부분만 봐주시면 감사하겠습니다.`
          ];

      return {
        content: [{
          type: "text",
          text: [
            `## ${serviceName} message`,
            `대상: ${recipient} / 톤: ${normalizedTone}`,
            "",
            "### 카톡용 짧은 문구",
            variants[0],
            "",
            "### 정리해서 보내는 문구",
            variants[1]
          ].join("\n")
        }]
      };
    }
  );

  return server;
}

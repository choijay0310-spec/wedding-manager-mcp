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

function percent(part: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function normalizeStatus(status: string | undefined): "todo" | "doing" | "done" | "blocked" {
  if (!status) return "todo";
  const lower = status.toLowerCase().replace(/\s+/g, "");
  if (["done", "완료", "끝", "처리완료"].includes(lower)) return "done";
  if (["doing", "진행", "진행중", "작업중"].includes(lower)) return "doing";
  if (["blocked", "보류", "막힘", "확인필요", "필요"].includes(lower)) return "blocked";
  if (lower.includes("확인") || lower.includes("필요") || lower.includes("대기")) return "blocked";
  return "todo";
}

function statusLabel(status: "todo" | "doing" | "done" | "blocked"): string {
  if (status === "doing") return "진행중";
  if (status === "done") return "완료";
  if (status === "blocked") return "확인 필요";
  return "미시작";
}

function taskCheckTarget(task: { task: string; owner: string }): string {
  if (/웨딩홀|식대|보증|잔금/.test(task.task)) return "웨딩홀 담당자";
  if (/청첩/.test(task.task)) return "청첩장 업체 또는 문구 결정자";
  if (/한복|예복|드레스|메이크/.test(task.task)) return "의상 업체와 양가 부모님";
  if (/축가/.test(task.task)) return "축가 후보자";
  if (/사회자/.test(task.task)) return "사회자 후보 또는 섭외 담당자";
  if (/하객|리스트|명단/.test(task.task)) return "양가 부모님";
  if (task.owner === "양가") return "양가 부모님";
  if (/친구|지인/.test(task.owner)) return "해당 지인";
  return "관련 담당자";
}

function followUpPrompt(topic: string): string {
  return `${topic}도 이어서 정리해드릴까요?`;
}

function timelineFollowUpTopic(dday: number, priorities: string[] | undefined): string {
  const priorityText = (priorities ?? []).join(" ").toLowerCase();
  if (dday < 0) return "정산과 감사 인사";
  if (dday <= 45) return "본식 최종 체크리스트";
  if (/honeymoon|신혼|여행/.test(priorityText)) return "신혼여행 준비";
  return "부모님 공유 문구";
}

function taskMeta(task: { dueDate?: string; normalizedStatus: "todo" | "doing" | "done" | "blocked" }): string {
  const parts = [statusLabel(task.normalizedStatus)];
  if (task.dueDate) parts.push(`${task.dueDate}까지`);
  return parts.join(", ");
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

function vendorFactRequest(fact: string): string {
  if (/잔금|취소|변경|수수료|기준일|납품일|마감/.test(fact)) {
    return `${fact}: 정확한 날짜, 발생 조건, 계약서 반영 가능 여부 확인 부탁드립니다.`;
  }
  if (/출장|추가|별도|금액|비용|봉사료|음주류|앨범|원본|보정/.test(fact)) {
    return `${fact}: 포함/별도 여부와 추가 금액 상한 확인 부탁드립니다.`;
  }
  return `${fact}: 가능 여부와 견적 변동 여부 확인 부탁드립니다.`;
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

function pendingTimelineAdvice(openItems: string[] | undefined): string[] {
  if (!openItems?.length) return [];

  return openItems.map(item => {
    if (/청첩|초대/.test(item)) {
      return `${item}: 문구 확정 -> 모바일/종이 제작 -> 발송 대상 분리까지 마감하세요. 늦어지면 참석률 예측과 보증 인원 조정이 같이 밀립니다.`;
    }
    if (/하객|명단|리스트|인원/.test(item)) {
      return `${item}: 양가/친구/직장으로 나누고 참석 가능성을 높음/보통/낮음으로 표시하세요. 보증 인원 변경 가능일 전까지 숫자를 잠가야 식대 손실을 줄입니다.`;
    }
    if (/BGM|음악|식전영상|영상|축가/.test(item)) {
      return `${item}: 곡/영상 후보를 3개 이하로 줄이고 사회자 큐시트와 입장/퇴장 타이밍에 연결하세요. 늦어지면 리허설과 음향 체크가 부실해집니다.`;
    }
    if (/잔금|계약|취소|수수료/.test(item)) {
      return `${item}: 계약서 문장, 잔금일, 변경/취소 수수료 기준일을 캘린더에 같이 넣으세요.`;
    }
    if (/한복|예복|드레스|메이크|스드메/.test(item)) {
      return `${item}: 피팅/수령/반납 날짜와 별도 비용을 같은 메모에 묶어 확인하세요.`;
    }
    return `${item}: 담당자, 마감일, 업체 확인 필요 여부를 정해서 오늘 안에 다음 행동 1개를 확정하세요.`;
  });
}

function classifyBudgetItem(name: string): "venue" | "vendor" | "beauty" | "guest" | "optional" | "other" {
  if (/옵션|추가|업그레이드|앨범|원본/.test(name)) return "optional";
  if (/홀|식대|보증|대관|음주|봉사/.test(name)) return "venue";
  if (/스냅|DVD|영상|사회|축가|플래너/.test(name)) return "vendor";
  if (/스드메|드레스|메이크|헤어|예복|한복|헬퍼|피팅/.test(name)) return "beauty";
  if (/청첩|답례|버스|주차|하객|식권/.test(name)) return "guest";
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

function quoteQuestionSet(quotes: Array<{ category: string; included?: string[]; excluded?: string[]; memo?: string }>): string[] {
  const text = quotes
    .map(quote => `${quote.category} ${(quote.included ?? []).join(" ")} ${(quote.excluded ?? []).join(" ")} ${quote.memo ?? ""}`)
    .join(" ");

  if (/홀|venue|식장|뷔페|식대|보증인원/.test(text)) {
    return [
      "식대, 보증인원, 대관료, 음주류, 봉사료, 부가세가 각각 포함인지 별도인지 계약서에 문장으로 적을 수 있나요?",
      "최소 보증 인원 변경 가능 시점, 식권 정산 방식, 주차/버스/폐백실 비용을 알려주실 수 있나요?",
      "잔금일, 날짜 변경 수수료, 취소 수수료 기준일을 계약서에 명시할 수 있나요?"
    ];
  }

  if (/스냅|사진|DVD|영상|앨범|보정|원본/.test(text)) {
    return [
      "원본 제공, 보정 컷 수, 앨범 포함 여부, 납품 예정일이 견적에 포함되어 있나요?",
      "대표 작가 지정, 2인 촬영, 촬영 시작/종료 시간, 출장비가 별도인지 확인 부탁드립니다.",
      "잔금일, 일정 변경 수수료, 취소 수수료와 파일 보관 기간을 계약서에 명시할 수 있나요?"
    ];
  }

  if (/스드메|드레스|메이크|헤어|피팅|헬퍼/.test(text)) {
    return [
      "피팅비, 헬퍼비, 드레스 업그레이드, 메이크업 리허설 비용이 포함인지 별도인지 알려주실 수 있나요?",
      "촬영 드레스와 본식 드레스의 선택 범위, 추가금이 붙는 기준, 출장비 여부를 확인 부탁드립니다.",
      "변경 가능 횟수, 잔금일, 취소 수수료 기준일을 계약서에 명시할 수 있나요?"
    ];
  }

  return [
    "이 견적에서 포함/별도 비용을 항목별로 나눠 계약서에 적을 수 있나요?",
    "계약 후 추가될 수 있는 옵션과 최대 금액을 알려주실 수 있나요?",
    "잔금일, 일정 변경 수수료, 취소 수수료 기준일을 계약서에 명시할 수 있나요?"
  ];
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
        priorities: z.array(z.string()).optional().describe("Known priorities such as venue, budget, family, guests, honeymoon."),
        openItems: z.array(z.string()).optional().describe("아직 못 끝낸 준비 항목. 예: 청첩장, 하객 리스트, BGM, 식전영상.")
      },
      annotations: { title: "결혼 준비 일정", ...readOnlyAnnotations }
    },
    async ({ weddingDate, currentDate, priorities, openItems }) => {
      const target = parseDate(weddingDate);
      const today = currentDate ? parseDate(currentDate) : new Date();
      if (!target || !today) {
        return { content: [{ type: "text", text: "날짜를 확인해 주세요. 예: 2026-10-03, 2026.10.3, 2026년 10월 3일" }] };
      }

      const dday = daysBetween(today, target);
      const tasks = timelineForDday(dday);
      const focus = priorities?.length ? priorities.join(", ") : "예산, 하객, 업체 계약";
      const pendingAdvice = pendingTimelineAdvice(openItems);

      return {
        content: [{
          type: "text",
          text: [
            dday >= 0 ? `예식일까지 D-${dday}일입니다.` : `예식일로부터 ${Math.abs(dday)}일 지났습니다.`,
            `먼저 볼 우선순위는 ${focus}입니다.`,
            "",
            "### 먼저 할 2가지",
            ...(pendingAdvice.length ? pendingAdvice.slice(0, 2).map(task => `- ${task}`) : tasks.slice(0, 2).map(task => `- ${task}`)),
            "",
            `다음 단계로 ${timelineFollowUpTopic(dday, priorities)}도 정리해드릴까요?`
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
      const optionalCandidates = items.filter(item => item.required === false || classifyBudgetItem(item.name) === "optional");

      return {
        content: [{
          type: "text",
          text: [
            `${remaining < 0 ? "예산을 초과했습니다." : remaining / totalBudget < 0.15 ? "예산 여유가 크지 않습니다." : "현재는 예산 안에 있습니다."}`,
            `총예산 ${money(totalBudget)} 중 현재 지출은 ${money(spent)}입니다.`,
            `잔여/초과는 ${money(remaining)} (${percent(remaining, totalBudget)})입니다.`,
            expectedGiftMoney ? `예상 축의금 반영 후 현금 부담은 ${money(cashNeed)}입니다.` : "예상 축의금은 입력되지 않았습니다. 현금 흐름은 지출 전액 기준으로 보세요.",
            "",
            "### 핵심 판단",
            optionalCandidates.length ? `- 먼저 줄일 후보: ${optionalCandidates.slice(0, 2).map(item => `${item.name} ${money(item.amount)}`).join(", ")}` : "- 선택 옵션이 따로 표시되지 않았습니다. 필수/선택 여부를 붙이면 삭감 순서가 보입니다.",
            expectedGiftMoney ? "- 축의금은 예식 후 들어오는 돈입니다. 잔금일이 예식 전이면 선현금 부족 가능성을 따로 봐야 합니다." : "- 축의금 예상액을 넣으면 예식 후 최종 부담과 예식 전 선현금을 나눠 볼 수 있습니다.",
            "",
            followUpPrompt("협상/삭제/보류 후보")
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
      const questions = quoteQuestionSet(quotes);
      const comparableGap = Math.max(0, bestComparable.price - cheapest.price);

      return {
        content: [{
          type: "text",
          text: [
            `가장 낮은 견적은 ${cheapest.vendorName} ${money(cheapest.price)}입니다.`,
            `다만 비교 기준으로는 ${bestComparable.vendorName}이 가장 안정적입니다.`,
            "",
            "### 핵심 판단",
            `- ${cheapest.vendorName}은 표시 견적이 가장 낮지만 별도 비용이 ${money(comparableGap)} 이상 붙으면 ${bestComparable.vendorName}과 가격 차이가 사라집니다.`,
            `- ${bestComparable.vendorName}은 확인 필요 항목 ${bestComparable.risks.length}개라 계약서 비교 기준으로 먼저 삼기 좋습니다.`,
            "",
            "### 업체에 먼저 물어볼 것",
            ...questions.slice(0, 2).map(question => `- ${question}`),
            "",
            followUpPrompt("업체에 보낼 확인 메시지")
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
      const active = tasks
        .map(task => ({ ...task, normalizedStatus: normalizeStatus(task.status) }))
        .filter(task => task.normalizedStatus !== "done")
        .sort((a, b) => {
          if (a.normalizedStatus === "blocked" && b.normalizedStatus !== "blocked") return -1;
          if (a.normalizedStatus !== "blocked" && b.normalizedStatus === "blocked") return 1;
          return (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31");
        });
      const blocked = active.filter(task => task.normalizedStatus === "blocked");
      const owners = [...new Set(active.map(task => task.owner))];
      return {
        content: [{
          type: "text",
          text: [
            `공유 대상: ${audience ?? "결혼 준비 팀"}`,
            "",
            "### 요약",
            `- 남은 작업 ${active.length}개, 확인 필요 ${blocked.length}개, 담당자 ${owners.length}명입니다.`,
            blocked.length ? "- 확인 필요 항목부터 먼저 풀어야 뒤 일정이 밀리지 않습니다." : "- 현재 막힌 항목은 없습니다. 마감일이 가까운 순서로 처리하면 됩니다.",
            "",
            "### 오늘 보낼 확인 요청",
            ...(active.length ? active.slice(0, 2).map(task => `- ${task.owner} -> 확인 대상: ${taskCheckTarget(task)} / ${taskMeta(task)} / 요청: ${task.task} 가능 여부와 막힌 부분을 오늘 공유`) : ["- 보낼 요청이 없습니다."]),
            "",
            followUpPrompt("부모님께 보낼 공유 문구")
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
      const factLine = facts.join(" / ");
      const vendorEnding = normalizedTone === "firm" ? "가능 여부, 추가 비용, 계약서 반영 가능 여부를 오늘 중 회신 부탁드립니다." : "가능 여부와 추가 비용이 있다면 함께 회신 부탁드립니다.";
      const shortPrefix = normalizedTone === "warm" ? "안녕하세요. 준비 상황 공유드려요." : "안녕하세요.";
      const variants = target === "vendor"
        ? [
            `안녕하세요. ${purpose} 관련해 확인 부탁드립니다. ${factLine}. ${vendorEnding}`,
            `안녕하세요. ${purpose} 관련해서 아래 항목 확인 요청드립니다.\n${facts.map(fact => `- ${vendorFactRequest(fact)}`).join("\n")}\n가능하다면 답변 내용을 견적서 또는 계약서에 반영 부탁드립니다. 감사합니다.`
          ]
        : [
            `${shortPrefix} ${purpose} 관련해서 공유드립니다. ${factLine}. 결정이 필요한 부분만 답변 부탁드려요.`,
            `안녕하세요. ${purpose} 관련해서 정리드립니다.\n${facts.map(fact => `- ${fact}`).join("\n")}\n각자 확인 가능한 부분만 먼저 봐주시고, 의견이 필요한 항목은 답변 부탁드립니다.`
          ];

      return {
        content: [{
          type: "text",
          text: [
            `대상: ${recipient} / 톤: ${normalizedTone}`,
            "",
            "### 카톡용 짧은 문구",
            variants[0],
            "",
            "필요하면 더 정중하거나 단호한 버전으로 바꿔드릴게요."
          ].join("\n")
        }]
      };
    }
  );

  return server;
}

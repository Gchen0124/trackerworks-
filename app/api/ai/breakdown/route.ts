import { NextRequest, NextResponse } from "next/server"

// Provider-agnostic: supports OpenAI-compatible endpoints
// Configure via env:
// - OPENAI_API_KEY (required unless using OPENROUTER_API_KEY)
// - OPENAI_BASE_URL (optional; default https://api.openai.com/v1)
// - OPENAI_MODEL (optional; default gpt-4o-mini)
// Or use OpenRouter:
// - OPENROUTER_API_KEY
// - OPENAI_BASE_URL=https://openrouter.ai/api/v1
// - OPENAI_MODEL=openrouter/anthropic/claude-3.5-sonnet or similar

const DEFAULT_BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"

function getAuthHeader() {
  const key = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY
  if (!key) return null
  return `Bearer ${key}`
}

function buildMessages(payload: any) {
  const { parentLabel, scopeType, chat } = payload || {}
  const system = {
    role: "system",
    content:
      "You are an expert productivity coach. Given a goal and an optional ongoing chat, propose a concise list of sub-tasks (or micro-steps) that can fit into 30-minute blocks (for tasks) or ~3-6 minutes (for micro-steps). Return strict JSON with fields: items: [{title: string, estimate_min?: number}], and reply: string (assistant natural language response). Focus on clarity, actionability, and realistic estimates.",
  }
  const userStart = {
    role: "user",
    content: `Goal context: ${parentLabel || "(none)"}. Scope: ${scopeType || "task"}. Please propose an updated JSON plan.`,
  }
  const msgs = [system, userStart]
  if (Array.isArray(chat)) {
    for (const m of chat) {
      if (m && (m.role === "user" || m.role === "assistant")) {
        msgs.push({ role: m.role, content: String(m.content || "") })
      }
    }
  }
  // Final explicit instruction
  msgs.push({ role: "user", content: "Return only JSON with keys: items, reply. No code fences." })
  return msgs
}

export async function POST(req: NextRequest) {
  try {
    const auth = getAuthHeader()
    if (!auth) {
      return NextResponse.json({ error: "Missing API key. Set OPENAI_API_KEY or OPENROUTER_API_KEY." }, { status: 400 })
    }

    const payload = await req.json()
    const { goalId, parentId, scopeType, parentLabel, chat } = payload || {}

    const body = {
      model: DEFAULT_MODEL,
      messages: buildMessages({ parentLabel, scopeType, chat }),
      temperature: 0.3,
    }

    const res = await fetch(`${DEFAULT_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": auth,
        "Content-Type": "application/json",
        ...(process.env.OPENROUTER_API_KEY ? { "HTTP-Referer": "https://local.app", "X-Title": "TrackerWorks" } : {}),
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: "LLM error", detail: text }, { status: 502 })
    }

    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content || ""

    // Try to parse strict JSON; also handle accidental code fences
    let jsonStr = content.trim()
    jsonStr = jsonStr.replace(/^```(json)?/i, "").replace(/```$/i, "").trim()

    let parsed: any
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      // Attempt to extract JSON substring
      const match = jsonStr.match(/\{[\s\S]*\}$/)
      if (match) {
        parsed = JSON.parse(match[0])
      } else {
        return NextResponse.json({ error: "Parse error", raw: content }, { status: 502 })
      }
    }

    const items = Array.isArray(parsed?.items)
      ? parsed.items.map((it: any, i: number) => ({
          title: String(it?.title || `Task ${i + 1}`),
          estimate_min: typeof it?.estimate_min === "number" ? it.estimate_min : undefined,
        }))
      : []

    const reply = typeof parsed?.reply === "string" ? parsed.reply : ""

    return NextResponse.json({ items, reply, goalId, parentId, scopeType })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 })
  }
}

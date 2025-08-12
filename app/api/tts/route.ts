import { NextRequest } from "next/server"

// Simple proxy to Hugging Face Inference API for TTS
// Model: fishaudio/openaudio-s1-mini
// Usage: POST /api/tts { text: string, format?: "wav" | "mp3" }

const HF_MODEL = "fishaudio/openaudio-s1-mini"
const HF_ENDPOINT = `https://api-inference.huggingface.co/models/${HF_MODEL}`

export async function POST(req: NextRequest) {
  try {
    const token = process.env.HUGGINGFACE_API_TOKEN
    if (!token) {
      return new Response(JSON.stringify({ error: "HUGGINGFACE_API_TOKEN not set" }), { status: 503 })
    }

    const body = await req.json().catch(() => ({})) as { text?: string; format?: "wav" | "mp3" }
    const text = (body?.text || "").toString().trim()
    const format = body?.format || "mp3"

    if (!text) {
      return new Response(JSON.stringify({ error: "Missing text" }), { status: 400 })
    }

    // HF Inference API typically accepts { inputs: string } for text -> audio models.
    // Some models support additional params; keep minimal for compatibility.
    const hfRes = await fetch(HF_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: format === "wav" ? "audio/wav" : "audio/mpeg",
      },
      body: JSON.stringify({ inputs: text }),
      // Note: HF will warm the model on first request which can be slow.
    })

    // If the model is warming up, HF returns 503 with JSON message
    const contentType = hfRes.headers.get("content-type") || ""
    if (!hfRes.ok) {
      const errorPayload = contentType.includes("application/json") ? await hfRes.json().catch(() => ({})) : await hfRes.text().catch(() => "")
      return new Response(JSON.stringify({ error: "hf_error", detail: errorPayload || (await hfRes.text().catch(() => "")) }), { status: 502 })
    }

    // Pipe binary audio payload through
    const arrayBuffer = await hfRes.arrayBuffer()
    const mime = contentType.includes("audio/") ? contentType : (format === "wav" ? "audio/wav" : "audio/mpeg")
    return new Response(Buffer.from(arrayBuffer), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Cache-Control": "no-store", // avoid caching dynamic speech
      },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: "server_error", detail: String(e?.message || e) }), { status: 500 })
  }
}

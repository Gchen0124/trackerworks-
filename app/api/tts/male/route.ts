import { NextRequest } from "next/server"

// Proxy to Hugging Face Inference API using Bark with a male preset
// Model: suno/bark
// Usage: POST /api/tts/male { text: string, format?: "wav" | "mp3" }

const HF_MODEL = "suno/bark"
const HF_ENDPOINT = `https://api-inference.huggingface.co/models/${HF_MODEL}`

export async function POST(req: NextRequest) {
  try {
    const token = process.env.HUGGINGFACE_API_TOKEN
    if (!token) {
      return new Response(JSON.stringify({ error: "HUGGINGFACE_API_TOKEN not set" }), { status: 503 })
    }

    const body = (await req.json().catch(() => ({}))) as { text?: string; format?: "wav" | "mp3" }
    const text = (body?.text || "").toString().trim()
    const format = body?.format || "mp3"

    if (!text) {
      return new Response(JSON.stringify({ error: "Missing text" }), { status: 400 })
    }

    // Bark accepts voice presets; choose a male English preset
    // Common options: v2/en_speaker_6 (male), v2/en_speaker_9 (male)
    const params = { voice_preset: "v2/en_speaker_6" }

    const hfRes = await fetch(HF_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: format === "wav" ? "audio/wav" : "audio/mpeg",
      },
      body: JSON.stringify({ inputs: text, parameters: params }),
    })

    const contentType = hfRes.headers.get("content-type") || ""
    if (!hfRes.ok) {
      const errorPayload = contentType.includes("application/json") ? await hfRes.json().catch(() => ({})) : await hfRes.text().catch(() => "")
      return new Response(
        JSON.stringify({ error: "hf_error", detail: errorPayload || (await hfRes.text().catch(() => "")) }),
        { status: 502 },
      )
    }

    const arrayBuffer = await hfRes.arrayBuffer()
    const mime = contentType.includes("audio/") ? contentType : format === "wav" ? "audio/wav" : "audio/mpeg"
    return new Response(Buffer.from(arrayBuffer), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Cache-Control": "no-store",
      },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: "server_error", detail: String(e?.message || e) }), { status: 500 })
  }
}

// W's voice: a warm female Thai voice made on the server (Azure "Premwadee", or an ElevenLabs voice).
// Not configured → 501, and the app falls back to the phone's own Thai voice.
import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/server/admin";

const xml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

export async function POST(req: Request) {
  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  if (!text?.trim() || text.length > 1500) return NextResponse.json({ error: "bad text" }, { status: 400 });
  const azure = process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION;
  const eleven = process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID;
  if (!azure && !eleven) return NextResponse.json({ error: "voice not configured" }, { status: 501 });
  // signed-in users only (voice costs money per character)
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const ok = token && process.env.FIREBASE_SERVICE_ACCOUNT ? await adminAuth().verifyIdToken(token).then(() => true, () => false) : false;
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const res = azure
    ? await fetch(`https://${process.env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: "POST", signal: AbortSignal.timeout(15_000),
        headers: { "Ocp-Apim-Subscription-Key": process.env.AZURE_SPEECH_KEY!, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3" },
        body: `<speak version="1.0" xml:lang="th-TH"><voice name="${process.env.AZURE_SPEECH_VOICE ?? "th-TH-PremwadeeNeural"}"><prosody rate="-3%" pitch="+2%">${xml(text)}</prosody></voice></speak>`,
      })
    : await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`, {
        method: "POST", signal: AbortSignal.timeout(20_000),
        headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL ?? "eleven_v3", language_code: "th" }),
      });
  if (!res.ok) return NextResponse.json({ error: `voice ${res.status}` }, { status: 502 });
  return new NextResponse(res.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" } });
}

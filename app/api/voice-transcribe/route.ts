import { NextRequest, NextResponse } from "next/server";
import { guardAIRequest } from "@/lib/ai/usage-guard";

// Receives an audio file from the client (recorded via MediaRecorder),
// forwards it to OpenAI Whisper, and returns the transcript as text.
// Works with webm, mp4, and any other format Whisper accepts.

export async function POST(
  req: NextRequest
): Promise<NextResponse<{ transcript: string } | { error: string }>> {
  // Verified login + daily cap - see lib/ai/usage-guard.ts.
  const guard = await guardAIRequest("voice-transcribe", req);
  if (!guard.ok) return guard.response;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });
  }

  let audioFile: File | null = null;
  try {
    const formData = await req.formData();
    audioFile = formData.get("audio") as File | null;
  } catch {
    return NextResponse.json({ error: "Could not parse audio upload" }, { status: 400 });
  }

  if (!audioFile || audioFile.size === 0) {
    return NextResponse.json({ error: "No audio received" }, { status: 400 });
  }
  // Whisper rejects files over 25MB anyway; cap below that.
  if (audioFile.size > 24 * 1024 * 1024) {
    return NextResponse.json({ error: "Recording is too long - try a shorter one" }, { status: 413 });
  }

  // Forward to OpenAI Whisper
  const whisperForm = new FormData();
  // Use the file's actual type for the extension — Whisper needs a real extension
  const ext = audioFile.type.includes("mp4") ? "mp4" : "webm";
  whisperForm.append("file", audioFile, `recording.${ext}`);
  whisperForm.append("model", "whisper-1");
  whisperForm.append("language", "en");
  // Prompt helps Whisper understand S&C terminology
  whisperForm.append(
    "prompt",
    "Strength and conditioning session. Exercises, sets, reps, kilograms, RPE, rest periods."
  );

  let whisperRes: Response;
  try {
    whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: whisperForm,
    });
  } catch {
    return NextResponse.json({ error: "Could not reach Whisper API" }, { status: 502 });
  }

  if (!whisperRes.ok) {
    const detail = await whisperRes.text().catch(() => "");
    return NextResponse.json(
      { error: `Whisper failed (${whisperRes.status}): ${detail}` },
      { status: 500 }
    );
  }

  const data = await whisperRes.json();
  return NextResponse.json({ transcript: data.text ?? "" });
}

import type OpenAI from "openai";

export function createNarration(env: NodeJS.ProcessEnv, openai: OpenAI | null) {
  let elevenQuotaUntil = 0;
  return async (text: string, signal: AbortSignal) => {
    signal.throwIfAborted();
    if (env.ELEVENLABS_API_KEY && Date.now() >= elevenQuotaUntil) {
      try {
        const voice = env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
        const response = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/stream?output_format=mp3_44100_128`,
          {
            method: "POST",
            headers: {
              "xi-api-key": env.ELEVENLABS_API_KEY,
              "Content-Type": "application/json",
              Accept: "audio/mpeg",
            },
            body: JSON.stringify({
              text,
              model_id: env.ELEVENLABS_MODEL || "eleven_flash_v2_5",
              voice_settings: { stability: 0.6, similarity_boost: 0.75 },
            }),
            signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
          },
        );
        if (!response.ok) {
          const detail = await response.json().catch(() => null);
          if (detail?.detail?.status === "quota_exceeded")
            elevenQuotaUntil = Date.now() + 5 * 60_000;
          throw new Error("Narration unavailable");
        }
        if (!response.headers.get("content-type")?.startsWith("audio/"))
          throw new Error("Invalid narration audio");
        const audio = Buffer.from(await response.arrayBuffer());
        if (!audio.length) throw new Error("Empty narration");
        return { audio, provider: "elevenlabs" };
      } catch {
        signal.throwIfAborted();
        if (!openai) throw new Error("Narration unavailable");
      }
    }
    signal.throwIfAborted();
    if (!openai) throw new Error("Narration unavailable");
    const response = await openai.audio.speech.create(
      {
        model: env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
        voice: env.OPENAI_TTS_VOICE || "marin",
        input: text,
        instructions:
          "You are a warm, gentle and expressive fairy-tale storyteller reading to a child. Speak clearly at an unhurried pace, with wonder and playful curiosity. Briefly pause before the question and each numbered option. Read exactly the supplied text without adding words.",
        response_format: "mp3",
        speed: 0.95,
      },
      { signal, timeout: 40000, maxRetries: 0 },
    );
    const audio = Buffer.from(await response.arrayBuffer());
    signal.throwIfAborted();
    if (!audio.length) throw new Error("Empty narration");
    return { audio, provider: "openai" };
  };
}

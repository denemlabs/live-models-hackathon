import { z } from "zod";

// The storyteller voices a grown-up can pick between. The same voice reads the
// storybook pages and speaks on a story call, so a child hears one narrator.
// The ElevenLabs ids are default voices, which every plan can speak with;
// library voices are rejected on a free plan, so they cannot be offered here.
// Each also names an OpenAI voice, so the two narrators stay recognisably
// different when narration falls back to that provider.
export const STORY_VOICES = [
  {
    key: "arthur",
    id: "JBFqnCBsd6RMkjVDRZzb", // ElevenLabs "George"
    openai: "onyx",
    label: "Arthur",
    detail: "A warm, unhurried grandfather.",
  },
  {
    key: "victoria",
    id: "EXAVITQu4vr4xnSDxMaL", // ElevenLabs "Sarah"
    openai: "shimmer",
    label: "Victoria",
    detail: "A soft, kindly storyteller.",
  },
] as const;

type VoiceKey = (typeof STORY_VOICES)[number]["key"];

// Derived from the catalogue so a new voice cannot be offered in the picker
// without also being accepted by the server.
export const VoiceSchema = z.enum(
  STORY_VOICES.map((voice) => voice.key) as [VoiceKey, ...VoiceKey[]],
);
export type Voice = z.infer<typeof VoiceSchema>;
export const DEFAULT_VOICE: Voice = "arthur";

export function storyVoice(voice: Voice = DEFAULT_VOICE) {
  return STORY_VOICES.find((entry) => entry.key === voice) ?? STORY_VOICES[0];
}
export function voiceId(voice?: Voice) {
  return storyVoice(voice).id;
}

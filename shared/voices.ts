import { z } from "zod";

// The storyteller voices a grown-up can pick between. The same voice reads the
// storybook pages and speaks on a story call, so a child hears one narrator.
// Both are ElevenLabs default voices, which every plan can speak with. Library
// voices are rejected on a free plan, so they cannot be offered here.
export const STORY_VOICES = [
  {
    key: "arthur",
    id: "JBFqnCBsd6RMkjVDRZzb", // ElevenLabs "George"
    label: "Arthur",
    detail: "A warm, unhurried grandfather.",
  },
  {
    key: "victoria",
    id: "EXAVITQu4vr4xnSDxMaL", // ElevenLabs "Sarah"
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

export function voiceId(voice: Voice = DEFAULT_VOICE) {
  return (STORY_VOICES.find((entry) => entry.key === voice) ?? STORY_VOICES[0])
    .id;
}

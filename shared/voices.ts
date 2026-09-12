import { z } from "zod";

// The storyteller voices a grown-up can pick between. The same voice reads the
// storybook pages and speaks on a story call, so a child hears one narrator.
export const STORY_VOICES = [
  {
    key: "arthur",
    id: "C1npRmjB19a6yNkEucvx",
    label: "Arthur",
    detail: "A warm, unhurried grandfather.",
  },
  {
    key: "victoria",
    id: "qSeXEcewz7tA0Q0qk9fH",
    label: "Victoria",
    detail: "A bright, gentle storyteller.",
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

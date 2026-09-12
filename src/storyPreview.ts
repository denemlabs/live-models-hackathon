import type { StoryPage } from "../shared/story";
import { welcomeMedia } from "./welcomeMedia";

export const previewStages = [
  ["preparing", "Preparing story"],
  ["connecting", "Connecting video"],
  ["story", "Story & captions"],
  ["listening", "Child speaking"],
  ["transcribing", "Transcribing"],
  ["adapting", "Adapting the story"],
  ["gentler", "A gentler world"],
  ["ending", "Cozy ending"],
  ["error", "Connection error"],
] as const;
export type PreviewStage = (typeof previewStages)[number][0];

export const previewMedia = { ...welcomeMedia, intro: null };
export const previewConfig = {
  openai: false,
  reactor: false,
  elevenlabs: false,
  storyteller: false,
  accessCodeRequired: false,
};
export const previewStory: StoryPage = {
  responseKind: "story",
  title: "The Forest of Little Lights",
  narrative:
    "Mila followed a golden light into the quiet forest. Beside her, a little dragon folded his emerald wings. “I’m Lumo,” he whispered. “Shall we find where the fireflies are going?” Together, they took one small step into the wonder.",
  question: "Where should Mila and Lumo go next?",
  choices: ["Follow the fireflies", "Find a cozy clearing"],
  visualPrompt:
    "A gentle enchanted forest with golden fireflies, warm light, still camera.",
  theme: "forest",
};
export function previewPage(stage: PreviewStage): StoryPage {
  if (stage === "gentler")
    return {
      ...previewStory,
      responseKind: "calm",
      narrative:
        "“We can go slowly,” Lumo whispered. The shadows softened into warm, golden light. Mila sat beside him in a little clearing. A firefly settled on her hand, glowing like a tiny lantern. There was no hurry. Their adventure could wait.",
      question: "Shall we stay in this cozy place?",
      choices: ["Stay with Lumo", "Continue gently"],
    };
  if (stage === "ending")
    return {
      ...previewStory,
      responseKind: "ending",
      narrative:
        "The fireflies made a little path toward home. Mila tucked her hand beneath Lumo’s soft wing. “We can come back tomorrow,” she whispered. The forest grew quiet, and the stars kept watch. Tonight, there was only one more adventure: a lovely dream. The end.",
      question: "Every adventure needs a little rest.",
      choices: ["Remember our favorite moment", "Dream a new story"],
    };
  return previewStory;
}
export function previewResponse(words: string): PreviewStage {
  if (/end|home|sleep|goodnight/i.test(words)) return "ending";
  if (/scared|gentle|reassur|cozy|slow/i.test(words)) return "gentler";
  return "story";
}

export function abortablePreviewDelay(signal: AbortSignal, ms = 1600) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

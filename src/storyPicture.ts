import type { StoryPage } from "../shared/story";

type Pictures = {
  resetStory: () => void;
  steer: (scene: string, change?: string) => unknown;
};

// Color answers must redraw even if the model labels the reply "continue".
// This only selects a rendering mode; raw answers never become video prompts.
export function appearanceAnswer(text: string) {
  return /\b(pink|red|orange|yellow|green|blue|purple|violet|white|black|brown|silver|gold|golden|turquoise|rainbow|colorful|colourful)\b/i.test(
    text,
  );
}

// Reset only the model run, retaining the single connection. This happens before
// narration obtains its picture gate so it cannot start against the old image.
export function updateStoryPicture(
  pictures: Pictures,
  page: StoryPage,
  first: boolean,
  prepared: boolean,
  answer = "",
) {
  const redraw =
    !first && (page.visualUpdate === "redraw" || appearanceAnswer(answer));
  if (redraw) pictures.resetStory();
  if (redraw || !prepared)
    void pictures.steer(page.visualPrompt, page.visualChange);
}

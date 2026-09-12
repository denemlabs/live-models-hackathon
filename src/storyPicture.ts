import type { StoryPage } from "../shared/story";

type Pictures = {
  resetStory: () => void;
  steer: (scene: string, change?: string) => unknown;
};

// Reset only the model run, retaining the single connection. This happens before
// narration obtains its picture gate so it cannot start against the old image.
export function updateStoryPicture(
  pictures: Pictures,
  page: StoryPage,
  first: boolean,
  prepared: boolean,
) {
  const redraw = !first && page.visualUpdate === "redraw";
  if (redraw) pictures.resetStory();
  if (redraw || !prepared)
    void pictures.steer(page.visualPrompt, page.visualChange);
}

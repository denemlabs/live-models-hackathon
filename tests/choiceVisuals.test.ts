import { test } from "node:test";
import assert from "node:assert/strict";
import {
  choiceVisualFor,
  demoPage,
  finalizePage,
  GeneratedPageSchema,
  StoryRequestSchema,
} from "../shared/story";

const request = StoryRequestSchema.parse({
  input: "A frog and a turtle",
  profile: {},
});
const first = {
  ...demoPage(request),
  choices: ["Say hello to the turtle", "Sit by the pond"],
  choiceVisuals: [
    {
      scene: "A green frog greets a turtle beside a pond.",
      change:
        "The green frog hops toward the turtle and raises one front foot in greeting.",
    },
    {
      scene: "A green frog sits on a rock beside the pond.",
      change: "The green frog sits on the flat rock by the water.",
    },
  ],
};

test("each choice selects its prepared action; stale labels and legacy pages cannot dispatch the wrong one", () => {
  assert.equal(
    choiceVisualFor(first, 0, first.choices[0]),
    first.choiceVisuals[0],
  );
  assert.equal(
    choiceVisualFor(first, 1, first.choices[1]),
    first.choiceVisuals[1],
  );
  assert.equal(choiceVisualFor(first, 1, first.choices[0]), undefined);
  assert.equal(choiceVisualFor(first, undefined, first.choices[0]), undefined);
  assert.equal(
    choiceVisualFor(
      { ...first, choiceVisuals: undefined },
      0,
      first.choices[0],
    ),
    undefined,
  );
});

test("new model output requires complete prepared plans, or no plans for an open question", () => {
  const complete = {
    ...first,
    responseKind: "story",
    visualChange: "",
    acknowledgment: "Let's begin.",
  };
  assert.equal(GeneratedPageSchema.safeParse(complete).success, true);
  assert.equal(
    GeneratedPageSchema.safeParse({
      ...complete,
      choices: [],
      choiceVisuals: [],
    }).success,
    true,
  );
  assert.equal(
    GeneratedPageSchema.safeParse({ ...complete, choiceVisuals: undefined })
      .success,
    false,
  );
  assert.equal(
    GeneratedPageSchema.safeParse({
      ...complete,
      choiceVisuals: [first.choiceVisuals[0]],
    }).success,
    false,
  );
  assert.equal(
    GeneratedPageSchema.safeParse({
      ...complete,
      choiceVisuals: [{ scene: "", change: "" }, first.choiceVisuals[1]],
    }).success,
    false,
  );
});

test("the later story response preserves the visual action already dispatched, including the reconnect scene", () => {
  const selected = StoryRequestSchema.parse({
    ...request,
    history: [first],
    input: first.choices[0],
    interaction: "continue",
    choiceIndex: 0,
  });
  const result = finalizePage(
    {
      ...first,
      visualPrompt: "Unrelated space scene",
      visualChange: "A spaceship arrives",
      theme: "space",
    },
    selected,
  );
  assert.equal(result.visualChange, first.choiceVisuals[0].change);
  assert.equal(result.visualPrompt, first.choiceVisuals[0].scene);
  assert.equal(result.theme, first.theme);
  const question = finalizePage(result, {
    ...selected,
    interaction: "question",
  });
  assert.equal(question.visualChange, "");
  assert.equal(question.visualPrompt, first.visualPrompt);
});

test("prepared reconnect scenes explicitly include the action, even when the model only gives a setting", () => {
  const result = finalizePage(first, request);
  assert.ok(
    result.choiceVisuals![0].scene.includes(first.choiceVisuals[0].change),
  );
  assert.ok(
    result.choiceVisuals![1].scene.includes(first.choiceVisuals[1].change),
  );
});

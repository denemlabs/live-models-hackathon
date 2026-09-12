import { test } from "node:test";
import assert from "node:assert/strict";
import { spokenChoice, pageNarration } from "../shared/storyInteraction";
import { demoPage, ProfileSchema, StoryRequestSchema } from "../shared/story";
import { SpeechTurn } from "../src/speechTurn";

const choices = ["Follow the fireflies", "Find a cozy clearing"];
test("spoken choices select the same index as buttons, including ordinal and option wording", () => {
  for (const answer of [
    "one",
    "1",
    "The first one",
    "I choose option one please",
    "Follow the fireflies",
    "the fireflies please",
  ])
    assert.equal(spokenChoice(answer, choices), 0, answer);
  for (const answer of [
    "two",
    "2",
    "the second option",
    "I want the second one",
    "Find a cozy clearing",
    "the clearing please",
  ])
    assert.equal(spokenChoice(answer, choices), 1, answer);
});
test("ambiguous answers, questions and new ideas never silently select a choice", () => {
  for (const answer of [
    "both",
    "not the first one",
    "fireflies and a clearing",
    "Why do fireflies glow?",
    "a purple dragon",
    "neither please",
  ])
    assert.equal(spokenChoice(answer, choices), undefined, answer);
  assert.equal(spokenChoice("one", []), undefined);
});
test("custom flying-frog answers keep every word instead of becoming a preset choice", () => {
  const options = ["The frog hops onto a lily pad", "The turtle swims home"];
  for (const answer of [
    "Make the frog fly",
    "I want the frog flying",
    "The frog hops onto a lily pad and then flies into the sky",
    "the turtle can fly",
    "one but make the frog fly",
  ])
    assert.equal(spokenChoice(answer, options), undefined, answer);
  assert.equal(spokenChoice("the frog please", options), 0);
  assert.equal(spokenChoice("two", options), 1);
});
test("narration reads the whole visible story, question and both numbered options", () => {
  const page = demoPage(
    StoryRequestSchema.parse({
      input: "A fox",
      profile: ProfileSchema.parse({}),
    }),
  );
  const text = pageNarration(page);
  assert.ok(text.startsWith(page.narrative));
  assert.ok(text.includes(page.question));
  assert.ok(text.includes(`Option one: ${page.choices[0]}.`));
  assert.ok(text.includes(`Option two: ${page.choices[1]}.`));
  assert.ok(!pageNarration({ ...page, choices: [] }).includes("Option one"));
  assert.equal(
    pageNarration({ ...page, responseKind: "answer" }),
    page.narrative,
  );
});
test("speech turn waits for a spoken answer and a pause, ignoring a single click", () => {
  const turn = new SpeechTurn(0);
  assert.equal(turn.sample(0, 9000), null);
  assert.equal(turn.sample(0, 10000), "empty");
  const spoken = new SpeechTurn(0);
  for (const t of [100, 200, 300]) assert.equal(spoken.sample(0.05, t), null);
  assert.equal(spoken.sample(0, 1600), null);
  assert.equal(spoken.sample(0, 1800), "send");
  const click = new SpeechTurn(0);
  click.sample(0.1, 100);
  assert.equal(click.sample(0, 2000), null);
  assert.equal(click.sample(0, 10000), "empty");
});

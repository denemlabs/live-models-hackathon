import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import StoryOptions from "../src/StoryOptions";
import StoryNotice from "../src/StoryNotice";
import StoryCaption from "../src/StoryCaption";

test("extra story actions are absent until the reader opens What next", () => {
  const html = renderToStaticMarkup(
    createElement(StoryOptions, {
      open: false,
      disabled: false,
      onOpenChange: () => {},
      children: "A secret cave",
    }),
  );
  assert.match(html, /What next\?/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /A secret cave|role="region"/);
});

test("expanded choices remain a labeled region, not an ARIA menu", () => {
  const html = renderToStaticMarkup(
    createElement(StoryOptions, {
      open: true,
      disabled: false,
      onOpenChange: () => {},
      children: createElement("button", null, "A secret cave"),
    }),
  );
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /role="region" aria-label="Story options"/);
  assert.match(html, /A secret cave/);
  assert.doesNotMatch(html, /role="menu"/);
});

test("compact video errors preserve the full details and retry, without labeling saved footage Live", () => {
  const html = renderToStaticMarkup(
    createElement(StoryNotice, {
      message: "Transport DISCONNECTED during scene update.",
      video: true,
      paused: false,
      onRetry: () => {},
    }),
  );
  assert.match(html, /role="alert"/);
  assert.match(html, /Live video unavailable/);
  assert.match(html, /Transport DISCONNECTED during scene update/);
  assert.match(html, /aria-label="Retry live video"/);
  assert.match(html, /<details>/);
  assert.doesNotMatch(html, /<details open/);
});

test("paused video recovery stays disabled and general errors remain dismissible", () => {
  assert.match(
    renderToStaticMarkup(
      createElement(StoryNotice, {
        message: "Offline",
        video: true,
        paused: true,
        onRetry: () => {},
      }),
    ),
    /button disabled="" aria-label="Retry live video"/,
  );
  const html = renderToStaticMarkup(
    createElement(StoryNotice, {
      message: "Microphone permission was denied.",
      video: false,
      paused: false,
      onDismiss: () => {},
    }),
  );
  assert.match(html, /Microphone permission was denied/);
  assert.match(html, /aria-label="Dismiss message"/);
  assert.doesNotMatch(html, /Retry live video/);
});

test("live captions retain the complete narrated text and accessible full-text button", () => {
  const html = renderToStaticMarkup(
    createElement(StoryCaption, {
      text: "Mila stepped into the forest.",
      paused: false,
      preview: false,
      hidden: false,
      onFullText: () => {},
    }),
  );
  assert.match(html, /Mila stepped into the forest/);
  assert.match(html, /aria-label="Read story"/);
  assert.doesNotMatch(html, /aria-label="Next subtitle"/);
  assert.doesNotMatch(html, /aria-label="Previous subtitle"/);
  assert.doesNotMatch(html, /caption-autoplay/);
});

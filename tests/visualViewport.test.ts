import { test } from "node:test";
import assert from "node:assert/strict";
import { followVisualViewport } from "../src/visualViewport";

function fixture(withViewport = true) {
  const values = new Map<string, string>();
  const element = {
    style: {
      setProperty: (key: string, value: string) => values.set(key, value),
    },
  } as unknown as HTMLElement;
  const viewport = Object.assign(new EventTarget(), {
    height: 740,
    width: 393,
    offsetTop: 0,
    offsetLeft: 0,
  });
  const win = Object.assign(new EventTarget(), {
    innerHeight: 740,
    innerWidth: 393,
    visualViewport: withViewport ? viewport : null,
  });
  const cleanup = followVisualViewport(element, win as unknown as Window);
  return { values, viewport, win, cleanup };
}

test("initial controls use the visible viewport without resizing the media", () => {
  const { values, cleanup } = fixture();
  assert.equal(values.get("--viewport-height"), "740px");
  assert.equal(values.get("--viewport-width"), "393px");
  assert.equal(values.get("--viewport-top"), "0px");
  assert.equal(values.has("--usable-height"), false);
  cleanup();
});

test("keyboard resize and independent Safari pan both update floating controls", () => {
  const { values, viewport, cleanup } = fixture();
  viewport.height = 320;
  viewport.dispatchEvent(new Event("resize"));
  assert.equal(values.get("--viewport-height"), "320px");
  viewport.offsetTop = 280;
  viewport.dispatchEvent(new Event("scroll"));
  assert.equal(values.get("--viewport-top"), "280px");
  assert.equal(values.get("--viewport-bottom"), "600px");
  cleanup();
});

test("keyboard dismissal restores controls even when offset resets after resize", () => {
  const { values, viewport, cleanup } = fixture();
  viewport.height = 320;
  viewport.offsetTop = 280;
  viewport.dispatchEvent(new Event("resize"));
  viewport.height = 740;
  viewport.dispatchEvent(new Event("resize"));
  viewport.offsetTop = 0;
  viewport.dispatchEvent(new Event("scroll"));
  assert.equal(values.get("--viewport-height"), "740px");
  assert.equal(values.get("--viewport-top"), "0px");
  assert.equal(values.get("--viewport-bottom"), "740px");
  cleanup();
});

test("rotation, horizontal pan and back/forward restoration refresh geometry", () => {
  const { values, viewport, win, cleanup } = fixture();
  viewport.height = 393;
  viewport.width = 740;
  win.dispatchEvent(new Event("resize"));
  assert.equal(values.get("--viewport-width"), "740px");
  viewport.offsetLeft = 20;
  viewport.dispatchEvent(new Event("scroll"));
  assert.equal(values.get("--viewport-left"), "20px");
  viewport.offsetLeft = 0;
  win.dispatchEvent(new Event("pageshow"));
  assert.equal(values.get("--viewport-left"), "0px");
  cleanup();
});

test("desktop fallback updates on window resize without VisualViewport", () => {
  const { values, win, cleanup } = fixture(false);
  win.innerWidth = 1280;
  win.innerHeight = 720;
  win.dispatchEvent(new Event("resize"));
  assert.equal(values.get("--viewport-width"), "1280px");
  assert.equal(values.get("--viewport-height"), "720px");
  cleanup();
});

test("cleanup removes listeners, including StrictMode remount cleanup", () => {
  const { values, viewport, win, cleanup } = fixture();
  cleanup();
  viewport.height = 320;
  for (const target of [viewport, win]) {
    for (const event of ["resize", "scroll", "pageshow"])
      target.dispatchEvent(new Event(event));
  }
  assert.equal(values.get("--viewport-height"), "740px");
});

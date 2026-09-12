// Dev-only integration fixture: changes visual geometry without changing the
// layout viewport, unlike a desktop browser-window resize. Never imported by app.
const nativeViewport = window.visualViewport;
const viewport = Object.assign(new EventTarget(), {
  width: nativeViewport?.width ?? window.innerWidth,
  height: nativeViewport?.height ?? window.innerHeight,
  offsetTop: 0,
  offsetLeft: 0,
  scale: 1,
});
Object.defineProperty(window, "visualViewport", {
  configurable: true,
  value: viewport,
});
document.getElementById("keyboard-pan")!.onclick = () => {
  viewport.height = 340;
  viewport.dispatchEvent(new Event("resize"));
  viewport.offsetTop = 280;
  viewport.dispatchEvent(new Event("scroll"));
};
document.getElementById("keyboard-short")!.onclick = () => {
  viewport.height = 230;
  viewport.offsetTop = 280;
  viewport.dispatchEvent(new Event("resize"));
  viewport.dispatchEvent(new Event("scroll"));
};
document.getElementById("keyboard-close")!.onclick = () => {
  viewport.height = nativeViewport?.height ?? window.innerHeight;
  viewport.dispatchEvent(new Event("resize"));
  viewport.offsetTop = 0;
  viewport.dispatchEvent(new Event("scroll"));
};
void import("../src/main");
export {};

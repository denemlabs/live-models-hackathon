type ViewportWindow = Pick<
  Window,
  | "visualViewport"
  | "innerWidth"
  | "innerHeight"
  | "addEventListener"
  | "removeEventListener"
>;

// iOS can pan the visual viewport independently of resizing it when a field
// gains focus. Only the floating UI follows that viewport; video never shrinks.
export function followVisualViewport(
  element: HTMLElement,
  win: ViewportWindow = window,
) {
  const viewport = win.visualViewport;
  const update = () => {
    const height = viewport?.height ?? win.innerHeight;
    const width = viewport?.width ?? win.innerWidth;
    const top = Math.max(0, viewport?.offsetTop ?? 0);
    const left = Math.max(0, viewport?.offsetLeft ?? 0);
    element.style.setProperty("--viewport-height", `${height}px`);
    element.style.setProperty("--viewport-width", `${width}px`);
    element.style.setProperty("--viewport-top", `${top}px`);
    element.style.setProperty("--viewport-left", `${left}px`);
    element.style.setProperty("--viewport-bottom", `${top + height}px`);
  };
  update();
  viewport?.addEventListener("resize", update);
  viewport?.addEventListener("scroll", update);
  win.addEventListener("resize", update);
  win.addEventListener("pageshow", update);
  return () => {
    viewport?.removeEventListener("resize", update);
    viewport?.removeEventListener("scroll", update);
    win.removeEventListener("resize", update);
    win.removeEventListener("pageshow", update);
  };
}

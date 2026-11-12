export function blocksCanvasShortcuts(target: EventTarget | null) {
  return (
    !!document.querySelector('[role="dialog"][data-slot="dialog-content"]') ||
    (target instanceof Element && !!target.closest('[role="dialog"]')) ||
    (target instanceof HTMLElement &&
      (/INPUT|TEXTAREA|SELECT/.test(target.tagName) ||
        target.isContentEditable))
  );
}

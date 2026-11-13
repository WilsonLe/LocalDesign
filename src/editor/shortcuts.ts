export function blocksCanvasShortcuts(target: EventTarget | null) {
  return (
    !!document.querySelector(
      '[data-slot="dialog-content"], [data-slot="alert-dialog-content"]',
    ) ||
    (target instanceof Element &&
      !!target.closest('[role="dialog"], [role="alertdialog"]')) ||
    (target instanceof HTMLElement &&
      (/INPUT|TEXTAREA|SELECT/.test(target.tagName) ||
        target.isContentEditable))
  );
}

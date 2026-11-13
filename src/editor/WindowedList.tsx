import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

// Fixed-height layer rows keep DOM/control work proportional to the visible list.
// Keep the focused row mounted; bridge Tab at window edges and offer list navigation.
export function WindowedList({
  ids,
  renderRow,
}: {
  ids: string[];
  renderRow: (index: number) => ReactNode;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 0 });
  const [focused, setFocused] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    index: number;
    target: "first" | "last" | "select";
  } | null>(null);
  const rowHeight = 34;
  const virtual = ids.length > 200;
  useLayoutEffect(() => {
    const element = list.current!;
    // A synchronous clientHeight read here lays out the newly mounted SVG too.
    // The observer supplies the initial/updated list size without forcing that work.
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setView({ top: element.scrollTop, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const lastStart = Math.max(
    0,
    ids.length - Math.ceil(view.height / rowHeight),
  );
  const start = virtual
    ? Math.min(lastStart, Math.max(0, Math.floor(view.top / rowHeight) - 5))
    : 0;
  const end = virtual
    ? Math.min(ids.length, start + Math.ceil(view.height / rowHeight) + 10)
    : ids.length;
  const indices = Array.from({ length: end - start }, (_, i) => start + i);
  const focusedIndex = focused ? ids.indexOf(focused) : -1;
  if (virtual && focusedIndex >= 0 && !indices.includes(focusedIndex))
    indices.push(focusedIndex);
  if (pending && pending.index < ids.length && !indices.includes(pending.index))
    indices.push(pending.index);
  indices.sort((a, b) => a - b);
  useLayoutEffect(() => {
    if (!pending) return;
    const element = list.current!;
    const row = element.querySelector<HTMLElement>(
      `[data-virtual-index="${pending.index}"]`,
    );
    const controls = row?.querySelectorAll<HTMLButtonElement>(
      "button:not(:disabled)",
    );
    const target =
      pending.target === "select"
        ? row?.querySelector<HTMLButtonElement>(".layer-select")
        : pending.target === "last"
          ? controls?.[controls.length - 1]
          : controls?.[0];
    target?.focus();
    setPending(null);
  }, [pending]);
  const focusRow = (index: number, target: "first" | "last" | "select") => {
    const element = list.current!;
    const top = index * rowHeight;
    if (
      virtual &&
      (top < element.scrollTop ||
        top + rowHeight > element.scrollTop + element.clientHeight)
    ) {
      element.scrollTop = top;
      setView({ top: element.scrollTop, height: element.clientHeight });
    }
    setPending({ index, target });
  };
  return (
    <div
      ref={list}
      className="layer-list"
      onScroll={(e) =>
        setView({
          top: e.currentTarget.scrollTop,
          height: e.currentTarget.clientHeight,
        })
      }
      onFocusCapture={(e) => {
        const row = (e.target as HTMLElement).closest<HTMLElement>(
          "[data-virtual-index]",
        );
        if (row) setFocused(ids[Number(row.dataset.virtualIndex)] ?? null);
      }}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(null);
      }}
      onKeyDownCapture={(e) => {
        const button = e.target as HTMLElement;
        const row = button.closest<HTMLElement>("[data-virtual-index]");
        if (!row) return;
        const index = Number(row.dataset.virtualIndex);
        if (
          button.classList.contains("layer-select") &&
          ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)
        ) {
          e.preventDefault();
          e.stopPropagation();
          focusRow(
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? ids.length - 1
                : Math.max(
                    0,
                    Math.min(
                      ids.length - 1,
                      index + (e.key === "ArrowDown" ? 1 : -1),
                    ),
                  ),
            "select",
          );
        } else if (virtual && e.key === "Tab") {
          const buttons = [...row.querySelectorAll("button:not(:disabled)")];
          const next = index + (e.shiftKey ? -1 : 1);
          if (
            button === (e.shiftKey ? buttons[0] : buttons.at(-1)) &&
            next >= 0 &&
            next < ids.length &&
            !list.current!.querySelector(`[data-virtual-index="${next}"]`)
          ) {
            e.preventDefault();
            focusRow(next, e.shiftKey ? "last" : "first");
          }
        }
      }}
    >
      <div
        style={
          virtual
            ? { height: ids.length * rowHeight, position: "relative" }
            : undefined
        }
      >
        {indices.map((index) => (
          <div
            key={ids[index]}
            data-virtual-index={index}
            style={
              virtual
                ? {
                    position: "absolute",
                    top: index * rowHeight,
                    left: 0,
                    right: 0,
                    height: rowHeight,
                  }
                : undefined
            }
          >
            {renderRow(index)}
          </div>
        ))}
      </div>
    </div>
  );
}

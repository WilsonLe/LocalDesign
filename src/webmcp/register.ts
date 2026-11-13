import type { SiteTool } from "./tools";
import type { PageToolRuntime } from "./runtime";
export type ModelContext = {
  registerTool: (
    tool: SiteTool,
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
export function connectWebMCP(
  runtime: PageToolRuntime,
  onStatus: (state: "connected" | "unavailable" | "error") => void,
) {
  const context = (document as Document & { modelContext?: ModelContext })
    .modelContext;
  if (!context?.registerTool) {
    onStatus("unavailable");
    return () => {};
  }
  let sequence = Promise.resolve(),
    closed = false;
  let registration = new AbortController();
  const refresh = () => {
    registration.abort();
    registration = new AbortController();
    const transport = registration;
    const controller = runtime.controller,
      tools = runtime.tools;
    sequence = sequence.then(async () => {
      if (closed || controller.signal.aborted) return;
      try {
        for (const tool of tools) {
          if (controller.signal.aborted) return;
          const signal = AbortSignal.any([controller.signal, transport.signal]);
          await context.registerTool(
            {
              ...tool,
              execute: (input, options) =>
                tool.execute(input, {
                  signal: options?.signal
                    ? AbortSignal.any([signal, options.signal])
                    : signal,
                }),
            },
            { signal },
          );
        }
        if (!closed && !controller.signal.aborted) onStatus("connected");
      } catch {
        transport.abort();
        if (!closed) onStatus("error");
      }
    });
  };
  const unsubscribe = runtime.subscribe(refresh);
  refresh();
  return () => {
    closed = true;
    registration.abort();
    unsubscribe();
  };
}

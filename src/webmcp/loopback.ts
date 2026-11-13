import { z } from "zod";
import { DesignError, requireThat } from "../core/model";
import { MAX_FILE_BASE64_CHARS } from "../core/limits";
import type { PageToolRuntime } from "./runtime";
const MAX_MESSAGE = MAX_FILE_BASE64_CHARS + 4_000_000;
const Call = z
  .object({
    type: z.literal("call"),
    id: z.string().max(100),
    epoch: z.string().max(100),
    name: z.string().max(100),
    input: z.unknown(),
  })
  .strict();
export type LoopbackState = {
  status: "disconnected" | "connecting" | "connected" | "error";
  message: string;
};
export class LoopbackConnection {
  private state: LoopbackState = { status: "disconnected", message: "" };
  private listeners = new Set<() => void>();
  private socket: WebSocket | null = null;
  private authenticated = false;
  private calls = new Map<
    string,
    { controller: AbortController; transition: boolean }
  >();
  private unsubscribe: () => void;
  constructor(private runtime: PageToolRuntime) {
    this.unsubscribe = runtime.subscribe(() => {
      for (const call of this.calls.values())
        if (!call.transition) call.controller.abort();
      this.sendCatalog();
    });
    window.addEventListener("pagehide", this.hide);
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.state;
  private set(state: LoopbackState) {
    this.state = state;
    for (const fn of this.listeners) fn();
  }
  private send(value: unknown) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    const text = JSON.stringify(value);
    requireThat(
      new TextEncoder().encode(text).length <= MAX_MESSAGE,
      "BRIDGE_LIMIT",
      "Bridge payload exceeds the portable transport limit. Use local file controls or bounded artifact reads.",
    );
    this.socket.send(text);
  }
  private sendCatalog() {
    if (this.authenticated)
      try {
        this.send({
          type: "catalog",
          ...this.runtime.catalog(),
          retainedCalls: [...this.calls]
            .filter(([, call]) => call.transition)
            .map(([id]) => id),
        });
      } catch (e) {
        this.disconnect();
        this.set({
          status: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      }
  }
  private cancelAll() {
    for (const call of this.calls.values()) call.controller.abort();
    this.calls.clear();
  }
  connect(endpoint: string, code: string) {
    const url = new URL(endpoint);
    requireThat(
      url.protocol === "ws:" &&
        url.hostname === "127.0.0.1" &&
        url.pathname === "/bridge" &&
        !url.search &&
        !url.hash &&
        !url.username &&
        !url.password,
      "BRIDGE_ADDRESS",
      "Use the companion's ws://127.0.0.1:<port>/bridge endpoint.",
    );
    requireThat(
      /^[A-Za-z0-9_-]{43}$/.test(code),
      "BRIDGE_CODE",
      "Enter the 43-character code from the local companion process.",
    );
    this.disconnect();
    this.set({
      status: "connecting",
      message: "Waiting for the local companion…",
    });
    const socket = new WebSocket(url);
    this.socket = socket;
    const timeout = setTimeout(() => {
      if (this.socket === socket && this.state.status !== "connected") {
        socket.close();
        this.set({
          status: "error",
          message:
            "Connection timed out. Check the companion endpoint, session code and browser local-network permission.",
        });
      }
    }, 10000);
    socket.onopen = () => {
      if (this.socket === socket)
        socket.send(JSON.stringify({ type: "auth", code }));
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      try {
        requireThat(
          typeof event.data === "string" && event.data.length <= MAX_MESSAGE,
          "BRIDGE_MESSAGE",
          "Invalid bridge message.",
        );
        const message = JSON.parse(event.data);
        if (message.type === "authenticated") {
          clearTimeout(timeout);
          this.authenticated = true;
          this.set({ status: "connected", message: "Local MCP connected" });
          this.sendCatalog();
          return;
        }
        requireThat(
          this.authenticated,
          "BRIDGE_AUTH",
          "The companion did not authenticate this connection.",
        );
        if (message.type === "cancel") {
          this.calls.get(String(message.id))?.controller.abort();
          return;
        }
        const input = Call.parse(message);
        void this.invoke(input, socket);
      } catch (e) {
        this.set({
          status: "error",
          message: e instanceof Error ? e.message : String(e),
        });
        socket.close(1008);
      }
    };
    socket.onerror = () => {
      if (this.socket === socket)
        this.set({
          status: "error",
          message:
            "Browser could not reach the local companion. Check its endpoint and local-network permission.",
        });
    };
    socket.onclose = () => {
      clearTimeout(timeout);
      if (this.socket !== socket) return;
      this.socket = null;
      this.authenticated = false;
      this.cancelAll();
      if (this.state.status !== "error")
        this.set({
          status: "disconnected",
          message: "Local companion disconnected",
        });
    };
  }
  private async invoke(input: z.output<typeof Call>, socket: WebSocket) {
    const controller = new AbortController();
    let value: unknown;
    try {
      requireThat(
        this.calls.size < 16 && !this.calls.has(input.id),
        "BRIDGE_LIMIT",
        "Too many concurrent or duplicate bridge operations.",
      );
      this.calls.set(input.id, {
        controller,
        transition: [
          "localdesign_workspace",
          "localdesign_import_files",
        ].includes(input.name),
      });
      value = await this.runtime.invoke(
        input.name,
        input.input,
        input.epoch,
        controller.signal,
      );
    } catch (error) {
      value = {
        isError: true,
        code: error instanceof DesignError ? error.code : "BRIDGE_OPERATION",
        message: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.calls.delete(input.id);
    }
    if (this.socket === socket && socket.readyState === WebSocket.OPEN)
      try {
        this.send({ type: "result", id: input.id, epoch: input.epoch, value });
      } catch {
        this.send({
          type: "result",
          id: input.id,
          epoch: input.epoch,
          value: {
            isError: true,
            code: "BRIDGE_LIMIT",
            message:
              "Result exceeds the transport limit. Use bounded artifact reads.",
          },
        });
      }
  }
  disconnect() {
    this.authenticated = false;
    this.cancelAll();
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.set({ status: "disconnected", message: "" });
  }
  private hide = () => this.disconnect();
  dispose() {
    this.disconnect();
    this.unsubscribe();
    window.removeEventListener("pagehide", this.hide);
    this.listeners.clear();
  }
}

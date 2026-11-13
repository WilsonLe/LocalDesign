import { useState, useSyncExternalStore } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import type { LoopbackConnection } from "../webmcp/loopback";
export function LocalMCPConnection({
  connection,
}: {
  connection: LoopbackConnection;
}) {
  const state = useSyncExternalStore(
      connection.subscribe,
      connection.getSnapshot,
    ),
    [endpoint, setEndpoint] = useState("ws://127.0.0.1:4210/bridge"),
    [code, setCode] = useState(""),
    [error, setError] = useState("");
  return (
    <details className="local-mcp-connection">
      <summary>Optional local MCP companion</summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            connection.connect(endpoint, code);
            setCode("");
            setError("");
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }}
      >
        <label>
          Loopback endpoint
          <Input
            aria-label="Loopback endpoint"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label>
          Session code
          <Input
            aria-label="Local MCP session code"
            type="password"
            value={code}
            maxLength={43}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
          />
        </label>
        <div className="button-row">
          <Button
            type="submit"
            disabled={
              state.status === "connected" || state.status === "connecting"
            }
          >
            Connect local MCP
          </Button>
          <Button
            type="button"
            disabled={state.status === "disconnected"}
            onClick={() => connection.disconnect()}
          >
            Disconnect local MCP
          </Button>
        </div>
      </form>
      {(error || state.message) && (
        <p role="status">{error || state.message}</p>
      )}
      <a
        href="https://github.com/WilsonLe/LocalDesign/blob/main/docs/local-mcp.md"
        target="_blank"
        rel="noreferrer"
      >
        Companion setup and supported clients ↗
      </a>
    </details>
  );
}

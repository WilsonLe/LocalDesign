import { useEffect, useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { NativeSelect } from "../components/ui/native-select";
import type { DesignEngine } from "../core/engine";
import { uid, type DesignDocument } from "../core/model";
import { humanApprovalIntent } from "../core/humanApproval";
import { type HandoffStatus } from "../core/approvals";
import {
  persistApprovalGrant,
  readHandoffStatuses,
} from "../storage/approvals";
import { checkpointEvidenceDocument } from "../core/checkpoints";
import { pngExport } from "../files/export";
const labels: Record<HandoffStatus, string> = {
  pending: "Awaiting human review",
  approved: "Approved",
  changed: "Changed since approval",
  unverified: "Historical/imported approval · review again",
  missing_frame: "Frame is missing",
};
export function HandoffResources({
  engine,
  document: doc,
  onError,
}: {
  engine: DesignEngine;
  document: DesignDocument;
  onError: (s: string) => void;
}) {
  const [frameId, setFrameId] = useState(engine.selection[0] ?? ""),
    [author, setAuthor] = useState("You"),
    [note, setNote] = useState(""),
    [reviewer, setReviewer] = useState("You"),
    [reviewNote, setReviewNote] = useState(""),
    [statuses, setStatuses] = useState<Record<string, HandoffStatus>>({}),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<{ url: string; name: string } | null>(
      null,
    );
  useEffect(() => {
    let active = true;
    void readHandoffStatuses(doc)
      .then((result) => {
        if (active) setStatuses(result);
      })
      .catch((e) => {
        if (active) onError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      active = false;
    };
  }, [doc, onError]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );
  const fail = (e: unknown) =>
    onError(e instanceof Error ? e.message : String(e));
  return (
    <div className="resource-sections">
      <section>
        <h3>Request handoff review</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              engine.dispatch([
                {
                  op: "handoff_request",
                  handoff: { id: uid(), frameId, requestedBy: author, note },
                },
              ]);
              setNote("");
            } catch (e) {
              fail(e);
            }
          }}
        >
          <label>
            Frame
            <NativeSelect
              aria-label="Handoff frame"
              value={frameId}
              onChange={(e) => setFrameId(e.target.value)}
            >
              <option value="">Choose frame</option>
              {doc.nodes
                .filter((node) => node.type === "frame" && !node.componentPart)
                .map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name}
                  </option>
                ))}
            </NativeSelect>
          </label>
          <label>
            Requested by
            <Input
              required
              value={author}
              maxLength={100}
              onChange={(e) => setAuthor(e.target.value)}
            />
          </label>
          <label>
            Handoff note
            <Textarea
              value={note}
              maxLength={4000}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={!frameId}>
            Request handoff review
          </Button>
        </form>
      </section>
      <section>
        <h3>Human sign-off</h3>
        <label>
          Reviewer
          <Input
            required
            value={reviewer}
            maxLength={100}
            onChange={(e) => setReviewer(e.target.value)}
          />
        </label>
        <label>
          Review note
          <Textarea
            value={reviewNote}
            maxLength={4000}
            onChange={(e) => setReviewNote(e.target.value)}
          />
        </label>
        <ul className="review-threads">
          {doc.handoffs.map((handoff) => (
            <li key={handoff.id}>
              <strong>{handoff.frameName}</strong>
              <p className="review-body">{handoff.note}</p>
              <span data-handoff-status={statuses[handoff.id] ?? "loading"}>
                {statuses[handoff.id]
                  ? labels[statuses[handoff.id]]
                  : "Checking approval…"}
              </span>
              {handoff.approval && (
                <span>
                  {handoff.approval.reviewer} ·{" "}
                  {new Date(handoff.approval.approvedAt).toLocaleString()} ·{" "}
                  {handoff.approval.note}
                </span>
              )}
              <div className="button-row">
                <Button
                  disabled={
                    busy ||
                    statuses[handoff.id] === "approved" ||
                    statuses[handoff.id] === "missing_frame"
                  }
                  onClick={(event) => {
                    try {
                      const intent = humanApprovalIntent(event.nativeEvent);
                      setBusy(true);
                      void engine
                        .approveHuman(
                          engine.guard(),
                          handoff.id,
                          reviewer,
                          reviewNote,
                          intent,
                          persistApprovalGrant,
                        )
                        .catch(fail)
                        .finally(() => setBusy(false));
                    } catch (e) {
                      fail(e);
                    }
                  }}
                >
                  Approve current frame
                </Button>
                <Button
                  disabled={!handoff.approval || busy}
                  onClick={() => {
                    try {
                      engine.dispatch([
                        { op: "handoff_revoke", id: handoff.id },
                      ]);
                    } catch (e) {
                      fail(e);
                    }
                  }}
                >
                  Revoke approval
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    try {
                      engine.dispatch([
                        { op: "handoff_delete", id: handoff.id },
                      ]);
                    } catch (e) {
                      fail(e);
                    }
                  }}
                >
                  Remove handoff
                </Button>
              </div>
              {handoff.approval && (
                <Button
                  onClick={() =>
                    void (async () => {
                      try {
                        const checkpoint = doc.checkpoints.find(
                          (item) => item.id === handoff.approval!.checkpointId,
                        )!;
                        const retained = checkpointEvidenceDocument(
                          doc,
                          checkpoint,
                        );
                        const blob = await pngExport(
                          retained,
                          retained.nodes.find(
                            (node) => node.id === checkpoint.targetId,
                          )!.pageId,
                          [checkpoint.targetId],
                          { background: "#ffffff", composition: true },
                        );
                        setPreview({
                          url: URL.createObjectURL(blob),
                          name: handoff.frameName,
                        });
                      } catch (e) {
                        fail(e);
                      }
                    })()
                  }
                >
                  Preview approved evidence
                </Button>
              )}
            </li>
          ))}
        </ul>
        {preview && (
          <img
            className="component-preview"
            src={preview.url}
            alt={`${preview.name} approved evidence`}
          />
        )}
      </section>
    </div>
  );
}

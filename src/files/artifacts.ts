import { requireThat, uid } from "../core/model";
import { base64 } from "../render/fonts";
export class Artifacts {
  private items = new Map<
    string,
    { blob: Blob; url: string; name: string; created: number; revision: number }
  >();
  add(blob: Blob, name: string, revision: number) {
    this.prune();
    requireThat(
      this.items.size < 12,
      "ARTIFACT_LIMIT",
      "Release old artifacts before creating more.",
    );
    const id = uid(),
      url = URL.createObjectURL(blob);
    this.items.set(id, { blob, url, name, created: Date.now(), revision });
    return this.meta(id);
  }
  private prune() {
    for (const [id, a] of this.items)
      if (Date.now() - a.created > 15 * 60 * 1000) this.release(id);
  }
  meta(id: string) {
    this.prune();
    const a = this.items.get(id);
    requireThat(
      a,
      "MISSING_ARTIFACT",
      "Artifact expired or belongs to a previous document. Export again.",
    );
    return {
      id,
      name: a.name,
      mime: a.blob.type,
      size: a.blob.size,
      url: a.url,
      revision: a.revision,
      expiresAt: new Date(a.created + 15 * 60 * 1000).toISOString(),
    };
  }
  async read(id: string, offset = 0, length = 262144) {
    this.meta(id);
    const a = this.items.get(id)!;
    requireThat(
      offset >= 0 && offset <= a.blob.size && length >= 1 && length <= 524288,
      "INVALID_RANGE",
      "Read at most 524,288 bytes at a time.",
    );
    return {
      ...this.meta(id),
      offset,
      base64: base64(
        new Uint8Array(
          await a.blob.slice(offset, offset + length).arrayBuffer(),
        ),
      ),
      nextOffset: Math.min(a.blob.size, offset + length),
    };
  }
  download(id: string) {
    const a = this.meta(id),
      link = document.createElement("a");
    link.href = a.url;
    link.download = a.name;
    link.click();
    return a;
  }
  release(id: string) {
    const a = this.items.get(id);
    if (a) URL.revokeObjectURL(a.url);
    this.items.delete(id);
    return { released: id };
  }
  clear() {
    for (const id of this.items.keys()) this.release(id);
  }
}

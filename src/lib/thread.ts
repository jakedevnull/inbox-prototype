import type { Address, MessageSummary, ThreadSummary } from "./types";
import { normalizeSubject } from "./utils";

class UnionFind {
  parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let p = this.parent.get(x)!;
    if (p !== x) {
      p = this.find(p);
      this.parent.set(x, p);
    }
    return p;
  }
  union(a: string, b: string) {
    const pa = this.find(a);
    const pb = this.find(b);
    if (pa !== pb) this.parent.set(pa, pb);
  }
}

function mergeParticipants(messages: MessageSummary[]): Address[] {
  const seen = new Set<string>();
  const out: Address[] = [];
  for (const m of messages) {
    for (const a of [m.from, ...m.to, ...m.cc]) {
      const key = a.address || a.name;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(a);
    }
  }
  return out;
}

export function threadMessages(messages: MessageSummary[]): ThreadSummary[] {
  const byMessageId = new Map<string, MessageSummary>();
  for (const m of messages) {
    if (m.messageId) byMessageId.set(m.messageId, m);
  }

  const uf = new UnionFind();
  for (const m of messages) uf.find(m.id);

  for (const m of messages) {
    const targets = [m.inReplyTo, ...m.references].filter(Boolean) as string[];
    for (const t of targets) {
      const other = byMessageId.get(t);
      if (other) uf.union(m.id, other.id);
    }
  }

  const groups = new Map<string, MessageSummary[]>();
  for (const m of messages) {
    const root = uf.find(m.id);
    const list = groups.get(root) ?? [];
    list.push(m);
    groups.set(root, list);
  }

  const singles: MessageSummary[] = [];
  const threaded: MessageSummary[][] = [];
  for (const list of groups.values()) {
    if (list.length === 1) singles.push(list[0]!);
    else threaded.push(list);
  }

  const byNorm = new Map<string, MessageSummary[]>();
  for (const m of singles) {
    const key = normalizeSubject(m.subject).toLowerCase();
    const list = byNorm.get(key) ?? [];
    list.push(m);
    byNorm.set(key, list);
  }
  const leftover: MessageSummary[] = [];
  for (const list of byNorm.values()) {
    if (list.length > 1) threaded.push(list);
    else leftover.push(list[0]!);
  }
  for (const m of leftover) threaded.push([m]);

  const threads: ThreadSummary[] = threaded.map((list) => {
    const sorted = [...list].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
    const latest = sorted[sorted.length - 1]!;
    const id = `thread:${sorted.map((m) => m.id).sort().join("|")}`;
    for (const m of sorted) m.threadId = id;
    return {
      id,
      subject: normalizeSubject(sorted[0]!.subject),
      snippet: latest.snippet,
      date: latest.date,
      from: latest.from,
      participants: mergeParticipants(sorted),
      messageCount: sorted.length,
      hasAttachments: sorted.some((m) => m.hasAttachments),
      messages: sorted,
    };
  });

  threads.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  return threads;
}

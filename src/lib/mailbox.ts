import { loadMailObjects, storageMode } from "./storage";
import { parseMailObject, type CachedMessage } from "./parse";
import { threadMessages } from "./thread";
import { sanitizeEmailHtml, wrapHtmlDocument } from "./sanitize";
import type { MailboxPayload, MessageSummary, ParsedMessage } from "./types";
import { domainOf, displayName } from "./utils";

interface Store {
  loaded: boolean;
  loading: Promise<void> | null;
  byId: Map<string, CachedMessage>;
  payload: MailboxPayload | null;
}

const g = globalThis as typeof globalThis & { __protoMail?: Store };

function store(): Store {
  if (!g.__protoMail) {
    g.__protoMail = {
      loaded: false,
      loading: null,
      byId: new Map(),
      payload: null,
    };
  }
  return g.__protoMail;
}

async function build(): Promise<void> {
  const s = store();
  const objects = await loadMailObjects();
  const parsed = await Promise.all(objects.map(parseMailObject));
  s.byId = new Map(parsed.map((p) => [p.summary.id, p]));

  const summaries: MessageSummary[] = parsed.map((p) => {
    const { html, text, attachments, ...rest } = p.summary;
    void html;
    void text;
    void attachments;
    return { ...rest, searchText: p.searchText };
  });
  const threads = threadMessages(summaries);

  const senderMap = new Map<string, { address: string; name: string; count: number }>();
  const domainMap = new Map<string, number>();
  for (const m of summaries) {
    const addr = m.from.address;
    if (addr) {
      const prev = senderMap.get(addr);
      senderMap.set(addr, {
        address: addr,
        name: displayName(m.from.name, addr),
        count: (prev?.count ?? 0) + 1,
      });
    }
    const d = domainOf(addr);
    if (d) domainMap.set(d, (domainMap.get(d) ?? 0) + 1);
  }

  s.payload = {
    source: storageMode(),
    messageCount: summaries.length,
    threadCount: threads.length,
    threads,
    messages: summaries,
    senders: [...senderMap.values()].sort((a, b) => b.count - a.count),
    domains: [...domainMap.entries()]
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count),
  };
  s.loaded = true;
}

export async function ensureMailbox(): Promise<Store> {
  const s = store();
  if (s.loaded) return s;
  if (!s.loading) {
    s.loading = build().finally(() => {
      s.loading = null;
    });
  }
  await s.loading;
  return s;
}

export async function getMailboxPayload(): Promise<MailboxPayload> {
  const s = await ensureMailbox();
  if (!s.payload) {
    throw new Error("Mailbox failed to load");
  }
  return s.payload;
}

export async function getCached(id: string): Promise<CachedMessage | undefined> {
  const s = await ensureMailbox();
  return s.byId.get(id);
}

export async function getParsedMessage(
  id: string,
  loadRemote: boolean,
): Promise<ParsedMessage | undefined> {
  const cached = await getCached(id);
  if (!cached) return undefined;
  const html = cached.summary.html
    ? wrapHtmlDocument(
        sanitizeEmailHtml(cached.summary.html, {
          messageId: id,
          loadRemote,
        }),
      )
    : undefined;
  return { ...cached.summary, html };
}

export async function getAttachment(id: string, attId: string) {
  const cached = await getCached(id);
  if (!cached) return undefined;
  const meta = cached.summary.attachments.find((a) => a.id === attId);
  const bytes = cached.attachmentBytes.get(attId);
  if (!meta || !bytes) return undefined;
  return { meta, bytes };
}

export async function getCid(id: string, cid: string) {
  const cached = await getCached(id);
  if (!cached) return undefined;
  const key = cid.replace(/^<|>$/g, "").toLowerCase();
  const attId =
    cached.cidIndex.get(key) ||
    cached.cidIndex.get(cid) ||
    [...cached.cidIndex.entries()].find(([k]) => k === key || k.endsWith(key))?.[1];
  if (!attId) return undefined;
  return getAttachment(id, attId);
}

export async function getRaw(id: string) {
  const cached = await getCached(id);
  if (!cached) return undefined;
  return { filename: cached.summary.filename, bytes: cached.raw };
}

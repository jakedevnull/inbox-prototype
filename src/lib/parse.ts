import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import type { MailObject } from "./storage";
import type { Address, AttachmentMeta, ParsedMessage } from "./types";
import { normalizeMessageId } from "./utils";

function asAddresses(
  value: AddressObject | AddressObject[] | undefined,
): Address[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  const out: Address[] = [];
  for (const item of list) {
    for (const v of item.value ?? []) {
      if (!v.address && !v.name) continue;
      out.push({
        name: v.name ?? "",
        address: (v.address ?? "").toLowerCase(),
      });
    }
  }
  return out;
}

function snippetFrom(text?: string, html?: string): string {
  const raw =
    text?.replace(/\s+/g, " ").trim() ||
    html
      ?.replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim() ||
    "";
  return raw.slice(0, 180);
}

function htmlSearchText(html?: string): string {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface CachedMessage {
  summary: ParsedMessage;
  searchText: string;
  raw: Buffer;
  attachmentBytes: Map<string, Buffer>;
  cidIndex: Map<string, string>;
}

function attachmentId(filename: string, index: number): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "");
  return `${index}-${safe || "part"}`;
}

export async function parseMailObject(obj: MailObject): Promise<CachedMessage> {
  const parsed: ParsedMail = await simpleParser(obj.bytes, {
    skipHtmlToText: true,
    keepCidLinks: true,
  });

  const from = asAddresses(parsed.from)[0] ?? { name: "", address: "" };
  const to = asAddresses(parsed.to);
  const cc = asAddresses(parsed.cc);
  const attachments: AttachmentMeta[] = [];
  const attachmentBytes = new Map<string, Buffer>();
  const cidIndex = new Map<string, string>();

  (parsed.attachments ?? []).forEach((att, index) => {
    const filename = att.filename || `attachment-${index + 1}`;
    const id = attachmentId(filename, index);
    const cid = att.cid ? normalizeMessageId(att.cid) : undefined;
    const inline = Boolean(
      att.contentDisposition === "inline" || cid || att.related,
    );
    const buf = Buffer.isBuffer(att.content)
      ? att.content
      : Buffer.from(att.content);
    attachments.push({
      id,
      filename,
      contentType: att.contentType || "application/octet-stream",
      size: att.size || buf.length,
      cid,
      inline,
    });
    attachmentBytes.set(id, buf);
    if (cid) {
      cidIndex.set(cid, id);
      cidIndex.set(cid.replace(/^<|>$/g, ""), id);
    }
    if (att.contentId) {
      cidIndex.set(normalizeMessageId(att.contentId), id);
    }
  });

  const text = parsed.text?.trim() || undefined;
  const html = typeof parsed.html === "string" ? parsed.html : undefined;
  const downloadable = attachments.filter((a) => !a.inline);

  const summary: ParsedMessage = {
    id: obj.id,
    source: obj.source,
    filename: obj.filename,
    messageId: normalizeMessageId(parsed.messageId) || obj.id,
    inReplyTo: normalizeMessageId(parsed.inReplyTo) || undefined,
    references: (parsed.references
      ? Array.isArray(parsed.references)
        ? parsed.references
        : String(parsed.references).split(/\s+/)
      : []
    )
      .flatMap((r) => r.split(/\s+/))
      .map(normalizeMessageId)
      .filter(Boolean),
    from,
    to,
    cc,
    subject: parsed.subject?.trim() || "(no subject)",
    date: (parsed.date ?? new Date()).toISOString(),
    snippet: snippetFrom(text, html),
    hasHtml: Boolean(html),
    hasText: Boolean(text),
    hasAttachments: downloadable.length > 0,
    attachmentCount: downloadable.length,
    threadId: "",
    searchText: "",
    html,
    text,
    attachments,
  };

  const searchText = [
    summary.subject,
    summary.from.name,
    summary.from.address,
    ...to.map((a) => `${a.name} ${a.address}`),
    ...cc.map((a) => `${a.name} ${a.address}`),
    text ?? "",
    htmlSearchText(html),
    ...attachments.map((a) => a.filename),
  ]
    .join(" ")
    .toLowerCase();
  summary.searchText = searchText;

  return { summary, searchText, raw: obj.bytes, attachmentBytes, cidIndex };
}

"use client";

import { format, parseISO } from "date-fns";
import {
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  Mail,
  Paperclip,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { HtmlFrame } from "./html-frame";
import { cn, displayName, formatBytes } from "@/lib/utils";
import type { AttachmentMeta, ParsedMessage, ThreadSummary } from "@/lib/types";

function attUrl(messageId: string, att: AttachmentMeta, inline = false) {
  const base = `/api/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(att.id)}`;
  return inline ? `${base}?inline=1` : base;
}

function formatAddressList(
  list: { name: string; address: string }[],
): string {
  if (list.length === 0) return "—";
  return list
    .map((a) =>
      a.name ? `${displayName(a.name, a.address)} <${a.address}>` : a.address,
    )
    .join(", ");
}

export function ReadingPane({
  thread,
  message,
  loading,
  error,
  loadRemote,
  onLoadRemote,
  onSelectInThread,
  onToggleUnread,
  isRead,
}: {
  thread: ThreadSummary | null;
  message: ParsedMessage | null;
  loading: boolean;
  error: string | null;
  loadRemote: boolean;
  onLoadRemote: () => void;
  onSelectInThread: (id: string) => void;
  onToggleUnread: () => void;
  isRead: boolean;
}) {
  const [view, setView] = useState<"html" | "text">("html");

  const effectiveView = useMemo(() => {
    if (!message) return "html";
    if (view === "html" && message.hasHtml) return "html";
    if (view === "text" && message.hasText) return "text";
    if (message.hasHtml) return "html";
    return "text";
  }, [message, view]);

  if (!thread && !message && !loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-10 text-center">
        <Mail size={28} className="text-gold-dim" strokeWidth={1.25} />
        <p className="mt-4 font-serif text-3xl italic text-ink">Select a letter</p>
        <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-ink-muted">
          The list on the left is the mailbox.{" "}
          <kbd>j</kbd> and <kbd>k</kbd> move, <kbd>enter</kbd> opens,{" "}
          <kbd>/</kbd> searches. Remote images stay outside until you ask.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center">
        <div>
          <p className="font-serif text-2xl italic text-terracotta">Could not open this letter</p>
          <p className="mt-2 text-[13px] text-ink-muted">{error}</p>
        </div>
      </div>
    );
  }

  const files = (message?.attachments ?? []).filter((a) => !a.inline);
  const images = files.filter((a) => a.contentType.startsWith("image/"));
  const others = files.filter((a) => !a.contentType.startsWith("image/"));

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[color:var(--line)] px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <h1 className="font-serif text-[26px] leading-tight tracking-tight text-ink">
            {thread?.subject ?? message?.subject ?? "—"}
          </h1>
          {message ? (
            <button
              type="button"
              onClick={onToggleUnread}
              className="shrink-0 text-[11px] uppercase tracking-[0.14em] text-ink-faint hover:text-gold"
            >
              {isRead ? "Mark unread" : "Mark read"}
            </button>
          ) : null}
        </div>
        {message ? (
          <dl className="mt-3 grid grid-cols-[72px_1fr] gap-x-2 gap-y-1 text-[12px]">
            <dt className="text-ink-faint">From</dt>
            <dd className="truncate text-ink">
              {displayName(message.from.name, message.from.address)}
              <span className="text-ink-faint"> · {message.from.address}</span>
            </dd>
            <dt className="text-ink-faint">To</dt>
            <dd className="truncate text-ink-muted">{formatAddressList(message.to)}</dd>
            {message.cc.length > 0 ? (
              <>
                <dt className="text-ink-faint">Cc</dt>
                <dd className="truncate text-ink-muted">{formatAddressList(message.cc)}</dd>
              </>
            ) : null}
            <dt className="text-ink-faint">Date</dt>
            <dd className="text-ink-muted">
              {format(parseISO(message.date), "EEEE, d MMMM yyyy · HH:mm")}
            </dd>
          </dl>
        ) : (
          <div className="mt-4 h-16 animate-pulse rounded bg-panel-3" />
        )}
        {thread && thread.messageCount > 1 ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {thread.messages.map((m, i) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelectInThread(m.id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                  message?.id === m.id
                    ? "border-gold/40 bg-gold-soft text-ink"
                    : "border-[color:var(--line)] text-ink-muted hover:text-ink",
                )}
              >
                {i + 1}. {displayName(m.from.name, m.from.address)}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <div className="flex items-center justify-between border-b border-[color:var(--line)] px-6 py-2">
        <div className="flex gap-1">
          {message?.hasHtml ? (
            <ToggleChip active={effectiveView === "html"} onClick={() => setView("html")}>
              HTML
            </ToggleChip>
          ) : null}
          {message?.hasText ? (
            <ToggleChip active={effectiveView === "text"} onClick={() => setView("text")}>
              Plain
            </ToggleChip>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {message?.hasHtml && !loadRemote ? (
            <button
              type="button"
              onClick={onLoadRemote}
              className="text-[11px] text-ink-muted hover:text-gold"
            >
              Load remote images
            </button>
          ) : null}
          {message ? (
            <a
              href={`/api/messages/${encodeURIComponent(message.id)}/raw`}
              className="text-[11px] text-ink-faint hover:text-ink"
            >
              Download .eml
            </a>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-thin">
        {loading && !message ? (
          <div className="flex h-40 items-center justify-center text-ink-faint">
            <Loader2 className="animate-spin" size={18} />
          </div>
        ) : null}
        {message && effectiveView === "html" && message.html ? (
          <HtmlFrame html={message.html} />
        ) : null}
        {message && effectiveView === "text" ? (
          <pre className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-ink">
            {linkify(message.text || "")}
          </pre>
        ) : null}
        {message && !message.html && !message.text ? (
          <p className="text-[13px] text-ink-muted">This letter has no body.</p>
        ) : null}

        {message && files.length > 0 ? (
          <section className="mt-8 border-t border-[color:var(--line)] pt-5">
            <p className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-ink-faint">
              <Paperclip size={12} /> {files.length} attachment{files.length === 1 ? "" : "s"}
            </p>
            {images.length > 0 ? (
              <div className="mb-4 grid grid-cols-2 gap-3">
                {images.map((img) => (
                  <a
                    key={img.id}
                    href={attUrl(message.id, img, true)}
                    target="_blank"
                    rel="noreferrer"
                    className="group overflow-hidden rounded-sm border border-[color:var(--line)] bg-panel-2"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={attUrl(message.id, img, true)}
                      alt={img.filename}
                      className="h-40 w-full object-cover"
                    />
                    <div className="flex items-center justify-between px-2 py-1.5 text-[11px] text-ink-muted">
                      <span className="truncate">{img.filename}</span>
                      <span className="font-mono text-[10px]">{formatBytes(img.size)}</span>
                    </div>
                  </a>
                ))}
              </div>
            ) : null}
            <ul className="space-y-1.5">
              {others.map((att) => (
                <li
                  key={att.id}
                  className="flex items-center gap-3 rounded-md border border-[color:var(--line)] bg-panel-2 px-3 py-2"
                >
                  {att.contentType === "application/pdf" ? (
                    <FileText size={16} className="text-gold" />
                  ) : att.contentType.startsWith("image/") ? (
                    <ImageIcon size={16} className="text-gold" />
                  ) : (
                    <Paperclip size={16} className="text-ink-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px]">{att.filename}</p>
                    <p className="font-mono text-[10px] text-ink-faint">
                      {att.contentType} · {formatBytes(att.size)}
                    </p>
                  </div>
                  {att.contentType === "application/pdf" ? (
                    <a
                      href={attUrl(message.id, att, true)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-ink-faint hover:text-ink"
                      title="Open PDF"
                    >
                      <ExternalLink size={14} />
                    </a>
                  ) : null}
                  <a
                    href={attUrl(message.id, att, false)}
                    download={att.filename}
                    className="text-ink-faint hover:text-ink"
                    title="Download"
                  >
                    <Download size={14} />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-0.5 text-[11px] uppercase tracking-[0.12em]",
        active ? "bg-gold-soft text-gold" : "text-ink-faint hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function linkify(text: string): ReactNode {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) =>
    part.startsWith("http") ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noreferrer"
        className="text-gold underline decoration-gold/30 underline-offset-2"
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

"use client";

import { Search, X, Paperclip, Calendar } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { MessageList } from "./message-list";
import { ReadingPane } from "./reading-pane";
import { useReadState } from "@/hooks/use-read-state";
import { activeFilterCount, defaultFilters, filterThreads } from "@/lib/filter";
import type { MailboxPayload, MailFilters, ParsedMessage, ThreadSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

export function MailboxShell() {
  const [data, setData] = useState<MailboxPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState<MailFilters>(defaultFilters);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<ParsedMessage | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [loadRemote, setLoadRemote] = useState(false);
  const [fromOpen, setFromOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState<"list" | "read">("list");

  const searchRef = useRef<HTMLInputElement>(null);
  const { readIds, markRead, markUnread, isRead } = useReadState();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/mailbox")
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Mailbox failed (${res.status})`);
        }
        return res.json() as Promise<MailboxPayload>;
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load mailbox");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const threads = useMemo(() => {
    if (!data) return [];
    return filterThreads(data.threads, filters, readIds);
  }, [data, filters, readIds]);

  const selectedThread = useMemo(
    () => threads.find((t) => t.id === selectedThreadId) ?? null,
    [threads, selectedThreadId],
  );

  useEffect(() => {
    if (!selectedMessageId) return;
    let cancelled = false;
    const url = `/api/messages/${encodeURIComponent(selectedMessageId)}${loadRemote ? "?remote=1" : ""}`;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Message not found");
        }
        return res.json() as Promise<ParsedMessage>;
      })
      .then((parsed) => {
        if (!cancelled) {
          setMessage(parsed);
          setMessageError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setMessageError(err instanceof Error ? err.message : "Failed to open message");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMessageId, loadRemote]);

  const selectThread = useCallback((thread: ThreadSummary) => {
    setSelectedThreadId(thread.id);
    const unread = thread.messages.find((m) => !readIds.has(m.id));
    const target = unread ?? thread.messages[thread.messages.length - 1]!;
    setSelectedMessageId(target.id);
    setMessageError(null);
    setLoadRemote(false);
    setMobilePane("read");
    markRead(target.id);
  }, [readIds, markRead]);

  const selectMessage = useCallback((thread: ThreadSummary, id: string) => {
    setSelectedThreadId(thread.id);
    setSelectedMessageId(id);
    setMessageError(null);
    setLoadRemote(false);
    setMobilePane("read");
    markRead(id);
  }, [markRead]);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const move = useCallback(
    (delta: number) => {
      if (threads.length === 0) return;
      const idx = threads.findIndex((t) => t.id === selectedThreadId);
      const nextIdx =
        idx < 0 ? (delta > 0 ? 0 : threads.length - 1) : Math.max(0, Math.min(threads.length - 1, idx + delta));
      const next = threads[nextIdx];
      if (next) selectThread(next);
    },
    [threads, selectedThreadId, selectThread],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (!typing) {
          e.preventDefault();
          searchRef.current?.focus();
          searchRef.current?.select();
        }
        return;
      }
      if (e.key === "Escape") {
        if (typing) {
          (target as HTMLInputElement).blur();
        }
        if (filters.query || filters.from || filters.after || filters.before || filters.hasAttachment) {
          setFilters((f) => ({
            ...f,
            query: "",
            from: "",
            after: "",
            before: "",
            hasAttachment: f.nav === "attachments",
          }));
        }
        if (mobilePane === "read") setMobilePane("list");
        return;
      }
      if (typing) return;
      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        move(1);
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        move(-1);
      } else if (e.key === "Enter" || e.key === "o" || e.key === "O") {
        e.preventDefault();
        if (selectedThread) {
          setMobilePane("read");
          if (selectedThread.messageCount > 1) toggleExpand(selectedThread.id);
        } else if (threads[0]) {
          selectThread(threads[0]);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filters, mobilePane, move, selectedThread, threads, selectThread, toggleExpand]);

  const unreadCount = useMemo(() => {
    if (!data) return 0;
    return data.messages.filter((m) => !readIds.has(m.id)).length;
  }, [data, readIds]);

  const attachmentThreadCount = useMemo(() => {
    if (!data) return 0;
    return data.threads.filter((t) => t.hasAttachments).length;
  }, [data]);

  const senderMatches = useMemo(() => {
    if (!data || !filters.from) return [];
    const q = filters.from.toLowerCase();
    return data.senders
      .filter(
        (s) => s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [data, filters.from]);

  const chipCount = activeFilterCount(filters);

  const onNav = (nav: MailFilters["nav"], domain?: string) => {
    setFilters((f) => ({
      ...defaultFilters(),
      query: f.query,
      nav,
      domain: nav === "domain" ? domain ?? "" : "",
      hasAttachment: nav === "attachments",
      unreadOnly: nav === "unread",
    }));
    setMobilePane("list");
  };

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center bg-paper px-6 text-center">
        <div>
          <p className="font-serif text-3xl italic">The mailbox is locked</p>
          <p className="mt-3 text-sm text-ink-muted">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-1 bg-paper lg:grid-cols-[220px_minmax(320px,380px)_1fr]">
      <div className="hidden lg:block">
        <Sidebar
          filters={filters}
          onNav={onNav}
          unreadCount={unreadCount}
          totalCount={data?.messageCount ?? 0}
          attachmentCount={attachmentThreadCount}
          domains={data?.domains ?? []}
          source={data?.source ?? "local"}
        />
      </div>

      <section
        className={cn(
          "flex h-full min-h-0 flex-col border-r border-[color:var(--line)] bg-panel-2",
          mobilePane === "read" && "hidden lg:flex",
        )}
      >
        <div className="border-b border-[color:var(--line)] px-3 py-3">
          <label className="flex items-center gap-2 rounded-md border border-[color:var(--line)] bg-panel px-3 py-2">
            <Search size={14} className="text-ink-faint" />
            <input
              ref={searchRef}
              value={filters.query}
              onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
              placeholder="Search from, to, subject, body"
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-ink-faint"
            />
            {filters.query ? (
              <button
                type="button"
                onClick={() => setFilters((f) => ({ ...f, query: "" }))}
                className="text-ink-faint hover:text-ink"
              >
                <X size={14} />
              </button>
            ) : (
              <kbd>/</kbd>
            )}
          </label>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <FilterToggle
              active={filters.hasAttachment}
              onClick={() =>
                setFilters((f) => ({ ...f, hasAttachment: !f.hasAttachment }))
              }
            >
              <Paperclip size={11} /> Files
            </FilterToggle>
            <div className="relative">
              <input
                value={filters.from}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, from: e.target.value }));
                  setFromOpen(true);
                }}
                onFocus={() => setFromOpen(true)}
                onBlur={() => window.setTimeout(() => setFromOpen(false), 150)}
                placeholder="From"
                className="w-[140px] rounded-full border border-[color:var(--line)] bg-panel px-3 py-1 text-[11px] outline-none placeholder:text-ink-faint"
              />
              {fromOpen && senderMatches.length > 0 ? (
                <ul className="absolute z-20 mt-1 w-64 overflow-hidden rounded-md border border-[color:var(--line-strong)] bg-panel-3 shadow-xl">
                  {senderMatches.map((s) => (
                    <li key={s.address}>
                      <button
                        type="button"
                        className="flex w-full flex-col px-3 py-2 text-left text-[12px] hover:bg-panel-2"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setFilters((f) => ({ ...f, from: s.address }));
                          setFromOpen(false);
                        }}
                      >
                        <span>{s.name}</span>
                        <span className="text-[11px] text-ink-faint">{s.address}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <label className="flex items-center gap-1 rounded-full border border-[color:var(--line)] bg-panel px-2 py-1 text-[11px] text-ink-muted">
              <Calendar size={11} />
              <input
                type="date"
                value={filters.after}
                onChange={(e) => setFilters((f) => ({ ...f, after: e.target.value }))}
                className="bg-transparent text-[11px] text-ink outline-none"
              />
              <span className="text-ink-faint">–</span>
              <input
                type="date"
                value={filters.before}
                onChange={(e) => setFilters((f) => ({ ...f, before: e.target.value }))}
                className="bg-transparent text-[11px] text-ink outline-none"
              />
            </label>
          </div>

          {(chipCount > 0 || filters.domain || filters.query) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {filters.query ? (
                <Chip onClear={() => setFilters((f) => ({ ...f, query: "" }))}>
                  “{filters.query}”
                </Chip>
              ) : null}
              {filters.hasAttachment ? (
                <Chip onClear={() => setFilters((f) => ({ ...f, hasAttachment: false }))}>
                  Has files
                </Chip>
              ) : null}
              {filters.from ? (
                <Chip onClear={() => setFilters((f) => ({ ...f, from: "" }))}>
                  From {filters.from}
                </Chip>
              ) : null}
              {filters.domain ? (
                <Chip
                  onClear={() =>
                    setFilters((f) => ({ ...f, domain: "", nav: "all" }))
                  }
                >
                  @{filters.domain}
                </Chip>
              ) : null}
              {filters.after ? (
                <Chip onClear={() => setFilters((f) => ({ ...f, after: "" }))}>
                  After {filters.after}
                </Chip>
              ) : null}
              {filters.before ? (
                <Chip onClear={() => setFilters((f) => ({ ...f, before: "" }))}>
                  Before {filters.before}
                </Chip>
              ) : null}
              <button
                type="button"
                className="px-1 text-[11px] text-ink-faint hover:text-gold"
                onClick={() => setFilters(defaultFilters())}
              >
                Clear
              </button>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1">
          {!data ? (
            <ListSkeleton />
          ) : (
            <MessageList
              threads={threads}
              selectedThreadId={selectedThreadId}
              selectedMessageId={selectedMessageId}
              expanded={expanded}
              onSelectThread={selectThread}
              onSelectMessage={(t, m) => selectMessage(t, m.id)}
              onToggleExpand={toggleExpand}
              readIds={readIds}
              emptyTitle={filters.query ? "Nothing matches" : "Empty folder"}
              emptyBody={
                filters.query
                  ? "Try a name, a domain, or a word from the body. Esc clears the search."
                  : "No letters in this view. Drop more .eml files into data/emails and refresh."
              }
            />
          )}
        </div>
      </section>

      <section
        className={cn(
          "h-full min-h-0 bg-panel",
          mobilePane === "list" && "hidden lg:block",
        )}
      >
        <div className="flex h-9 items-center border-b border-[color:var(--line)] px-3 lg:hidden">
          <button
            type="button"
            className="text-[12px] text-gold"
            onClick={() => setMobilePane("list")}
          >
            ← Mailbox
          </button>
        </div>
        <ReadingPane
          thread={selectedThread}
          message={
            selectedMessageId && message?.id === selectedMessageId ? message : null
          }
          loading={Boolean(
            selectedMessageId &&
              message?.id !== selectedMessageId &&
              !messageError,
          )}
          error={messageError}
          loadRemote={loadRemote}
          onLoadRemote={() => setLoadRemote(true)}
          onSelectInThread={(id) => {
            if (selectedThread) selectMessage(selectedThread, id);
          }}
          onToggleUnread={() => {
            if (!selectedMessageId) return;
            if (isRead(selectedMessageId)) markUnread(selectedMessageId);
            else markRead(selectedMessageId);
          }}
          isRead={selectedMessageId ? isRead(selectedMessageId) : false}
        />
      </section>
    </div>
  );
}

function Chip({
  children,
  onClear,
}: {
  children: ReactNode;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gold-soft px-2 py-0.5 text-[11px] text-gold">
      {children}
      <button type="button" onClick={onClear} className="hover:text-ink" aria-label="Remove filter">
        <X size={10} />
      </button>
    </span>
  );
}

function FilterToggle({
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
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px]",
        active
          ? "border-gold/40 bg-gold-soft text-gold"
          : "border-[color:var(--line)] text-ink-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-0 p-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="border-b border-[color:var(--line)] py-3">
          <div className="h-3 w-1/3 animate-pulse rounded bg-panel-3" />
          <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-panel-3/80" />
          <div className="mt-2 h-3 w-full animate-pulse rounded bg-panel-3/60" />
        </div>
      ))}
    </div>
  );
}

"use client";

import { format, isToday, isYesterday, isThisWeek, parseISO } from "date-fns";
import { ChevronDown, Paperclip } from "lucide-react";
import { cn, displayName, initials } from "@/lib/utils";
import type { MessageSummary, ThreadSummary } from "@/lib/types";

function dateLabel(iso: string): string {
  const d = parseISO(iso);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  if (isThisWeek(d, { weekStartsOn: 1 })) return "This week";
  return format(d, "MMMM yyyy");
}

function timeLabel(iso: string): string {
  const d = parseISO(iso);
  if (isToday(d) || isYesterday(d)) return format(d, "HH:mm");
  return format(d, "MMM d");
}

export function MessageList({
  threads,
  selectedThreadId,
  selectedMessageId,
  expanded,
  onSelectThread,
  onSelectMessage,
  onToggleExpand,
  readIds,
  emptyTitle,
  emptyBody,
}: {
  threads: ThreadSummary[];
  selectedThreadId: string | null;
  selectedMessageId: string | null;
  expanded: Set<string>;
  onSelectThread: (thread: ThreadSummary) => void;
  onSelectMessage: (thread: ThreadSummary, message: MessageSummary) => void;
  onToggleExpand: (threadId: string) => void;
  readIds: Set<string>;
  emptyTitle: string;
  emptyBody: string;
}) {
  if (threads.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <p className="font-serif text-2xl italic text-ink">{emptyTitle}</p>
        <p className="mt-2 max-w-[240px] text-[13px] leading-relaxed text-ink-muted">
          {emptyBody}
        </p>
      </div>
    );
  }

  const groups: { label: string; threads: ThreadSummary[] }[] = [];
  for (const thread of threads) {
    const label = dateLabel(thread.date);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.threads.push(thread);
    else groups.push({ label, threads: [thread] });
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="sticky top-0 z-10 bg-panel-2/95 px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-ink-faint backdrop-blur">
            {group.label}
          </div>
          {group.threads.map((thread) => {
            const unread = thread.messages.some((m) => !readIds.has(m.id));
            const selected = thread.id === selectedThreadId;
            const isOpen = expanded.has(thread.id) && thread.messageCount > 1;
            return (
              <div key={thread.id}>
            <button
              type="button"
              onClick={() => onSelectThread(thread)}
              className={cn(
                "relative flex w-full gap-3 border-b border-[color:var(--line)] px-4 py-3 text-left transition-colors",
                selected ? "bg-panel-3" : "hover:bg-panel-3/60",
              )}
            >
              {selected ? (
                <span className="absolute inset-y-0 left-0 w-[2px] bg-gold" />
              ) : null}
              <span
                className={cn(
                  "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                  unread ? "bg-gold" : "bg-transparent",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={cn(
                      "truncate text-[13px]",
                      unread ? "text-ink" : "text-ink-muted",
                    )}
                  >
                    {displayName(thread.from.name, thread.from.address)}
                    {thread.messageCount > 1 ? (
                      <span className="ml-1.5 font-mono text-[10px] text-ink-faint">
                        {thread.messageCount}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-ink-faint">
                    {timeLabel(thread.date)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <p
                    className={cn(
                      "truncate text-[13px]",
                      unread ? "text-ink" : "text-ink-muted",
                    )}
                  >
                    {thread.subject}
                  </p>
                  {thread.hasAttachments ? (
                    <Paperclip size={12} className="shrink-0 text-ink-faint" />
                  ) : null}
                </div>
                <p className="mt-0.5 truncate text-[12px] text-ink-faint">{thread.snippet}</p>
              </div>
              {thread.messageCount > 1 ? (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleExpand(thread.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      onToggleExpand(thread.id);
                    }
                  }}
                  className="mt-1 self-start rounded p-1 text-ink-faint hover:bg-panel-2 hover:text-ink"
                  aria-label="Expand thread"
                >
                  <ChevronDown
                    size={14}
                    className={cn("transition-transform", isOpen && "rotate-180")}
                  />
                </span>
              ) : null}
            </button>
            {isOpen
              ? thread.messages.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onSelectMessage(thread, m)}
                    className={cn(
                      "flex w-full items-center gap-3 border-b border-[color:var(--line)] py-2 pl-12 pr-4 text-left text-[12px]",
                      selectedMessageId === m.id
                        ? "bg-gold-soft"
                        : "bg-panel hover:bg-panel-3",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-panel-3 font-serif text-[10px]",
                        !readIds.has(m.id) && "ring-1 ring-gold/60",
                      )}
                    >
                      {initials(displayName(m.from.name, m.from.address))}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-ink-muted">
                      {displayName(m.from.name, m.from.address)}
                      <span className="text-ink-faint"> — {m.snippet}</span>
                    </span>
                    <span className="font-mono text-[10px] text-ink-faint">
                      {timeLabel(m.date)}
                    </span>
                  </button>
                ))
              : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

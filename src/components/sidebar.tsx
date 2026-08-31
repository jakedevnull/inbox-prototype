"use client";

import {
  Inbox,
  Paperclip,
  Circle,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { DomainFacet, MailFilters } from "@/lib/types";

export function Sidebar({
  filters,
  onNav,
  unreadCount,
  totalCount,
  attachmentCount,
  domains,
  source,
}: {
  filters: MailFilters;
  onNav: (nav: MailFilters["nav"], domain?: string) => void;
  unreadCount: number;
  totalCount: number;
  attachmentCount: number;
  domains: DomainFacet[];
  source: string;
}) {
  return (
    <aside className="flex h-full flex-col border-r border-[color:var(--line)] bg-panel">
      <div className="px-5 pb-5 pt-6">
        <div className="font-serif text-[26px] leading-none tracking-tight text-ink">
          proto<span className="italic text-gold">mail</span>
        </div>
        <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-ink-faint">
          {source === "r2" ? "Cloudflare R2" : source === "both" ? "Local + R2" : "Local corpus"}
        </p>
      </div>

      <nav className="flex flex-col gap-0.5 px-2">
        <NavItem
          active={filters.nav === "all" && !filters.domain}
          onClick={() => onNav("all")}
          icon={<Inbox size={15} strokeWidth={1.75} />}
          label="All mail"
          count={totalCount}
        />
        <NavItem
          active={filters.nav === "unread"}
          onClick={() => onNav("unread")}
          icon={<Circle size={11} strokeWidth={2.4} className="text-gold" />}
          label="Unread"
          count={unreadCount}
        />
        <NavItem
          active={filters.nav === "attachments"}
          onClick={() => onNav("attachments")}
          icon={<Paperclip size={15} strokeWidth={1.75} />}
          label="With files"
          count={attachmentCount}
        />
      </nav>

      <div className="mt-8 px-5">
        <p className="text-[10px] uppercase tracking-[0.2em] text-ink-faint">Senders</p>
      </div>
      <div className="mt-2 flex-1 overflow-y-auto px-2 pb-4 scrollbar-thin">
        {domains.slice(0, 10).map((d) => (
          <NavItem
            key={d.domain}
            active={filters.nav === "domain" && filters.domain === d.domain}
            onClick={() => onNav("domain", d.domain)}
            label={d.domain}
            count={d.count}
          />
        ))}
      </div>

      <div className="border-t border-[color:var(--line)] px-4 py-3 text-[11px] leading-relaxed text-ink-faint">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <span>
            <kbd>j</kbd> <kbd>k</kbd> move
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span>
            <kbd>/</kbd> search
          </span>
          <span>
            <kbd>esc</kbd> clear
          </span>
        </div>
      </div>
    </aside>
  );
}

function NavItem({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon?: ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-[13px] transition-colors",
        active
          ? "bg-gold-soft text-ink"
          : "text-ink-muted hover:bg-panel-2 hover:text-ink",
      )}
    >
      {icon ? <span className="w-4 shrink-0 opacity-80">{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {typeof count === "number" ? (
        <span className="font-mono text-[10px] tabular-nums text-ink-faint">{count}</span>
      ) : null}
    </button>
  );
}

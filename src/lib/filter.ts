import type { MailFilters, ThreadSummary } from "./types";
import { domainOf } from "./utils";

export function filterThreads(
  threads: ThreadSummary[],
  filters: MailFilters,
  readIds: Set<string>,
): ThreadSummary[] {
  const q = filters.query.trim().toLowerCase();
  const fromQ = filters.from.trim().toLowerCase();
  const after = filters.after ? new Date(filters.after).getTime() : null;
  const before = filters.before
    ? new Date(filters.before + "T23:59:59.999").getTime()
    : null;

  return threads.filter((thread) => {
    if (filters.nav === "attachments" || filters.hasAttachment) {
      if (!thread.hasAttachments) return false;
    }
    if (filters.nav === "unread" || filters.unreadOnly) {
      if (thread.messages.every((m) => readIds.has(m.id))) return false;
    }
    if (filters.nav === "domain" && filters.domain) {
      if (
        !thread.messages.some(
          (m) => domainOf(m.from.address) === filters.domain.toLowerCase(),
        )
      ) {
        return false;
      }
    } else if (filters.domain) {
      if (
        !thread.messages.some(
          (m) => domainOf(m.from.address) === filters.domain.toLowerCase(),
        )
      ) {
        return false;
      }
    }

    const hay = thread.messages.some((m) => {
      if (fromQ) {
        const blob = `${m.from.name} ${m.from.address}`.toLowerCase();
        if (!blob.includes(fromQ)) return false;
      }
      if (after !== null && new Date(m.date).getTime() < after) return false;
      if (before !== null && new Date(m.date).getTime() > before) return false;
      if (q) {
        const text = (m.searchText || `${m.subject} ${m.snippet} ${m.from.address}`).toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
    return hay;
  });
}

export function defaultFilters(): MailFilters {
  return {
    query: "",
    hasAttachment: false,
    from: "",
    domain: "",
    after: "",
    before: "",
    unreadOnly: false,
    nav: "all",
  };
}

export function activeFilterCount(filters: MailFilters): number {
  let n = 0;
  if (filters.hasAttachment && filters.nav !== "attachments") n += 1;
  if (filters.from) n += 1;
  if (filters.domain && filters.nav !== "domain") n += 1;
  if (filters.after) n += 1;
  if (filters.before) n += 1;
  return n;
}

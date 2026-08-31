"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

const KEY = "proto-mail:read-ids";

let cached = "[]";
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStoreChange);
  }
  return () => {
    listeners.delete(onStoreChange);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStoreChange);
    }
  };
}

function getSnapshot(): string {
  if (typeof window === "undefined") return cached;
  const stored = window.localStorage.getItem(KEY) ?? "[]";
  if (stored !== cached) cached = stored;
  return cached;
}

function getServerSnapshot(): string {
  return "[]";
}

function parseIds(raw: string): Set<string> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

export function useReadState() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const readIds = useMemo(() => parseIds(raw), [raw]);

  const persist = useCallback((next: Set<string>) => {
    cached = JSON.stringify([...next]);
    window.localStorage.setItem(KEY, cached);
    emit();
  }, []);

  const markRead = useCallback(
    (id: string) => {
      if (readIds.has(id)) return;
      const next = new Set(readIds);
      next.add(id);
      persist(next);
    },
    [readIds, persist],
  );

  const markUnread = useCallback(
    (id: string) => {
      if (!readIds.has(id)) return;
      const next = new Set(readIds);
      next.delete(id);
      persist(next);
    },
    [readIds, persist],
  );

  const isRead = useCallback((id: string) => readIds.has(id), [readIds]);

  return { readIds, markRead, markUnread, isRead };
}

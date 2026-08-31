import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / 1024 ** i;
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

export function normalizeMessageId(id: string | undefined | null): string {
  if (!id) return "";
  return id.replace(/^<|>$/g, "").trim().toLowerCase();
}

export function normalizeSubject(subject: string | undefined | null): string {
  if (!subject) return "(no subject)";
  return subject.replace(/^(re|fw|fwd)\s*:\s*/gi, "").trim() || "(no subject)";
}

export function domainOf(address: string | undefined | null): string {
  if (!address) return "";
  const at = address.lastIndexOf("@");
  return at >= 0 ? address.slice(at + 1).toLowerCase() : "";
}

export function displayName(name: string | undefined, address: string | undefined): string {
  const n = name?.trim();
  if (n) return n.replace(/^"|"$/g, "");
  if (!address) return "Unknown";
  const local = address.split("@")[0] ?? address;
  return local.replace(/[._]/g, " ");
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

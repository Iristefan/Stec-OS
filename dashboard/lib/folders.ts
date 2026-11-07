/**
 * Stec OS: small helpers for the Folders page (app/folders/page.tsx). Kept out
 * of the page file because a Next.js page may only export its component.
 */
import type { Drive } from "@/lib/types";
import { samePath, type FolderRoot } from "@/components/folders/FolderTree";

/** The last folder picked here, so the page reopens where the user left it. */
export const FOLDERS_PICK_KEY = "stec_folders_pick";

/** Bytes in words a person reads: 0 B, 12 KB, 3.4 MB, 1.2 GB. */
export function formatSize(n: number | null | undefined): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v >= 10 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** The folder's own name, from its path (a drive root keeps its whole path). */
export function folderName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const last = trimmed.split(/[\\/]/).pop();
  return last || path;
}

/** Home first, then every drive that is not the same place again. */
export function buildRoots(home: string | null, drives: Drive[]): FolderRoot[] {
  const roots: FolderRoot[] = [];
  if (home) roots.push({ path: home, label: "Home", kind: "home" });
  for (const d of drives) {
    if (roots.some((r) => samePath(r.path, d.path))) continue;
    const label = (d.label ?? "").trim();
    const words =
      !label || d.path.toLowerCase().startsWith(label.toLowerCase())
        ? d.path
        : `${label} (${d.path})`;
    roots.push({ path: d.path, label: words, kind: "drive" });
  }
  return roots;
}


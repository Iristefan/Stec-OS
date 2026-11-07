"use client";

/**
 * Stec OS: the Folders page's tree (left side of the centre window).
 *
 * Every place the user keeps files, at once: the home folder first, then each
 * drive, each one a root that opens one level at a time (`GET /fs/list
 * ?dirs_only=true`), so a click on a huge folder never hangs the page. The
 * picked folder is lifted to the page, which lists its contents beside the
 * tree. Keyboard: every row is a real button; Enter / Space opens and picks.
 */

import { useEffect, useState } from "react";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  GitBranch,
  HardDrive,
  House,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { ApiError, get } from "@/lib/api";
import type { FsListing } from "@/lib/types";

export interface FolderRoot {
  path: string;
  label: string;
  kind: "home" | "drive";
}

interface Node {
  name: string;
  path: string;
  is_project: string | null;
}

/** Same path, whatever the separators or a trailing slash say. */
export function samePath(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  return norm(a) === norm(b);
}

function TreeRow({
  node,
  depth,
  selected,
  onSelect,
  icon,
  startOpen = false,
}: {
  node: Node;
  depth: number;
  selected: string | null;
  onSelect: (path: string) => void;
  icon?: "home" | "drive";
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [children, setChildren] = useState<Node[] | null>(null);
  const [loading, setLoading] = useState(startOpen);
  const [error, setError] = useState<string | null>(null);
  const active = samePath(selected, node.path);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await get<FsListing>(
        `/fs/list?path=${encodeURIComponent(node.path)}&dirs_only=true`,
      );
      setChildren(
        data.entries.map((e) => ({ name: e.name, path: e.path, is_project: e.is_project })),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
      setChildren([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (startOpen) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    const next = !open;
    setOpen(next);
    if (next && children === null && !loading) void load();
  }

  function pick() {
    onSelect(node.path);
    if (!open) {
      setOpen(true);
      if (children === null && !loading) void load();
    }
  }

  const pad = 8 + depth * 16;
  const Lead =
    icon === "home" ? House : icon === "drive" ? HardDrive : open ? FolderOpen : Folder;

  return (
    <div role="treeitem" aria-expanded={open} aria-selected={active}>
      <div
        className={`group flex items-center rounded-lg pr-2 text-[13px] transition-colors ${
          active ? "bg-accent/[0.10] text-zinc-100" : "text-zinc-300 hover:bg-white/[0.05]"
        }`}
        style={{ paddingLeft: pad }}
      >
        <button
          type="button"
          onClick={toggle}
          aria-label={open ? `Close ${node.name}` : `Open ${node.name}`}
          className="flex h-7 w-5 shrink-0 items-center justify-center text-zinc-500 hover:text-zinc-200"
        >
          <ChevronRight size={13} className={`transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
        <button
          type="button"
          onClick={pick}
          title={node.path}
          data-testid="folder-tree-row"
          data-path={node.path}
          className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
        >
          <Lead
            size={14}
            className={`shrink-0 ${open || icon ? "text-accent-soft/80" : "text-zinc-500"}`}
          />
          <span className="truncate">{node.name}</span>
          {node.is_project && (
            <span
              className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] text-zinc-500"
              title={`Looks like a code project (${node.is_project})`}
            >
              {node.is_project === "git" && <GitBranch size={11} />}
              {node.is_project}
            </span>
          )}
        </button>
      </div>
      {open && (
        <div role="group">
          {loading && (
            <div
              className="flex items-center gap-1.5 py-1 text-[12px] text-zinc-500"
              style={{ paddingLeft: pad + 24 }}
            >
              <Loader2 size={11} className="animate-spin" /> Loading…
            </div>
          )}
          {error && (
            <div
              className="flex items-center gap-1.5 py-1 text-[12px] text-tone-danger"
              style={{ paddingLeft: pad + 24 }}
            >
              <TriangleAlert size={11} /> {error}
            </div>
          )}
          {!loading && !error && children?.length === 0 && (
            <div className="py-1 text-[12px] text-zinc-500" style={{ paddingLeft: pad + 24 }}>
              No folders inside
            </div>
          )}
          {children?.map((c) => (
            <TreeRow
              key={c.path}
              node={c}
              depth={depth + 1}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FolderTree({
  roots,
  selected,
  onSelect,
}: {
  roots: FolderRoot[];
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  return (
    <div role="tree" aria-label="Your folders" data-testid="folder-tree" className="space-y-0.5">
      {roots.map((r, i) => (
        <TreeRow
          key={r.path}
          node={{ name: r.label, path: r.path, is_project: null }}
          depth={0}
          selected={selected}
          onSelect={onSelect}
          icon={r.kind}
          startOpen={i === 0}
        />
      ))}
    </div>
  );
}

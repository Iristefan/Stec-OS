"use client";

/**
 * FOLDERS (Stec OS): all the user's local folders, as a tree, in the centre
 * window.
 *
 * Left: a tree of every place files live (home first, then each drive), opened
 * one level at a time. Right: what is inside the picked folder (folders first,
 * then files with their sizes), a path bar to jump anywhere, and three things
 * to do with the folder: chat about it (it becomes a Project, or reuses the
 * one already there), open a terminal in it (Build), or make it a project.
 *
 * Reads only: nothing on this page writes to the disk. Every listing goes
 * through the daemon's /fs routes, which apply the same read policy as the
 * rest of the app.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  Eye,
  EyeOff,
  File,
  Folder,
  FolderPlus,
  GitBranch,
  MessageSquare,
  RefreshCw,
  SquareTerminal,
} from "lucide-react";
import { ApiError, get, post } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { Drive, FsEntry, FsListing, Project, TerminalInfo } from "@/lib/types";
import { ErrorNote, LoaderInline, OfflineHint } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { FolderTree, samePath } from "@/components/folders/FolderTree";
import { FOLDERS_PICK_KEY, buildRoots, folderName, formatSize } from "@/lib/folders";

function readPick(): string | null {
  try {
    return window.localStorage.getItem(FOLDERS_PICK_KEY);
  } catch {
    return null;
  }
}

function savePick(path: string) {
  try {
    window.localStorage.setItem(FOLDERS_PICK_KEY, path);
  } catch {
    /* private window: the page still works, it just won't remember */
  }
}

export default function FoldersPage() {
  const router = useRouter();
  const homeQ = useApi<{ home: string }>("/fs/home");
  const drivesQ = useApi<{ drives: Drive[] }>("/fs/drives");
  const projectsQ = useApi<{ projects: Project[] }>("/projects");
  const roots = useMemo(
    () => buildRoots(homeQ.data?.home ?? null, drivesQ.data?.drives ?? []),
    [homeQ.data, drivesQ.data],
  );

  const [selected, setSelected] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [listing, setListing] = useState<FsListing | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [listingBusy, setListingBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [action, setAction] = useState<null | "chat" | "terminal" | "project">(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [made, setMade] = useState<Project | null>(null);

  // Start on the folder picked last time, else home, else the first drive.
  useEffect(() => {
    if (selected || roots.length === 0) return;
    setSelected(readPick() || roots[0].path);
  }, [roots, selected]);

  useEffect(() => {
    if (selected) setTyped(selected);
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setListingBusy(true);
    setListError(null);
    get<FsListing>(
      `/fs/list?path=${encodeURIComponent(selected)}${showHidden ? "&show_hidden=true" : ""}`,
    )
      .then((d) => {
        if (!cancelled) setListing(d);
      })
      .catch((e) => {
        if (cancelled) return;
        setListing(null);
        setListError(e instanceof ApiError ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setListingBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, showHidden, reload]);

  function pick(path: string) {
    setSelected(path);
    setActionError(null);
    setMade(null);
    savePick(path);
  }

  const projects = useMemo(
    () => [...(projectsQ.data?.projects ?? []), ...(made ? [made] : [])],
    [projectsQ.data, made],
  );
  const existingProject = selected ? projects.find((p) => samePath(p.root, selected)) : undefined;

  async function ensureProject(): Promise<Project> {
    if (existingProject) return existingProject;
    const p = await post<Project>("/projects", { name: folderName(selected!), root: selected });
    setMade(p);
    return p;
  }

  async function run(kind: "chat" | "terminal" | "project") {
    if (!selected || action) return;
    setAction(kind);
    setActionError(null);
    try {
      if (kind === "terminal") {
        const t = await post<TerminalInfo>("/terminals", { cwd: selected });
        router.push(`/terminals?focus=${encodeURIComponent(t.id)}`);
        return;
      }
      const p = await ensureProject();
      if (kind === "chat") router.push(`/chat?project=${encodeURIComponent(p.id)}&new=1`);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setAction(null);
    }
  }

  const entries: FsEntry[] = listing?.entries ?? [];
  const folders = entries.filter((e) => e.is_dir);
  const files = entries.filter((e) => !e.is_dir);
  const offline = [homeQ, drivesQ].some(
    (q) => q.error instanceof ApiError && (q.error as ApiError).status === 0,
  );

  const ghost =
    "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border hairline px-2.5 text-[13px] text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="flex h-full min-h-0 flex-col gap-4" data-testid="folders-page">
      <PageHeader
        title="Folders"
        subtitle="All your local folders as one tree. Pick a folder to see what is inside, chat about it, or open a terminal there."
      />
      {offline && <OfflineHint />}

      <div className="grid min-h-[60vh] flex-1 grid-cols-1 gap-4 md:grid-cols-[minmax(240px,320px)_1fr]">
        {/* The tree */}
        <section
          aria-label="Folder tree"
          className="min-h-0 overflow-auto rounded-2xl border hairline bg-white/[0.02] p-2"
        >
          {roots.length === 0 && !offline ? (
            <div className="p-3 text-[13px] text-zinc-500">
              <LoaderInline label="Finding your folders…" />
            </div>
          ) : (
            <FolderTree roots={roots} selected={selected} onSelect={pick} />
          )}
        </section>

        {/* The picked folder */}
        <section
          aria-label="Folder contents"
          className="flex min-h-0 flex-col overflow-hidden rounded-2xl border hairline bg-white/[0.02]"
        >
          <form
            className="flex flex-wrap items-center gap-2 border-b hairline p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const p = typed.trim().replace(/[“”"]/g, "");
              if (p) pick(p);
            }}
          >
            <button
              type="button"
              className={ghost}
              disabled={!listing?.parent}
              onClick={() => listing?.parent && pick(listing.parent)}
              aria-label="Up one folder"
              title="Up one folder"
            >
              <ArrowUp size={14} />
            </button>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              aria-label="Folder path"
              placeholder="Type or paste a folder path"
              className="min-w-[200px] flex-1 rounded-lg border hairline bg-transparent px-2.5 py-1.5 text-[13px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-accent/50"
            />
            <button type="submit" className={ghost}>
              Go
            </button>
            <button
              type="button"
              className={ghost}
              onClick={() => setShowHidden((v) => !v)}
              aria-pressed={showHidden}
              title={showHidden ? "Hide hidden files" : "Show hidden files"}
            >
              {showHidden ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button
              type="button"
              className={ghost}
              onClick={() => setReload((n) => n + 1)}
              aria-label="Refresh"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          </form>

          {selected && (
            <div className="flex flex-wrap items-center gap-2 border-b hairline px-3 py-2.5">
              <div className="mr-auto min-w-0">
                <div className="truncate text-[15px] font-medium text-zinc-100">
                  {folderName(selected)}
                </div>
                <div className="text-[12px] text-zinc-500">
                  {listing
                    ? `${folders.length} folder${folders.length === 1 ? "" : "s"}, ${files.length} file${files.length === 1 ? "" : "s"}${listing.truncated ? " (showing the first 2000)" : ""}`
                    : " "}
                  {existingProject && (
                    <span data-testid="folders-project-note">
                      {" · "}Project: {existingProject.name}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                className={ghost}
                disabled={!!action || !!listError}
                onClick={() => void run("chat")}
              >
                <MessageSquare size={14} /> {action === "chat" ? "Opening…" : "Chat about this folder"}
              </button>
              <button
                type="button"
                className={ghost}
                disabled={!!action || !!listError}
                onClick={() => void run("terminal")}
              >
                <SquareTerminal size={14} />{" "}
                {action === "terminal" ? "Opening…" : "Open terminal here"}
              </button>
              {!existingProject && (
                <button
                  type="button"
                  className={ghost}
                  disabled={!!action || !!listError}
                  onClick={() => void run("project")}
                >
                  <FolderPlus size={14} /> {action === "project" ? "Making…" : "Make it a project"}
                </button>
              )}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto p-2">
            {actionError && (
              <div className="p-1">
                <ErrorNote>{actionError}</ErrorNote>
              </div>
            )}
            {listError && (
              <div className="p-1">
                <ErrorNote>{listError}</ErrorNote>
              </div>
            )}
            {listingBusy && !listing && (
              <div className="p-3 text-[13px] text-zinc-500">
                <LoaderInline label="Loading…" />
              </div>
            )}
            {listing && entries.length === 0 && !listError && (
              <div className="p-6 text-center text-[13px] text-zinc-500">This folder is empty.</div>
            )}
            {listing && entries.length > 0 && (
              <ul data-testid="folder-contents" className="divide-y divide-white/[0.04]">
                {folders.map((e) => (
                  <li key={e.path}>
                    <button
                      type="button"
                      onClick={() => pick(e.path)}
                      title={e.path}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] text-zinc-200 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
                    >
                      <Folder size={15} className="shrink-0 text-accent-soft/80" />
                      <span className="truncate">{e.name}</span>
                      {e.is_project && (
                        <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] text-zinc-500">
                          {e.is_project === "git" && <GitBranch size={11} />}
                          {e.is_project}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
                {files.map((e) => (
                  <li
                    key={e.path}
                    title={e.path}
                    className="flex items-center gap-2.5 px-2 py-1.5 text-[13px] text-zinc-400"
                  >
                    <File size={15} className="shrink-0 text-zinc-600" />
                    <span className="truncate">{e.name}</span>
                    <span className="ml-auto shrink-0 tabular-nums text-[12px] text-zinc-600">
                      {formatSize(e.size)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

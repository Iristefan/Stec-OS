/**
 * Stec OS — the Folders page: every local folder as one tree in the centre
 * window, the picked folder's contents beside it, and three actions on it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const push = vi.fn();
const posts: { path: string; body: unknown }[] = [];
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/folders",
  useSearchParams: () => new URLSearchParams(),
}));

const LISTINGS: Record<string, unknown> = {
  "/home/stefan": {
    path: "/home/stefan",
    parent: "/home",
    entries: [
      { name: "Projects", path: "/home/stefan/Projects", is_dir: true, is_project: null, size: null },
      { name: "notes.md", path: "/home/stefan/notes.md", is_dir: false, is_project: null, size: 2048 },
    ],
  },
  "/home/stefan/Projects": {
    path: "/home/stefan/Projects",
    parent: "/home/stefan",
    entries: [
      { name: "app", path: "/home/stefan/Projects/app", is_dir: true, is_project: "git", size: null },
    ],
  },
};

vi.mock("@/lib/api", () => {
  class ApiError extends Error {
    status = 500;
  }
  return {
    ApiError,
    get: async (path: string) => {
      if (path.startsWith("/fs/home")) return { home: "/home/stefan" };
      if (path.startsWith("/fs/drives")) return { drives: [{ path: "/", label: "/" }] };
      if (path.startsWith("/projects")) return { projects: [] };
      if (path.startsWith("/fs/list")) {
        const p = decodeURIComponent(new URL(path, "http://x").searchParams.get("path") ?? "");
        const l = LISTINGS[p] as { entries: { is_dir: boolean }[] } | undefined;
        if (!l) return { path: p, parent: null, entries: [] };
        if (path.includes("dirs_only=true")) return { ...l, entries: l.entries.filter((e) => e.is_dir) };
        return l;
      }
      return {};
    },
    post: async (path: string, body: unknown) => {
      posts.push({ path, body });
      if (path === "/terminals") return { id: "t1" };
      if (path === "/projects") return { id: "p1", name: "Projects", root: "/home/stefan/Projects" };
      return {};
    },
  };
});

import FoldersPage from "@/app/folders/page";
import { buildRoots, folderName, formatSize } from "@/lib/folders";
import { surfaceFor, SIDEBAR_HREFS } from "@/lib/surfaces";

beforeEach(() => {
  push.mockReset();
  posts.length = 0;
  window.localStorage.clear();
});
afterEach(() => cleanup());

describe("folders helpers", () => {
  it("formats sizes in words", () => {
    expect(formatSize(null)).toBe("");
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(2048)).toBe("2.0 KB");
    expect(formatSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
  it("names a folder from its path", () => {
    expect(folderName("C:\\Users\\Stefan\\Docs\\")).toBe("Docs");
    expect(folderName("/home/stefan")).toBe("stefan");
  });
  it("puts home first and drops a drive that is the same place", () => {
    const roots = buildRoots("C:\\Users\\S", [
      { path: "C:\\", label: "C:\\" },
      { path: "D:\\", label: "Data" },
      { path: "c:/users/s/", label: "" },
    ]);
    expect(roots.map((r) => r.label)).toEqual(["Home", "C:\\", "Data (D:\\)"]);
  });
  it("is in the sidebar and in Ctrl K", () => {
    expect(SIDEBAR_HREFS).toContain("/folders");
    expect(surfaceFor("/folders")?.label).toBe("Folders");
  });
});

describe("the folders page", () => {
  it("shows the tree and the home folder's contents", async () => {
    render(<FoldersPage />);
    const tree = await screen.findByTestId("folder-tree");
    await within(tree).findByText("Home");
    const contents = await screen.findByTestId("folder-contents");
    expect(within(contents).getByText("Projects")).toBeTruthy();
    expect(within(contents).getByText("notes.md")).toBeTruthy();
    expect(within(contents).getByText("2.0 KB")).toBeTruthy();
  });

  it("opens a subfolder and makes it a project to chat about", async () => {
    render(<FoldersPage />);
    const contents = await screen.findByTestId("folder-contents");
    fireEvent.click(within(contents).getByText("Projects"));
    await waitFor(() => expect(screen.getByText("git")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /chat about this folder/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/chat?project=p1&new=1"));
    expect(posts[0]).toEqual({
      path: "/projects",
      body: { name: "Projects", root: "/home/stefan/Projects" },
    });
  });

  it("opens a terminal in the picked folder", async () => {
    render(<FoldersPage />);
    await screen.findByTestId("folder-contents");
    fireEvent.click(screen.getByRole("button", { name: /open terminal here/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/terminals?focus=t1"));
    expect(posts[0]).toEqual({ path: "/terminals", body: { cwd: "/home/stefan" } });
  });
});

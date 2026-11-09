# STEC OS — Agent Operating Manual

You are working on STEC OS: a local-first AI operating system. One Python
daemon (FastAPI), one Next.js dashboard, one Electron desktop wrapper. The user
runs the PACKAGED desktop app daily — treat every change as production.

## The three processes

| Process | What | Port | Source |
|---|---|---|---|
| Daemon | FastAPI, all state + agents + tools | 127.0.0.1:8787 | `src/iron_jarvis/` |
| Dashboard | Next.js 15 (44 routes), arc-reactor-cyan aesthetic | 127.0.0.1:8788 | `dashboard/` |
| Desktop | Electron: spawns both, tray, updates, Spotlight | — | `desktop/main.js` |

Packaged layout: PyInstaller-frozen daemon (`packaging/ironjarvis.spec`) +
Next standalone run by Electron's node + electron-builder NSIS installer.
State home: dev = `~/.ironjarvis` unless `--root`; packaged =
`%APPDATA%/STEC OS/.ironjarvis` (config.toml, ironjarvis.db (SQLite),
secrets/, skills/, terminals.json, backups/). The desktop app's per-install
bearer token: `%APPDATA%/STEC OS/token.txt` — every daemon request needs
`Authorization: Bearer <it>`.

## Commands

```bash
# THE FULL SUITES RUN ON GITHUB, NEVER ON THIS PC (the user's decision,
# 2026-10-31). This PC is the user's daily driver: one -n auto run is ~12
# workers x 600-900 MB (~9 GB), and two sessions doing it at once filled the
# RAM. Locally, run ONLY the test files your change touches plus the files
# that pin the same area, with at most 4 workers:
uv run pytest -q --no-header -n 4 tests/test_<area>*.py
cd dashboard && pnpm vitest run __tests__/<area>   # + npx tsc --noEmit
# The full gate, before you push to master: push your BRANCH and let GitHub run
# everything (pushing a branch triggers nothing by itself):
git push origin <branch>
gh workflow run tests.yml --ref <branch>      # the whole suite, ~15 min, no installer
gh run list --workflow tests.yml --branch <branch> --limit 1   # then read its result
# (a workflow change: `gh workflow run release.yml --ref <branch> -f dry_run=true`)
# The release gate on master runs the whole suite again and publishes nothing
# unless it is green. A failure GitHub shows is reproduced LOCALLY by running
# THAT one file (with PYTHONDONTWRITEBYTECODE unset when it smells of stale
# bytecode — CI writes .pyc files, this PC does not).
# Dashboard build (must show "Generating static pages (44/44)")
cd dashboard && pnpm build
# Syntax-check desktop changes
cd desktop && node --check main.js
# Dev run
uv run ironjarvis serve            # daemon on 8787
cd dashboard && pnpm dev           # dashboard
```

## Release flow (how the user receives your work)

**EVERY PUSH GETS A VERSION BUMP. No exceptions, and the exceptions are the
point.** Not "every user-visible change", not "every product change" — every
change you push. A test-only fix, a comment, a doc edit, a CI tweak: bump it.

This is a standing instruction from the user, given after v1.214.0 shipped and
two follow-up commits went to master WITHOUT a bump. The reasoning that
produced those commits sounded good — "no product code changed, so a bump would
push an identical installer to the daily driver" — and it is exactly the
reasoning this rule exists to overrule. Do not re-derive it. The version is how
the user knows what is on master and what they are running; a commit with no
version is a change they cannot name, and deciding on their behalf which of
their changes deserve a number is not your call to make.

So: if you are about to `git push`, you have already edited the three files
below. If you find yourself writing a commit message that explains why this one
does not need a bump, stop and bump it.

1. Bump the version in **six locations, with ANCHORED edits — run
   `uv run python scripts/bump_version.py OLD NEW`** (never blanket
   search/replace — it once rewrote a dependency pin): `pyproject.toml`
   (`version = `), `src/iron_jarvis/__init__.py` (`__version__`),
   `desktop/package.json` (`"version"`). Plus `extensions/chrome/manifest.json` and
   `extensions/chrome/package.json` (`"version"`), `docs/HANDBOOK.md` on its
   `Current as of vX` line ONLY, and `uv lock` regenerated. The script refuses
   unless each anchor matches exactly once. THIS IS NOT OPTIONAL: v1.257.0 and
   v1.258.0 used ad-hoc blanket replaces that relabelled five lines of shipped
   Handbook history (fixed in v1.258.1).
2. Commit + push to master. **IF THE COMMIT TOUCHES `.github/workflows/*`, PUSH
   THE TAG YOURSELF** (`git tag vX.Y.Z <sha> && git push origin vX.Y.Z`) — CI's
   `GITHUB_TOKEN` is refused when it pushes a tag whose commit changes a
   workflow file ("refusing to allow a GitHub App to create or update
   workflow … without `workflows` permission"; no `permissions:` key grants
   it). v1.260.0's master-push Release died there after a green suite, and the
   tag push from the user's own credentials is what shipped v1.261.0 (a tag
   push triggers Release on its own — cancel the master-push run first or two
   runs publish the same version). CI (`.github/workflows/release.yml`) detects the
   bump, RUNS THE OFFLINE SUITE AS A GATE and builds the installer AT THE SAME
   TIME (v1.370.3; it was ~78 min in series, ~15 now): `plan` decides once;
   `suite` (dashboard + add-on + desktop checks), `python` (six shards split by
   test FILE by `scripts/ci_shards.py`, balanced on
   `scripts/ci_test_durations.json`; shard 1 checks pytest collects no file the
   plan missed) and `windows-installer` (frozen daemon, `/health` smoke,
   electron-builder `--publish never`, the files renamed to the dashed names
   `latest.yml` carries and its sha512 checked, kept as a private artifact) run
   in parallel; ONLY `publish` (`needs` all of them, implicit success(),
   `dry_run == 'false'`, the one job with `contents: write`) makes anything
   public: it re-checks the release (an already-public version is never
   overwritten; one publish per version via job `concurrency`), pre-creates the
   tag + DRAFT release, uploads `STEC-OS-Setup-X.Y.Z.exe` + blockmap +
   `latest.yml`, publishes, then writes the `updates` manifest. Try a workflow
   change on a branch with `gh workflow run release.yml --ref <branch> -f
   dry_run=true` (builds and tests everything, publishes nothing). Regenerate
   the timings after big suite changes (the script's docstring says how). A
   push with no version bump skips the gate AND the installer entirely — which
   is why an unbumped push is not a cheap shortcut but a change that never
   reaches the user at all, and why the rule above is absolute.
   **The gate is new in v1.177.0 and this file used to claim it already
   existed.** It did not: `Tests` and `Release` are separate workflows and ran
   CONCURRENTLY, so on v1.176.0 Release published a green installer in 8 minutes
   and Tests went red 16 minutes later — a red suite shipped to the user's
   daily driver, which auto-downloads. If you ever split these again, the
   installer must still not be reachable without a green suite.
3. The desktop app auto-downloads (checks at boot + every 30 min) and installs
   only when the user clicks Restart-to-update (tray item / notification /
   Updates page). `latest.yml` missing assets = release still uploading.
4. **State the current (or new target) app version in EVERY response** so the
   user always knows which version to expect when they pull an update. The
   SessionStart hook (`.claude/session-start.sh`) injects the live version +
   repo state at session start — trust it over stale docs.

## Hard rules (history)

The full list of hard rules and the per-version history (every lesson learned
the expensive way, v1.144.0 onward) lives in `docs/CLAUDE-HISTORY.md`. It is
NOT auto-loaded because it is over 1 MB. Before changing an area, grep it for
the area or version (`grep -n "v1.300.0\|claude_native" docs/CLAUDE-HISTORY.md | head`)
and read only the matching lines in small chunks (Read limit <= 100).

## Map (where things live)

- `src/iron_jarvis/daemon/` — `app.py` is factory + glue only (platform build,
  lifespan boot-rehydration + background loops, middleware, the shared `d` deps
  object); the ~240 endpoint handlers live in `routes/<domain>.py` (24 modules;
  search by route string ACROSS routes/), request models in `schemas.py`.
  Handlers reach shared state via `d.*`; tests monkeypatch `_MAX_UPLOAD_BYTES`
  and `_graceful_stop` on the app module, so routes access those via
  `_app.<name>` at call time — keep that pattern. Logging: two logger
  namespaces (`ironjarvis`, `iron_jarvis`) are aliased in
  `core/logging.configure_logging` — never add a third; the noise filters
  and the 500 envelope's `err_` id live in `core/logging.py` and
  `daemon/auth.unhandled_error_response`.
- `agents/` — orchestrator (sessions/reviews/continue), runtime (the
  perceive→act loop), dynamic agents. `providers/` — manager (per-provider
  factories), router (routing/failover), adapters/. `terminals/` — manager
  (+ restart-survival snapshot, pane NAME + `agent_cli`, and the pane's
  `IRONJARVIS_*` identity merged into the shell's own env at spawn), session
  (scrollback, `activity()`), `agent_state.py` (v1.217.0: the pure
  tail→`working`/`blocked`/`idle`/`done`/`unknown` classifier), ai_clis (Launch
  detection), shells, backend (ConPTY/pipe/Fake). `tools/pane_tools.py` is the
  agent-facing side (list/read/spawn/send/wait; send+spawn on the deny floor).
- `repl/` — the session NAMESPACE (v1.159.0). `worker.py` is the child:
  stdlib-only (it is spawned from a frozen binary), newline-JSON on
  stdin/stdout, one persistent globals dict, output capped and truncation
  reported. `session.py` is the parent: one child per session, every
  blocking step through `asyncio.to_thread`, a reader thread so a deadline
  can actually be honoured, kill-on-timeout, and an honest `restarted` flag
  so a model is never told its variables survived when they did not.
  `tools/repl_tool.py` is the tool. Do not add a `get()`-first path: the
  registry creates a namespace on demand through `execute`, and a
  `get()`-first caller fails on the FIRST call of every session. Namespaces
  are keyed by `namespace_key(session_id, workspace)` — one per (session,
  FOLDER) pair, because chat runs every turn as session id `"chat"` while its
  workspace follows the grounded project, so keying on the id alone pinned the
  write root to whichever project opened first. The registry's PUBLIC surface
  (`get`/`dispose`/`sweep`/`session_ids`/`in`) still speaks session ids and
  covers every folder that session used; only the internal dict key is
  composite.
- `context/` — `budget.plan_history`: the per-turn CHAT history planner (pure,
  offline, deterministic recap), consumed by both chat lanes.
  `agent_window.plan_agent_transcript`: the same job for an agent RUN, and a
  separate module because it protects the oldest message (the task) instead of
  the newest, and because tool pairs are indivisible. Shares `budget.py`'s
  token estimator and reserves so both lanes count tokens identically.
  `compaction.py` is the layer above both: thresholds, the structured prompt,
  and the verification pass that makes a model-written summary admissible.
  `store.py` caches one summary per covered prefix, CONTENT-ADDRESSED (a chat
  turn carries no thread id, an unsaved thread has none, and a forked thread
  should inherit its parent's summary for free) — and it is registered in
  `core.db._LATE_MODEL_MODULES`, without which its lazily-created table lands
  on fresh test DBs and on no real install (the v1.151.2 lesson).
- `guide/` — THE IRON JARVIS GUIDE (v1.224.0; v1.223.0 shipped it as a chat
  persona, which the user rejected — it belongs in the AGENTS module). A
  built-in agent, `AgentType.GUIDE` in `agents/types.py`, in the roster
  beside the other builtins. BASE KNOWLEDGE: `agents/runtime` injects
  `guide.base_knowledge` (the Handbook's overview + this install's live
  version facts) into every Guide session. TOOLS (`guide/tools.py`, all
  read-only, all `allow`): `guide_search`/`guide_read` over `corpus.py` — the
  bundled docs (`BUNDLED_DOCS`, shipped into `_MEIPASS/ijdocs` by the .spec,
  which IMPORTS that list so the bundle cannot drift) plus live catalogs from
  the running daemon (version, providers, tools, skills, personas, agent
  types, every API route with its docstring) — and `app_search`/`app_status`
  over the user's OWN things in this install (projects, workflows,
  schedules, reflex rules, goals, skills, agents, threads, sessions, memory
  bases, custom tools), each hit with the dashboard path that opens it, and
  an unreadable store NAMED rather than reported empty. Retrieval is BM25 +
  phrase bonus + a user-facing doc prior — deterministic, no embedder. THE
  ROUND TABLE HAS NO TOOLS (`PANEL_NO_TOOLS`), so for a Talk with the Guide
  `threads._speak_local` runs the retrieval + app_search itself and appends
  the material AFTER the no-tools rule (`_guide_material`); Give-work and a
  `guide` session get the real tools. `routes/guide.py` is the inspection
  surface (`/guide/status|search|ground`); the Help page's "Ask the Guide"
  box lands in `/agents?talk=guide&ask=…`. Chat can also arm
  `guide_search`/`app_search`/`app_status` (autoselect, narrow vocabulary).
  The Guide knows what the DOCS know: when a surface ships, the Handbook is
  part of the change set, or the Guide answers "not covered" about a feature
  that exists (the doctor check `guide_docs` catches a missing FILE, not a
  stale one).
- `profile/` — the user profile (ONE row): `models` (record), `store`
  (read-never-writes, partial save), `presets` (vocabularies; unknown key =
  free text), `language` (pure script-level leakage detector), `block`
  (the one renderer, bounded + never raises). `personas/builtins.py` holds the
  built-in catalog (importable — `app.py` still exposes it as `d._PERSONAS`).
- `skills/` — recursive discovery incl. `~/.claude/skills`, `~/.claude/plugins`,
  `~/.codex/skills` (`framework.py::external_skill_roots`); registry
  repopulates IN PLACE; skills inject into prompts (provider-agnostic), the
  agent-facing tools are just search/load. `workflows/` — store + engine
  (note: `POST /workflows/run` spawns the run in the background and returns the
  record immediately; it does NOT block until steps finish). `ltm/`,
  `memory/`, `comm/`, `computeruse/`, `sandbox/`, `scheduling/`.
- `documents/` — `pdf_classify.py` is the per-PAGE scan router (v1.176.0,
  wraps the MIT `pdf-inspector` Rust extension). It answers "which pages of
  this PDF are scans", which `looks_scanned_pdf` structurally cannot: that
  asks ONE question of the whole file, so a native-text return with a scanned
  K-1 stapled in at page 12 reads as fully readable and the scan is silently
  invisible. THE ASYMMETRY IS THE SAFETY ARGUMENT and must survive any edit:
  `needs_ocr` ORs the classifier with the old heuristic and never ANDs, an
  empty plan falls back to harvesting rather than to harvesting nothing, and
  every entry point returns `None` (never raises) so an absent or broken
  extension degrades to exactly the v1.174.0 behaviour. A classifier may make
  the app read MORE of a client's document, never less. It is a NATIVE wheel:
  `packaging/ironjarvis.spec` entry + a RECOMMENDED `doctor` check, because a
  packaged build that dropped it would degrade silently forever (the pikepdf
  lesson). Cache version bumped to 2 — v1 records covered the first N pages
  and serving one for a mixed file would freeze that blindness in permanently.
  Also: readers (extract_text: pdf/docx/xlsx/pptx/csv/text/images),
  writers (markdown-AWARE rich creation: headings/lists/tables/code become
  real structure in docx/pdf/pptx/html; xlsx multi-sheet dict + formulas),
  markdown.py (the shared block parser), tools (read/write/extract_pdf/
  convert_document). `tools/images.py` — view_image (vision via the router),
  image_convert/resize/info (Pillow). `tools/pixio.py` — generative media.
- **A Store program is never asked into the pane job, and starts one at a
  time; a frozen loop says where it is stuck** (v1.407.1, a USER BUG on
  v1.407.0: Build stuck at "Attaching to sessions…", then "STEC OS isn't
  responding", across restarts). The panes run the Store pwsh
  (`%LOCALAPPDATA%\Microsoft\WindowsApps\pwsh.EXE`, an App Execution Alias,
  reparse tag 0x8000001B). v1.407.0 stopped the BOOT waiting on stuck pane
  restores, but ~90 s later NOTHING answered (even the 25 s audit polls) until
  the desktop watchdog killed it: a stuck process creation is not contained
  by a bounded wait. THE REVIEW CORRECTED THE FIRST CUT: starting the real
  `C:\Program Files\WindowsApps\<pkg>\pwsh.exe` goes through the SAME package
  activation as the alias (AppModel 8001/219/211/201, same identity); every
  hang the boot watch caught was in `ConPtyBackend.start`'s FIRST `_spawn`,
  the one with `PROC_THREAD_ATTRIBUTE_JOB_LIST`, which Windows always refuses
  for a packaged program (AppModel 212/208, 0x80070005 "Cannot add process to
  Desktop AppX container") before the no-job retry — two activations per pane,
  two panes at once, and these panes have had NO job since v1.333.0 anyway.
  Now `start` resolves argv once (`terminals/app_alias.direct_argv`: reads the
  alias's reparse data, desktop app type "0" only, target must be an existing
  absolute `.exe`; the saved argv keeps the alias), never creates a job when
  `is_packaged(argv[0])` (an alias, or a path under `\WindowsApps\`), and
  holds `_PACKAGED_SPAWN` (one packaged spawn at a time); pywinpty and pipe
  backends get `direct_argv` too. `daemon/boot_watch.LoopWatch` (armed in the
  lifespan beside the v1.245.0 loop-lag task, which calls `beat()` each
  second; stopped at shutdown) reports from its own thread at 20/45/75 s of
  a frozen loop where the loop thread and busy threads wait — the loop-lag
  line is written by the loop AFTER a stall ends, so a stall that never ended
  left no trace. A NEXT FREEZE NAMES ITS PLACE: read daemon.log for "event
  loop frozen for". OPEN: the Windows-side cause is still not reproduced on
  demand; other spawns of Store programs (`core/procs`) keep their job
  attempt. Pins: `tests/test_app_alias_v14071.py` (15 mutations, 14 red; the
  survivor — handing a packaged spawn `self._job` — is equivalent, the job is
  `None` there), including real Store-pwsh and cmd ConPTY spawns.
  v1.409.1 (a USER BUG, the SAME freeze on the first start after the v1.409.0
  update): both panes were still not started at the 8 s mark, ~1 s after the
  dashboard opened every request stopped, and the daemon wrote NOTHING for
  94 s, LoopWatch included. Windows' AppModel log shows no pwsh activation in
  that window, so both CreateProcessW calls never reached activation. A scratch
  daemon whose pane spawns never return (ctypes releases the GIL) stayed fully
  responsive, so a stuck spawn ALONE does not freeze it: the silence means the
  interpreter lock, a log handler's lock, or every request worker was taken.
  THE CAUSE IS NOT FOUND. LoopWatch now (a) arms `faulthandler.
  dump_traceback_later(TRACE_AFTER_S=30, repeat=True)` into
  `<userData>/logs/daemon-freeze.txt` (`trace_path_for`; never inside the
  state home), re-armed from its own thread every TRACE_REARM_S=10 while
  Python runs — the C watchdog needs neither lock; ONLY a frozen build or
  `IRONJARVIS_FREEZE_TRACE=1` arms it (the process has one such dump), and
  `stop()` cancels it; (b) writes its reports to that file BEFORE the log;
  (c) reports at 20/45/75 s when anyio's default limiter has every token
  borrowed (`pool_full`: loop alive, /health — a sync route — waiting).
  READ `logs/daemon-freeze.txt` after the next "isn't responding"; it names
  the place. Pins: `tests/test_freeze_trace_v14091.py` (a real held GIL via
  `PyDLL("kernel32").Sleep` in a child; 7 mutations, all red).
  v1.419.1 (a USER BUG: Build › Terminal said "Reopening 3 terminals…" for
  4+ hours; `GET /terminals` held `restoring: [3 ids]` and the three Store
  pwsh restores never returned). NOTHING WAITS ON A RESTORE FOREVER:
  `manager.RESTORE_GIVE_UP_S` (60 s from the boot's restore start) GIVES UP a
  restore still starting — decided when the state is READ
  (`_settle_restores` in `restoring_ids`/`restore_failed`/
  `snapshot_if_changed`), never by a timer thread (a stuck process creation
  can hold the loader lock, and `Thread.start` then hangs too). A given-up
  pane moves to `_restore_failed`, its `_reserved` slot is released (a late
  `_finish_late_restore` never releases it twice), its snapshot entry is
  KEPT (`_index_text` writes both tables) so the next start tries again, and
  a shell that starts later still registers and clears the note. `GET
  /terminals` adds `restore_failed: {count, ids, reason}` only when non-empty;
  the Build page (`lib/restoreFailed`) drops "Reopening…", says "N terminals
  from before the restart couldn't be reopened: their shell didn't start. Open
  a new terminal, or restart STEC OS to try again." in the stage (beside
  the normal New terminal door) and the rail, keeps their saved keys, and
  keeps re-reading while one could still open. `_PACKAGED_SPAWN` is acquired
  with `PACKAGED_SPAWN_WAIT_S` (15 s): past it a Store shell raises
  `ShellStartStuck` (a RuntimeError, never `ConPtyUnavailable`, so ConPTY is
  not marked broken) — `POST /terminals` and `/terminals/launch` answer 503
  with its sentence; a RESTORE refused that way is given up with its entry
  kept. `_conpty_api` builds under `_CONPTY_API_LOCK` (double-checked) and
  `rehydrate` calls `warm_conpty()` on the boot thread before any restore
  thread starts (the 15:36 freeze: two restore threads in `ctypes.WinDLL` of
  conpty.dll while the boot thread sat in `Thread.start`). THE WINDOWS-SIDE
  CAUSE IS STILL NOT KNOWN. Pins: `tests/test_restore_give_up_v14181.py`
  (time through `TerminalManager._now`, never a sleep; 14 mutations, all
  red), `dashboard/__tests__/build-restore-failed-v14181.test.tsx` (7
  mutations, all red); moved on purpose: `pane-keys-v1280`,
  `terminal-host-v1243` (the kept set gained the given-up ids).
  REVIEW (2 defects, each red first): (1) `kill_all` sets `_closing`, lets go
  of `_lock`, then reads the tables for the shutdown snapshot; a late shell
  starting in that gap made `_finish_late_restore` POP the pane (reopening,
  given up, or refused behind a stuck shell) before closing it, so the
  shutdown snapshot lost it. Once `_closing`, the finisher now only closes a
  started shell and leaves both tables as they are. (2) panes given up at
  different moments (refused at 15 s, the stuck one at the minute) were saved
  and reported in give-up order; `_restore_rank` (snapshot order, set by
  `rehydrate`) sorts the pending entries and `restore_failed.ids`. Pins:
  `tests/test_restore_give_up_review_v14181.py` (drives the REAL `kill_all`;
  checks the file was written by the shutdown, never read off the boot's own
  snapshot); moved on purpose: `test_boot_pane_restore_bound_v1406::
  test_a_pane_that_starts_after_shutdown_began_is_closed_not_registered`
  (waits for the finisher, not for `restoring` to empty). OPEN: a pane that
  opens after the give-up is registered without a cap check (at most the
  number given up past the cap).

- **Build (`app/terminals/page.tsx`)**: since v1.409.0 a "</> Code | Terminal"
  switch (Code = `components/buildCode/*`, see the v1.409.0 hard rule). The
  Terminal view below was the TERMINALS only page (v1.407.0
  part 1; it had two views from v1.369.0, and the free-form react-rnd
  CANVAS of v1.218.0 is long gone — a saved `ij.build.shape` of "harness"
  or "canvas" now just opens Terminals): `components/terminal/PaneRail.tsx`
  (every live pane in a column with its state, one focused beside it);
  `?focus=<id>` opens a terminal (`BUILD_TERMINAL_EVENT` for a same-page
  link), and an old `?session=` / `?night=` is `router.replace`d to the Code
  view (`lib/buildLinks.codeHrefForOldBuildSearch`). **The coding sessions**
  (`components/harness/*`, IjHarnessView: folder groups + a Terminals group,
  the conversation built from the chat page's own pieces, the right panes)
  are the CHAT page's **Code** view: `components/chat/ChatCodeSurface.tsx`
  (the Chat | Code switch, default export of `app/chat/page.tsx`) +
  `components/harness/CodeView.tsx` (lends the terminal list / terminal tab
  Build used to lend); address `/chat?view=code&session=<id>` /
  `&night=<date>` (`lib/chatSurface`, `lib/buildLinks.buildSessionHref`);
  same-page links go through `BUILD_SESSION_EVENT` / `BUILD_NIGHT_EVENT` /
  `CHAT_VIEW_EVENT` because Next keeps page state on a query-only change.
  In the rail every pane still RENDERS — same box, all
  mounted, `visibility` toggled — because the v1.190.0 rule stands: a
  terminal whose holder has no size wraps its replay into a buffer no later
  fit can re-wrap, so a hidden pane must keep a real box. Never
  `display:none`, never an unmount. The rail needs a fallback focus
  (`activeId`). The TerminalPane component itself CAN unmount (leaving Build,
  Chat | Code on the chat page) — since v1.243.0 its xterm and socket live in
  `components/terminal/paneHost.ts` and are parked, not destroyed (see the
  hard rule).
- `dashboard/app/<route>/page.tsx` per page; shared in `dashboard/components/`
  (`ui.tsx` primitives, `AppSidebar.tsx` the persistent sidebar +
  `Sidebar.tsx` its phone drawer (v1.321.0; Simple/Advanced is retired);
  the composer's `components/chat/ModelMenu` is the one model selector —
  `ModelSwitcher.tsx` was deleted in v1.440.0) and `dashboard/lib/` (`api.ts` fetch+auth,
  `useEvents.ts` one socket per window (EventsProvider), `types.ts`). Canvas editors: `components/workflow/`
  (agents.ts lives HERE, not lib/).
- `desktop/main.js` — supervisor (auto-restart children), tray, global
  hotkeys (Ctrl+Shift+J window, Ctrl+Shift+Space Spotlight), updater +
  update IPC, native clipboard IPC, media permissions. `preload.js` exposes
  `window.ironjarvis` (token, clipboard, update bridge).

## Verifying against the LIVE app (the user's running install)

```bash
tok=$(cat "C:/Users/VR/AppData/Roaming/STEC OS/token.txt")
curl -s -H "Authorization: Bearer $tok" http://127.0.0.1:8787/health
# Event forensics (provider failures etc.):
#   SQLite: %APPDATA%/STEC OS/.ironjarvis/ironjarvis.db, table eventrecord
```
Live-probing beats speculation — most "it's broken" reports this project has
seen were diagnosed in one curl (wrong version running, retired model id,
rate-limited provider, mock default).

## Direction (the product thesis)

Daily driver for creative + coding + office work, with high
interconnectedness. The known missing link is a **context spine**: a
first-class Project/workspace concept that chat, terminals, workflows, and
documents all tag into, so every agent call carries "what the user is working
on". Prefer features that CONNECT existing surfaces over new standalone
surfaces. Never trade trust for magic: honest errors beat fabricated output,
suggest-don't-act for anything autonomous, everything reviewable.

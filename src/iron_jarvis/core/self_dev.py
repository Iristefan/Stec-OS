"""Self-development support — locate STEC OS's OWN source repository.

The goal: a STEC OS agent (the Maintainer) can read, edit, test, and fix
the STEC OS source tree itself — safely, on a git worktree, with the same
review/approve gate (never auto-merge). This module answers "where is my own
repo?" so the orchestrator can root a self-dev session's worktree there.

It is OFF unless ``config.self_dev_enabled`` is True. When running from an
installed wheel (no ``.git``), auto-detection returns ``None`` and the user must
point ``config.self_dev_root`` at a checkout.
"""

from __future__ import annotations

from pathlib import Path


def _is_iron_jarvis_repo(p: Path) -> bool:
    """True if *p* is a git checkout of the STEC OS project itself."""
    if not (p / ".git").exists():
        return False
    pyproject = p / "pyproject.toml"
    if not pyproject.is_file():
        return False
    try:
        text = pyproject.read_text(encoding="utf-8")
    except Exception:  # pragma: no cover - defensive
        return False
    return "iron-jarvis" in text or "iron_jarvis" in text


def iron_jarvis_repo_root(config: object | None = None) -> Path | None:
    """Return the STEC OS git repo root, or ``None`` if it can't be found.

    Resolution order:
    1. ``config.self_dev_root`` (an explicit override) — used only if it is a
       real STEC OS git checkout (held to the SAME identity check as
       auto-detection, so a stray ``.git`` dir can't redirect the Maintainer).
    2. Walk up from this module's location looking for the STEC OS repo.
    """
    override = getattr(config, "self_dev_root", None) if config is not None else None
    if override:
        p = Path(override).expanduser().resolve()
        return p if _is_iron_jarvis_repo(p) else None

    here = Path(__file__).resolve()
    for parent in (here, *here.parents):
        if _is_iron_jarvis_repo(parent):
            return parent
    return None


def self_dev_status(config: object) -> dict:
    """A small status descriptor for the daemon/CLI ``self-dev`` surface."""
    enabled = bool(getattr(config, "self_dev_enabled", False))
    root = iron_jarvis_repo_root(config)
    return {
        "enabled": enabled,
        "repo_root": str(root) if root is not None else None,
        "available": enabled and root is not None,
        "reason": (
            "self-dev disabled (set self_dev_enabled = true)"
            if not enabled
            else (
                "STEC OS git repo not found (set self_dev_root)"
                if root is None
                else "ready"
            )
        ),
    }

"use client";

/**
 * v1.443.0 (Stec OS step 4): voice commands, on every page.
 *
 * Ctrl+Shift+V starts listening (press it again, or Escape, to cancel). The
 * first finished sentence is parsed by `lib/voiceCommands`, acted on, and the
 * reply is spoken aloud and shown in a small pill at the bottom of the window.
 *
 * Audio goes through `useDictation`, the same engine the chat mic uses: Web
 * Speech in a real Chrome/Edge, the daemon's /voice/transcribe in the desktop
 * app (Electron has no built-in speech service).
 *
 * Inside a text field Ctrl+Shift+V keeps its usual meaning (paste as plain
 * text); the shortcut only listens when focus is elsewhere. Any page can also
 * start it with `window.dispatchEvent(new Event(VOICE_COMMAND_EVENT))`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDictation } from "@/lib/useDictation";
import { parseVoiceCommand } from "@/lib/voiceCommands";

export const VOICE_COMMAND_EVENT = "ij:voice-command";
const LISTEN_TIMEOUT_MS = 12_000;
const PILL_LINGER_MS = 4_000;

/** True when a key press belongs to a text field (so we leave it alone). */
export function isEditableTarget(el: EventTarget | null): boolean {
  if (!el || typeof (el as HTMLElement).tagName !== "string") return false;
  const node = el as HTMLElement;
  const tag = node.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (node.isContentEditable) return true;
  // xterm's hidden textarea sits inside .xterm; covered by the textarea case.
  return false;
}

/** Ctrl+Shift+V (Cmd+Shift+V on macOS), no Alt. */
export function isVoiceHotkey(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">): boolean {
  return (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && (e.key === "V" || e.key === "v");
}

function say(text: string) {
  try {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!synth || !text) return;
    synth.cancel();
    synth.speak(new SpeechSynthesisUtterance(text));
  } catch {
    /* no voice output on this machine: the pill still shows the reply */
  }
}

type Phase = "idle" | "listening" | "done";

export function VoiceCommandListener() {
  const router = useRouter();
  const dictation = useDictation();
  const [phase, setPhase] = useState<Phase>("idle");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const active = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const finish = useCallback(
    (text: string, sentence: string) => {
      active.current = false;
      clearTimer();
      dictation.stop();
      setHeard(sentence);
      setReply(text);
      setPhase("done");
      say(text);
      timer.current = setTimeout(() => setPhase("idle"), PILL_LINGER_MS);
    },
    [dictation],
  );

  const cancel = useCallback(() => {
    if (!active.current) return;
    active.current = false;
    clearTimer();
    dictation.stop();
    setPhase("idle");
  }, [dictation]);

  const begin = useCallback(() => {
    if (active.current) {
      cancel();
      return;
    }
    if (!dictation.supported) {
      finish(dictation.reason || "Voice input isn't available here.", "");
      return;
    }
    clearTimer();
    active.current = true;
    setHeard("");
    setReply("");
    setPhase("listening");
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    dictation.reset();
    dictation.start();
    timer.current = setTimeout(() => {
      if (active.current) finish("I didn't hear anything.", "");
    }, LISTEN_TIMEOUT_MS);
  }, [cancel, dictation, finish]);

  // The first finished sentence is the command.
  useEffect(() => {
    if (!active.current) return;
    const sentence = dictation.transcript.trim();
    if (!sentence) return;
    const result = parseVoiceCommand(sentence);
    if (result.action.kind === "navigate") router.push(result.action.path);
    if (result.action.kind === "stop") {
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }
    }
    finish(result.reply, sentence);
  }, [dictation.transcript, finish, router]);

  // A mic error ends the attempt honestly.
  useEffect(() => {
    if (active.current && dictation.error) finish(dictation.error, "");
  }, [dictation.error, finish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && active.current) {
        cancel();
        return;
      }
      if (!isVoiceHotkey(e) || isEditableTarget(e.target)) return;
      e.preventDefault();
      begin();
    };
    const onEvent = () => begin();
    window.addEventListener("keydown", onKey);
    window.addEventListener(VOICE_COMMAND_EVENT, onEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(VOICE_COMMAND_EVENT, onEvent);
    };
  }, [begin, cancel]);

  useEffect(() => () => clearTimer(), []);

  if (phase === "idle") return null;
  const live = (dictation.interim || dictation.transcript).trim();
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="voice-command-pill"
      className="pointer-events-none fixed bottom-4 left-1/2 z-50 max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-full border border-cyan-400/40 bg-slate-950/90 px-4 py-2 text-sm text-cyan-200 shadow-lg"
    >
      {phase === "listening" ? (
        <span>
          <span aria-hidden className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
          {dictation.processing ? "Working it out…" : live ? live : "Listening… say a command, or help"}
        </span>
      ) : (
        <span>
          {heard ? <span className="opacity-70">“{heard}” · </span> : null}
          {reply}
        </span>
      )}
    </div>
  );
}

export default VoiceCommandListener;

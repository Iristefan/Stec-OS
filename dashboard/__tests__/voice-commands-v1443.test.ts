/**
 * v1.443.0 (Stec OS step 4): the voice-command parser and the hotkey guard.
 */

import { describe, expect, it } from "vitest";
import { normalizeUtterance, parseVoiceCommand, VOICE_HELP } from "@/lib/voiceCommands";
import { isEditableTarget, isVoiceHotkey } from "@/components/VoiceCommandListener";

const at = new Date(2026, 10, 7, 14, 5);

describe("normalizeUtterance", () => {
  it("drops the wake word, politeness and filler", () => {
    expect(normalizeUtterance("Hey Jarvis, please open the Settings page please.")).toBe(
      "open the settings",
    );
    expect(normalizeUtterance("  Stec!  can you go to chat ")).toBe("go to chat");
  });
});

describe("parseVoiceCommand", () => {
  it.each([
    ["open chat", "/chat"],
    ["Jarvis, go to settings", "/settings"],
    ["show me my folders", "/folders"],
    ["open the file tree", "/folders"],
    ["terminal", "/terminals"],
    ["take me home", "/"],
    ["switch to workflows tab", "/workflows"],
  ])("%s navigates to %s", (said, path) => {
    const r = parseVoiceCommand(said, at);
    expect(r.action).toEqual({ kind: "navigate", path });
    expect(r.reply).toMatch(/^Opening /);
  });

  it("starts a new chat", () => {
    expect(parseVoiceCommand("new chat", at).action).toEqual({ kind: "navigate", path: "/chat?new=1" });
  });

  it("ask fills the composer with the user's own words and never sends", () => {
    const r = parseVoiceCommand("Hey Jarvis, ask Jarvis what's on my plate today?", at);
    expect(r.action).toEqual({
      kind: "navigate",
      path: `/chat?ask=${encodeURIComponent("what's on my plate today?")}`,
    });
    expect(r.reply).toMatch(/Press Enter/);
  });

  it("answers the time and date from the given clock", () => {
    expect(parseVoiceCommand("what time is it", at)).toMatchObject({ action: { kind: "say" } });
    expect(parseVoiceCommand("what time is it", at).reply).toMatch(/2:05|14:05/);
    expect(parseVoiceCommand("what day is it", at).reply).toMatch(/November/);
  });

  it("help and stop", () => {
    expect(parseVoiceCommand("what can I say", at).reply).toBe(VOICE_HELP);
    expect(parseVoiceCommand("never mind", at).action).toEqual({ kind: "stop" });
  });

  it("is honest about what it did not understand", () => {
    expect(parseVoiceCommand("open the pod bay doors", at)).toEqual({
      action: { kind: "unknown" },
      reply: "I don't know a page called the pod bay doors. Say help for the list.",
    });
    expect(parseVoiceCommand("bananas", at).action.kind).toBe("unknown");
    expect(parseVoiceCommand("   ", at).reply).toBe("I didn't hear anything.");
  });
});

describe("hotkey", () => {
  const k = (o: Partial<KeyboardEvent>) =>
    ({ key: "V", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...o }) as KeyboardEvent;

  it("is Ctrl+Shift+V (or Cmd), not plain or Alt", () => {
    expect(isVoiceHotkey(k({ ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(isVoiceHotkey(k({ metaKey: true, shiftKey: true, key: "v" }))).toBe(true);
    expect(isVoiceHotkey(k({ ctrlKey: true }))).toBe(false);
    expect(isVoiceHotkey(k({ ctrlKey: true, shiftKey: true, altKey: true }))).toBe(false);
  });

  it("leaves text fields their paste-as-plain-text", () => {
    expect(isEditableTarget(document.createElement("textarea"))).toBe(true);
    expect(isEditableTarget(document.createElement("input"))).toBe(true);
    expect(isEditableTarget(document.createElement("div"))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

/**
 * v1.443.0 (Stec OS step 4): the voice-command parser.
 *
 * Pure and offline: one spoken sentence in, one action plus the sentence to
 * say back out. Nothing here touches the mic, the router or the speaker — the
 * listener (`components/VoiceCommandListener.tsx`) does that — so every
 * phrase is pinned by `__tests__/voice-commands-v1443.test.ts`.
 *
 * Suggest, don't act: "ask Jarvis …" only FILLS the chat composer
 * (`/chat?ask=…`); it never sends. An unrecognised sentence is answered
 * honestly ("I didn't catch a command") instead of being guessed at.
 */

export type VoiceAction =
  | { kind: "navigate"; path: string }
  | { kind: "say" }
  | { kind: "stop" }
  | { kind: "unknown" };

export interface VoiceResult {
  action: VoiceAction;
  /** The short sentence spoken (and shown) back to the user. */
  reply: string;
}

/** Spoken page names → dashboard routes. Longer names first wins on overlap. */
export const VOICE_PAGES: ReadonlyArray<{ names: string[]; path: string; label: string }> = [
  { names: ["home", "overview", "dashboard", "start"], path: "/", label: "Home" },
  { names: ["chat", "chats", "conversation"], path: "/chat", label: "Chat" },
  { names: ["folders", "folder", "files", "file tree", "explorer"], path: "/folders", label: "Folders" },
  { names: ["terminals", "terminal", "build", "console"], path: "/terminals", label: "Build" },
  { names: ["agents", "agent"], path: "/agents", label: "Agents" },
  { names: ["workflows", "workflow"], path: "/workflows", label: "Workflows" },
  { names: ["projects", "project"], path: "/projects", label: "Projects" },
  { names: ["documents", "document", "docs"], path: "/documents", label: "Documents" },
  { names: ["memory", "memories"], path: "/memory", label: "Memory" },
  { names: ["schedules", "schedule", "calendar"], path: "/schedules", label: "Schedules" },
  { names: ["skills", "skill"], path: "/skills", label: "Skills" },
  { names: ["tools", "tool"], path: "/tools", label: "Tools" },
  { names: ["settings", "preferences", "options"], path: "/settings", label: "Settings" },
  { names: ["updates", "update"], path: "/updates", label: "Updates" },
  { names: ["help", "handbook", "guide"], path: "/help", label: "Help" },
];

const WAKE = /^(?:hey |ok |okay )?(?:jarvis|stec|computer)[,!.]?\s+/;
const POLITE = /^(?:please |can you |could you |would you )+/;
const TRAIL = /\s+(?:please|now|page|tab|window|screen)$/;

/** Lower-case, drop punctuation and the wake word / politeness. */
export function normalizeUtterance(text: string): string {
  let t = (text || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  t = t.replace(WAKE, "").replace(POLITE, "");
  // Trailing filler can repeat ("settings page please").
  for (let i = 0; i < 3; i++) t = t.replace(TRAIL, "");
  return t.trim();
}

function findPage(name: string) {
  const n = name.replace(/^(?:the|my)\s+/, "").trim();
  return VOICE_PAGES.find((p) => p.names.includes(n)) ?? null;
}

export const VOICE_HELP =
  "You can say: open chat, open folders, go to settings, new chat, " +
  "ask Jarvis followed by a question, what time is it, or stop.";

/**
 * Parse one spoken sentence. `now` is injectable so the clock answers are
 * deterministic in tests.
 */
export function parseVoiceCommand(text: string, now: Date = new Date()): VoiceResult {
  const raw = (text || "").trim();
  const t = normalizeUtterance(raw);
  if (!t) return { action: { kind: "unknown" }, reply: "I didn't hear anything." };

  if (/^(?:stop|cancel|never mind|nevermind|quiet|shut up|be quiet)$/.test(t)) {
    return { action: { kind: "stop" }, reply: "Okay." };
  }
  if (/^(?:help|what can i say|what can you do|commands|list commands)$/.test(t)) {
    return { action: { kind: "say" }, reply: VOICE_HELP };
  }
  if (/^(?:what time is it|whats the time|what is the time|time|the time)$/.test(t)) {
    const hm = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return { action: { kind: "say" }, reply: `It's ${hm}.` };
  }
  if (/^(?:whats the date|what is the date|what day is it|whats today|date|todays date)$/.test(t)) {
    const d = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    return { action: { kind: "say" }, reply: `It's ${d}.` };
  }
  if (/^(?:new chat|start a new chat|start new chat|new conversation|fresh chat)$/.test(t)) {
    return { action: { kind: "navigate", path: "/chat?new=1" }, reply: "Starting a new chat." };
  }

  // "ask (jarvis) <question>" / "tell jarvis <x>" → fill the composer, never send.
  const ask = /^(?:ask|tell)(?: jarvis| stec)?(?: to)? (.+)$/.exec(t);
  if (ask) {
    // Keep the user's own wording (case, punctuation) for the composer.
    const lead = /^\s*(?:(?:hey |ok |okay )?(?:jarvis|stec|computer)[,!.]?\s+)?(?:please\s+)?(?:ask|tell)(?:\s+(?:jarvis|stec))?(?:\s+to)?[,:]?\s+/i;
    const question = raw.replace(lead, "").trim() || ask[1];
    return {
      action: { kind: "navigate", path: `/chat?ask=${encodeURIComponent(question)}` },
      reply: "I put that in the chat box. Press Enter to send it.",
    };
  }

  // "open / go to / show (me) / switch to <page>", or the bare page name.
  const nav = /^(?:open|go to|goto|show me|show|switch to|take me to|take me|bring up|navigate to)\s+(.+)$/.exec(t);
  const page = findPage(nav ? nav[1] : t);
  if (page) {
    return { action: { kind: "navigate", path: page.path }, reply: `Opening ${page.label}.` };
  }
  if (nav) {
    return {
      action: { kind: "unknown" },
      reply: `I don't know a page called ${nav[1]}. Say help for the list.`,
    };
  }
  return {
    action: { kind: "unknown" },
    reply: "I didn't catch a command. Say help for the list.",
  };
}

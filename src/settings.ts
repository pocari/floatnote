import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { isEnabled, enable, disable } from "@tauri-apps/plugin-autostart";

type Level = "top" | "normal" | "bottom";

const display = document.getElementById("hotkey-display") as HTMLDivElement;
const recordBtn = document.getElementById("record-btn") as HTMLButtonElement;
const clearBtn = document.getElementById("clear-btn") as HTMLButtonElement;
const errorEl = document.getElementById("error") as HTMLParagraphElement;
const notePathEl = document.getElementById("note-path") as HTMLElement;
const versionEl = document.getElementById("app-version") as HTMLElement;
const radios = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="level"]'));

let recording = false;

// ---------- key → tauri shortcut string ----------

const CODE_MAP: Record<string, string> = {
  Space: "Space", Enter: "Enter", Escape: "Escape", Tab: "Tab", Backspace: "Backspace", Delete: "Delete",
  ArrowUp: "ArrowUp", ArrowDown: "ArrowDown", ArrowLeft: "ArrowLeft", ArrowRight: "ArrowRight",
  Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
  Minus: "Minus", Equal: "Equal", Comma: "Comma", Period: "Period", Slash: "Slash", Backslash: "Backslash",
  BracketLeft: "BracketLeft", BracketRight: "BracketRight", Semicolon: "Semicolon", Quote: "Quote", Backquote: "Backquote",
};

function keyFromEvent(e: KeyboardEvent): string | null {
  const c = e.code;
  if (/^Key[A-Z]$/.test(c)) return c.slice(3);
  if (/^Digit[0-9]$/.test(c)) return c.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(c)) return c;
  if (/^Numpad[0-9]$/.test(c)) return c;
  return CODE_MAP[c] ?? null;
}

function shortcutFromEvent(e: KeyboardEvent): { ok: true; value: string } | { ok: false; reason: string } {
  const key = keyFromEvent(e);
  if (!key) return { ok: false, reason: "このキーは使えません" };
  const mods: string[] = [];
  if (e.metaKey) mods.push("Command");
  if (e.ctrlKey) mods.push("Control");
  if (e.altKey) mods.push("Option");
  if (e.shiftKey) mods.push("Shift");
  if (!e.metaKey && !e.ctrlKey && !e.altKey) return { ok: false, reason: "⌘ / ⌃ / ⌥ のいずれかを含めてください" };
  return { ok: true, value: [...mods, key].join("+") };
}

const SYMBOL: Record<string, string> = {
  Command: "⌘", Super: "⌘", Cmd: "⌘", Control: "⌃", Ctrl: "⌃", Option: "⌥", Alt: "⌥", Shift: "⇧",
  Space: "Space", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Enter: "↩", Backspace: "⌫", Delete: "⌦", Tab: "⇥",
};
function pretty(shortcut: string): string {
  return shortcut.split("+").map((p) => SYMBOL[p] ?? p).join(" ");
}

// ---------- UI ----------

function setError(msg: string | null) {
  errorEl.hidden = !msg;
  errorEl.textContent = msg ?? "";
}

function render(hotkey: string | null) {
  if (hotkey) {
    display.textContent = pretty(hotkey);
    display.classList.remove("empty");
    clearBtn.disabled = false;
  } else {
    display.textContent = "未設定";
    display.classList.add("empty");
    clearBtn.disabled = true;
  }
}

function startRecording() {
  recording = true;
  setError(null);
  display.classList.add("recording");
  display.textContent = "キーを押してください…";
  display.classList.remove("empty");
  recordBtn.textContent = "キャンセル";
  display.focus();
}

async function stopRecording() {
  recording = false;
  display.classList.remove("recording");
  recordBtn.textContent = "キーを設定";
  render(await invoke<string | null>("get_hotkey"));
}

recordBtn.addEventListener("click", () => (recording ? stopRecording() : startRecording()));

clearBtn.addEventListener("click", async () => {
  try {
    await invoke("set_hotkey", { hotkey: null });
    setError(null);
  } catch (e) {
    setError(String(e));
  }
  render(await invoke<string | null>("get_hotkey"));
});

window.addEventListener("keydown", async (e) => {
  if (!recording) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === "Escape") { stopRecording(); return; }
  // modifier-only press: keep waiting, show partial state
  if (["Meta", "Control", "Alt", "Shift"].includes(e.key)) {
    const mods: string[] = [];
    if (e.metaKey) mods.push("⌘");
    if (e.ctrlKey) mods.push("⌃");
    if (e.altKey) mods.push("⌥");
    if (e.shiftKey) mods.push("⇧");
    display.textContent = mods.join(" ") + " …";
    return;
  }
  const r = shortcutFromEvent(e);
  if (!r.ok) { setError(r.reason); return; }
  try {
    await invoke("set_hotkey", { hotkey: r.value });
    setError(null);
  } catch (err) {
    setError(String(err));
  }
  await stopRecording();
}, true);

window.addEventListener("keyup", (e) => {
  if (!recording) return;
  if (["Meta", "Control", "Alt", "Shift"].includes(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
    display.textContent = "キーを押してください…";
  }
});

radios.forEach((r) =>
  r.addEventListener("change", async () => {
    if (!r.checked) return;
    try {
      await invoke("set_level", { level: r.value as Level });
    } catch (e) {
      setError(String(e));
    }
  }),
);

function renderLevel(level: Level) {
  radios.forEach((r) => (r.checked = r.value === level));
}

await listen<Level>("level-changed", (ev) => renderLevel(ev.payload));
await listen<string | null>("hotkey-changed", (ev) => { if (!recording) render(ev.payload); });

render(await invoke<string | null>("get_hotkey"));
renderLevel(await invoke<Level>("get_level"));
notePathEl.textContent = await invoke<string>("get_note_path").catch(() => "(不明)");
versionEl.textContent = await getVersion().then((v) => `v${v}`).catch(() => "");

// ---------- autostart ----------
const autostartEl = document.getElementById("autostart") as HTMLInputElement;
const autostartNote = document.getElementById("autostart-note") as HTMLParagraphElement;
autostartNote.hidden = !import.meta.env.DEV;
try {
  autostartEl.checked = await isEnabled();
} catch (e) {
  autostartEl.disabled = true;
  setError(`自動起動の状態を取得できません: ${e}`);
}
autostartEl.addEventListener("change", async () => {
  try {
    if (autostartEl.checked) await enable(); else await disable();
    setError(null);
  } catch (e) {
    autostartEl.checked = !autostartEl.checked;
    setError(String(e));
  }
});

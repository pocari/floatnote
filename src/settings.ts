import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { isEnabled, enable, disable } from "@tauri-apps/plugin-autostart";
import { shortcutFromEvent, pretty } from "./shortcut";

type Level = "top" | "normal";

const errorEl = document.getElementById("error") as HTMLParagraphElement;
const notePathEl = document.getElementById("note-path") as HTMLElement;
const versionEl = document.getElementById("app-version") as HTMLElement;
const radios = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="level"]'));

function setError(msg: string | null) {
  errorEl.hidden = !msg;
  errorEl.textContent = msg ?? "";
}

// ---------- key recorder ----------
// グローバルホットキーとウィンドウ位置の切替キーで同じ UI を使う

type Recorder = { name: string; row: HTMLElement; get: string; set: string; event: string };

const RECORDERS: Recorder[] = [
  { name: "global", get: "get_hotkey", set: "set_hotkey", event: "hotkey-changed" },
  { name: "level", get: "get_level_hotkey", set: "set_level_hotkey", event: "level-hotkey-changed" },
].map((r) => ({ ...r, row: document.querySelector<HTMLElement>(`[data-recorder="${r.name}"]`)! }));

let recording: Recorder | null = null;

function parts(r: Recorder) {
  return {
    display: r.row.querySelector<HTMLDivElement>(".hotkey-display")!,
    recordBtn: r.row.querySelector<HTMLButtonElement>(".record-btn")!,
    clearBtn: r.row.querySelector<HTMLButtonElement>(".clear-btn")!,
  };
}

function render(r: Recorder, hotkey: string | null) {
  const { display, clearBtn } = parts(r);
  display.textContent = hotkey ? pretty(hotkey) : "未設定";
  display.classList.toggle("empty", !hotkey);
  clearBtn.disabled = !hotkey;
}

async function refresh(r: Recorder) {
  render(r, await invoke<string | null>(r.get));
}

function startRecording(r: Recorder) {
  if (recording) void stopRecording();
  recording = r;
  setError(null);
  const { display, recordBtn } = parts(r);
  display.classList.add("recording");
  display.classList.remove("empty");
  display.textContent = "キーを押してください…";
  recordBtn.textContent = "キャンセル";
  display.focus();
}

async function stopRecording() {
  const r = recording;
  if (!r) return;
  recording = null;
  const { display, recordBtn } = parts(r);
  display.classList.remove("recording");
  recordBtn.textContent = "キーを設定";
  await refresh(r);
}

for (const r of RECORDERS) {
  const { recordBtn, clearBtn } = parts(r);
  recordBtn.addEventListener("click", () => (recording === r ? stopRecording() : startRecording(r)));
  clearBtn.addEventListener("click", async () => {
    try {
      await invoke(r.set, { hotkey: null });
      setError(null);
    } catch (e) {
      setError(String(e));
    }
    await refresh(r);
  });
  await listen<string | null>(r.event, (ev) => { if (recording !== r) render(r, ev.payload); });
  await refresh(r);
}

window.addEventListener("keydown", async (e) => {
  const r = recording;
  if (!r) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === "Escape") { stopRecording(); return; }
  const { display } = parts(r);
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
  const res = shortcutFromEvent(e);
  if (!res.ok) { setError(res.reason); return; }
  try {
    await invoke(r.set, { hotkey: res.value });
    setError(null);
  } catch (err) {
    setError(String(err));
  }
  await stopRecording();
}, true);

window.addEventListener("keyup", (e) => {
  if (!recording) return;
  if (["Meta", "Control", "Alt", "Shift"].includes(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
    parts(recording).display.textContent = "キーを押してください…";
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

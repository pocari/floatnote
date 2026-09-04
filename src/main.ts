import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";

type Level = "top" | "normal" | "bottom";

const LEVEL_ICON: Record<Level, string> = { top: "⬆", normal: "↕", bottom: "⬇" };
const LEVEL_LABEL: Record<Level, string> = { top: "常に最前面", normal: "通常", bottom: "常に最奥" };

const levelBtn = document.getElementById("level-btn") as HTMLButtonElement;
const settingsBtn = document.getElementById("settings-btn") as HTMLButtonElement;
const toast = document.getElementById("toast") as HTMLDivElement;
const levelMenu = document.getElementById("level-menu") as HTMLDivElement;
const editor = document.getElementById("editor") as HTMLTextAreaElement;
const highlight = document.getElementById("highlight") as HTMLDivElement;
const editorWrap = document.getElementById("editor-wrap") as HTMLDivElement;

let toastTimer: number | undefined;
function showToast(msg: string) {
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.hidden = true), 4000);
}

// ---------- window level ----------

function renderLevel(level: Level) {
  levelBtn.textContent = LEVEL_ICON[level];
  levelBtn.title = `ウィンドウ位置: ${LEVEL_LABEL[level]}`;
  levelBtn.dataset.level = level;
  levelMenu.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
    b.classList.toggle("active", b.dataset.level === level);
  });
}

levelBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  levelMenu.hidden = !levelMenu.hidden;
});
levelMenu.addEventListener("click", async (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-level]");
  if (!btn) return;
  levelMenu.hidden = true;
  try {
    await invoke("set_level", { level: btn.dataset.level as Level });
  } catch (err) {
    showToast(String(err));
  }
});
document.addEventListener("click", () => (levelMenu.hidden = true));
window.addEventListener("blur", () => (levelMenu.hidden = true));
settingsBtn.addEventListener("click", () => invoke("open_settings").catch((e) => showToast(String(e))));

await listen<Level>("level-changed", (ev) => renderLevel(ev.payload));
renderLevel(await invoke<Level>("get_level"));

// ---------- editor (plain text) ----------

const initial = await invoke<string>("load_note").catch((e) => {
  showToast(`読み込み失敗: ${e}`);
  return "";
});
editor.value = initial;

let latest = initial;
let dirty = false;
let saveTimer: number | undefined;

async function flush() {
  if (!dirty) return;
  dirty = false;
  try {
    await invoke("save_note", { content: latest });
  } catch (e) {
    dirty = true;
    showToast(`保存失敗: ${e}`);
  }
}

// ---------- URL highlight layer ----------
// textarea の背後に同じレイアウトで文字を描き、URL だけリンク風に見せる。入力は textarea が受ける。
const URL_RE = /https?:\/\/[^\s<>"'）」』】]+/g;
const TRAILING = /[.,;:!?)\]}]+$/;

function escapeHtml(t: string) {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderHighlight(text: string) {
  let html = "";
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0];
    const trail = TRAILING.exec(url);
    if (trail) url = url.slice(0, -trail[0].length);
    const start = m.index!;
    html += escapeHtml(text.slice(last, start));
    html += `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`;
    last = start + url.length;
  }
  html += escapeHtml(text.slice(last));
  // 末尾の改行分の高さを textarea と合わせる
  highlight.innerHTML = html + (text.endsWith("\n") ? "\u200b" : "");
}

function linkAt(x: number, y: number): string | null {
  for (const a of highlight.querySelectorAll<HTMLAnchorElement>("a")) {
    for (const r of a.getClientRects()) {
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return a.getAttribute("href");
    }
  }
  return null;
}

// ⌘+クリックで URL を既定ブラウザで開く。通常クリックはカーソル移動のまま
editor.addEventListener("mousedown", (e) => {
  if (!e.metaKey || e.button !== 0) return;
  const url = linkAt(e.clientX, e.clientY);
  if (!url) return;
  e.preventDefault();
  openUrl(url).catch((err) => showToast(`開けません: ${err}`));
});
editor.addEventListener("scroll", () => {
  highlight.scrollTop = editor.scrollTop;
  highlight.scrollLeft = editor.scrollLeft;
});
// ⌘ を押している間だけカーソルをポインタにして「開ける」ことを示す
window.addEventListener("keydown", (e) => { if (e.key === "Meta") editorWrap.classList.add("cmd"); });
window.addEventListener("keyup", (e) => { if (e.key === "Meta") editorWrap.classList.remove("cmd"); });
window.addEventListener("blur", () => editorWrap.classList.remove("cmd"));

renderHighlight(initial);

editor.addEventListener("input", () => {
  latest = editor.value;
  renderHighlight(latest);
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(flush, 500);
});

// Tab inserts two spaces instead of moving focus
editor.addEventListener("keydown", (e) => {
  if (e.key !== "Tab" || e.metaKey || e.ctrlKey || e.altKey) return;
  e.preventDefault();
  const { selectionStart: s, selectionEnd: en, value } = editor;
  if (e.shiftKey) {
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    const m = /^( {1,2})/.exec(value.slice(lineStart));
    if (!m) return;
    editor.setRangeText("", lineStart, lineStart + m[1].length, "end");
    editor.setSelectionRange(Math.max(lineStart, s - m[1].length), Math.max(lineStart, en - m[1].length));
  } else {
    editor.setRangeText("  ", s, en, "end");
  }
  editor.dispatchEvent(new Event("input"));
});

window.addEventListener("blur", flush);
window.addEventListener("beforeunload", flush);

// ---------- focus ----------
function focusEditor() {
  editor.focus();
}
window.addEventListener("focus", () => {
  if (levelMenu.hidden && document.activeElement?.tagName !== "BUTTON") focusEditor();
});
editor.setSelectionRange(editor.value.length, editor.value.length);
focusEditor();

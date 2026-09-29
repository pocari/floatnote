// KeyboardEvent ⇔ ショートカット文字列（"Command+Shift+L" 形式。tauri global-shortcut と同じ表記）
// 設定画面での登録とノート側での判定で同じ変換を使い、文字列比較だけで一致判定できるようにする

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

export function shortcutFromEvent(e: KeyboardEvent): { ok: true; value: string } | { ok: false; reason: string } {
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
export function pretty(shortcut: string): string {
  return shortcut.split("+").map((p) => SYMBOL[p] ?? p).join(" ");
}

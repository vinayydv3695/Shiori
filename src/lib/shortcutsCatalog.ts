export interface ShortcutItem {
  keys: string;
  action: string;
  context: string;
}

export interface ShortcutCategory {
  title: string;
  shortcuts: ShortcutItem[];
}

export const SHORTCUTS_CATALOG: ShortcutCategory[] = [
  {
    title: "General",
    shortcuts: [
      { keys: "Ctrl/Cmd + K", action: "Open command palette", context: "Anywhere" },
      { keys: "Ctrl/Cmd + I", action: "Open selected book details", context: "Library" },
      { keys: "Ctrl/Cmd + Shift + M", action: "Fetch metadata for selected", context: "Library" },
      { keys: "Ctrl/Cmd + Shift + F", action: "Open advanced filters", context: "Library" },
      { keys: "?", action: "Show shortcuts dialog", context: "Anywhere" },
      { keys: "Ctrl + /", action: "Show shortcuts dialog", context: "Windows/Linux" },
    ],
  },
  {
    title: "Book Reader",
    shortcuts: [
      { keys: "H", action: "Toggle top bar", context: "Book reader" },
      { keys: "S", action: "Toggle sidebar", context: "Book reader" },
      { keys: "T", action: "Open TOC", context: "Book reader" },
      { keys: "F", action: "Toggle focus mode", context: "Book reader" },
      { keys: "Esc", action: "Close sidebar/focus", context: "Book reader" },
      { keys: "Arrow Left / Right", action: "Previous / next chapter", context: "Book reader" },
      { keys: "Space or PageDown", action: "Next page/scroll", context: "Book reader" },
      { keys: "Shift+Space or PageUp", action: "Previous page/scroll", context: "Book reader" },
      { keys: "Ctrl/Cmd + D", action: "Cycle reader theme", context: "Book reader" },
      { keys: "Ctrl/Cmd + +", action: "Increase font size", context: "Book reader" },
      { keys: "Ctrl/Cmd + -", action: "Decrease font size", context: "Book reader" },
      { keys: "Ctrl/Cmd + \\", action: "Cycle reader width", context: "Book reader" },
    ],
  },
  {
    title: "Manga Reader",
    shortcuts: [
      { keys: "H", action: "Toggle top bar", context: "Manga reader" },
      { keys: "S", action: "Toggle sidebar", context: "Manga reader" },
      { keys: "1 / 3 / 4 / 5 / 6", action: "Switch reading mode", context: "Manga reader" },
      { keys: "D", action: "Toggle manga light/dark", context: "Manga reader" },
      { keys: ",", action: "Open manga settings", context: "Manga reader" },
      { keys: "Home / End", action: "First / last page", context: "Manga reader" },
      { keys: "Arrow keys / Space", action: "Navigate pages", context: "Manga reader" },
      { keys: "Esc", action: "Close settings/sidebar/reader", context: "Manga reader" },
    ],
  },
];

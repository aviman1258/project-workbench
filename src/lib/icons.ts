// The handful of inline SVG icons the app repeats, as string constants.
// Astro templates render them with set:html; scripts assign them to innerHTML.

export const ICON_LOCK = '<svg aria-hidden="true" viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg>';

export const ICON_TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>';

// three-cluster sparkle (the field editor's AI button)
export const ICON_SPARKLE = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2l1.9 5.7L19.6 9l-5.7 1.9L12 16.6l-1.9-5.7L4.4 9l5.7-1.3L12 2Zm7 12 1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3ZM5 15l.8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8L5 15Z"/></svg>';

// two-cluster sparkle (the Draft-from-repo pills)
export const ICON_SPARKLE_SMALL = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2l1.9 5.7L19.6 9l-5.7 1.9L12 16.6l-1.9-5.7L4.4 9l5.7-1.3L12 2Zm7 12 1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z"/></svg>';

export const ICON_PENCIL = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path></svg>';

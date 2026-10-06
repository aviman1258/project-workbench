// Render plain text with URLs turned into links, safely (everything else is
// escaped). Used for the project description, which may mention a live site.

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const URL_PATTERN = /\b(https?:\/\/[^\s<>"']+|www\.[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s<>"']*)/gi;

export function linkify(text: string): string {
  return escapeHtml(text).replace(URL_PATTERN, (match) => {
    const trimmed = match.replace(/[.,;:)]+$/, '');
    const trailing = match.slice(trimmed.length);
    const href = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    return `<a href="${href}" target="_blank" rel="noreferrer">${trimmed}</a>${trailing}`;
  });
}

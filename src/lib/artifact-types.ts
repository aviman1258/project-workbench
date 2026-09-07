// One table for what an artifact file is: its display kind and MIME type.
// Browser-safe; used by the server loaders, the local editor, and the carousel.

export type ArtifactKind = 'image' | 'video' | 'pdf' | 'file';

export const ARTIFACT_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

const extensionOf = (filename: string) => {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot).toLowerCase();
};

/** Anything unknown is still a valid artifact — a generic downloadable file. */
export function mimeFor(filename: string): string {
  return ARTIFACT_MIME[extensionOf(filename)] ?? 'application/octet-stream';
}

export function kindFor(filename: string): ArtifactKind {
  const mime = ARTIFACT_MIME[extensionOf(filename)];
  if (!mime) return 'file';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return 'pdf';
}

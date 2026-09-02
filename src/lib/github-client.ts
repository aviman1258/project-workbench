// Browser-side GitHub client for the hosted (PUBLIC_ONLY) editor. Every write is a
// commit to the repository; the Pages workflow republishes the site afterwards.
// The token is a fine-grained PAT the owner pastes once, kept in localStorage.

export const GITHUB_OWNER = 'aviman1258';
export const GITHUB_REPO = 'project-workbench';
export const GITHUB_BRANCH = 'main';

const TOKEN_KEY = 'workbench-github-token';

// Fired on window whenever the stored token changes, so every connect surface
// (header icon, embedded panels, editors) stays in sync without reloading.
export const TOKEN_EVENT = 'workbench-token-changed';

export function getStoredToken(): string {
  try { return window.localStorage.getItem(TOKEN_KEY) ?? ''; } catch { return ''; }
}
export function storeToken(token: string) {
  try { window.localStorage.setItem(TOKEN_KEY, token); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent(TOKEN_EVENT));
}
export function clearToken() {
  try { window.localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(TOKEN_EVENT));
}

export async function gh(token: string, path: string, init: RequestInit = {}): Promise<Record<string, any>> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof (body as Record<string, unknown>).message === 'string'
      ? (body as Record<string, string>).message
      : `GitHub returned ${response.status}.`;
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return body as Record<string, any>;
}

export async function validateToken(token: string): Promise<void> {
  const repo = await gh(token, `/repos/${GITHUB_OWNER}/${GITHUB_REPO}`);
  if (!repo.permissions?.push) throw new Error('That token cannot write to the repository.');
}

export function encodeText(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

export function decodeContent(base64: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(base64.replace(/\n/g, '')), (c) => c.charCodeAt(0)));
}

export async function getFile(token: string, path: string): Promise<{ sha: string; text: string }> {
  const file = await gh(token, `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}?ref=${GITHUB_BRANCH}`);
  return { sha: String(file.sha), text: decodeContent(String(file.content)) };
}

export function putFile(token: string, path: string, contentBase64: string, message: string, sha?: string) {
  return gh(token, `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: contentBase64, branch: GITHUB_BRANCH, ...(sha ? { sha } : {}) }),
  });
}

export async function deleteFile(token: string, path: string, message: string) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const file = await gh(token, `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodedPath}?ref=${GITHUB_BRANCH}`);
  return gh(token, `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodedPath}`, {
    method: 'DELETE',
    body: JSON.stringify({ message, sha: String(file.sha), branch: GITHUB_BRANCH }),
  });
}

export async function listProjectFolders(token: string): Promise<string[]> {
  const entries = await gh(token, `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/src/content/projects?ref=${GITHUB_BRANCH}`);
  return (entries as unknown as { type: string; name: string }[])
    .filter((entry) => entry.type === 'dir')
    .map((entry) => entry.name);
}

// --- private vault (workbench-private) ---
export const VAULT_REPO = 'workbench-private';

export async function findVaultFolder(token: string, id: string): Promise<string | null> {
  const entries = await gh(token, `/repos/${GITHUB_OWNER}/${VAULT_REPO}/contents/projects`);
  const folder = (entries as unknown as { type: string; name: string }[])
    .find((entry) => entry.type === 'dir' && entry.name.startsWith(`${id}-`));
  return folder ? folder.name : null;
}

export async function getVaultText(token: string, path: string): Promise<string> {
  const file = await gh(token, `/repos/${GITHUB_OWNER}/${VAULT_REPO}/contents/${path}`);
  return decodeContent(String(file.content));
}

export async function getVaultFile(token: string, path: string): Promise<{ sha: string; text: string }> {
  const file = await gh(token, `/repos/${GITHUB_OWNER}/${VAULT_REPO}/contents/${path}`);
  return { sha: String(file.sha), text: decodeContent(String(file.content)) };
}

export function putVaultFile(token: string, path: string, contentBase64: string, message: string, sha?: string) {
  return gh(token, `/repos/${GITHUB_OWNER}/${VAULT_REPO}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: contentBase64, branch: GITHUB_BRANCH, ...(sha ? { sha } : {}) }),
  });
}

export async function listVaultArtifacts(token: string, folder: string): Promise<{ name: string; path: string; size: number }[]> {
  try {
    const entries = await gh(token, `/repos/${GITHUB_OWNER}/${VAULT_REPO}/contents/projects/${folder}/artifacts`);
    return (entries as unknown as { type: string; name: string; path: string; size: number }[])
      .filter((entry) => entry.type === 'file' && /\.(png|jpe?g|pdf|mp4)$/i.test(entry.name));
  } catch {
    return [];
  }
}

// Raw media type streams the file bytes directly (works for large artifacts too).
export async function getVaultBlobUrl(token: string, path: string, mimeType: string): Promise<string> {
  const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${VAULT_REPO}/contents/${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.raw+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) throw new Error(`GitHub ${response.status} fetching ${path}`);
  return URL.createObjectURL(new Blob([await response.arrayBuffer()], { type: mimeType }));
}

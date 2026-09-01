// Browser-side GitHub client for the hosted (PUBLIC_ONLY) editor. Every write is a
// commit to the repository; the Pages workflow republishes the site afterwards.
// The token is a fine-grained PAT the owner pastes once, kept in localStorage.

export const GITHUB_OWNER = 'aviman1258';
export const GITHUB_REPO = 'project-workbench';
export const GITHUB_BRANCH = 'main';

const TOKEN_KEY = 'workbench-github-token';

export function getStoredToken(): string {
  try { return window.localStorage.getItem(TOKEN_KEY) ?? ''; } catch { return ''; }
}
export function storeToken(token: string) {
  try { window.localStorage.setItem(TOKEN_KEY, token); } catch { /* private mode */ }
}
export function clearToken() {
  try { window.localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
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

export async function listProjectFolders(token: string): Promise<string[]> {
  const entries = await gh(token, `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/src/content/projects?ref=${GITHUB_BRANCH}`);
  return (entries as unknown as { type: string; name: string }[])
    .filter((entry) => entry.type === 'dir')
    .map((entry) => entry.name);
}

// Wires the shared "Connect GitHub" panel markup. onChange fires with the current
// token whenever the connection state changes (including on load).
export function wireTokenPanel(root: HTMLElement, onChange: (token: string) => void) {
  const panel = root.querySelector<HTMLDetailsElement>('[data-remote-token-panel]')!;
  const label = root.querySelector<HTMLElement>('[data-remote-token-label]')!;
  const input = root.querySelector<HTMLInputElement>('[data-remote-token-input]')!;
  const status = root.querySelector<HTMLElement>('[data-remote-token-status]')!;
  const forget = root.querySelector<HTMLButtonElement>('[data-remote-token-forget]')!;

  let token = getStoredToken();
  const apply = () => {
    forget.hidden = !token;
    label.textContent = token ? 'GitHub connected' : 'Connect GitHub to edit';
    if (token) panel.open = false;
    onChange(token);
  };
  apply();

  root.querySelector('[data-remote-token-save]')?.addEventListener('click', async () => {
    const candidate = input.value.trim();
    if (!candidate) { status.textContent = 'Paste a token first.'; return; }
    status.textContent = 'Checking access…';
    try {
      await validateToken(candidate);
      token = candidate;
      storeToken(token);
      input.value = '';
      status.textContent = 'Connected.';
      apply();
    } catch (error) {
      status.textContent = (error as Error).message || 'That token did not work.';
    }
  });
  forget.addEventListener('click', () => {
    token = '';
    clearToken();
    status.textContent = 'Token forgotten.';
    apply();
  });

  return { invalidate: () => { token = ''; apply(); } };
}

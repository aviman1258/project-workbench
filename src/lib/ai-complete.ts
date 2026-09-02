// AI autocomplete for the hosted editor. Provider shell: one pasted API key,
// routed by prefix — sk-ant-… calls the Anthropic API, other sk-… keys call
// OpenAI — both directly from the browser (each SDK's explicit browser opt-in).
// The SDKs are dynamically imported so neither ships until the AI button is used.
// Repo/PR evidence comes from the GitHub API with the editor's GitHub token.
// Context is capped so a single call never exceeds the input budget.

// ~6k tokens of input context per call, enforced as a character budget
const MAX_CONTEXT_CHARS = 24_000;

const AI_KEY_STORAGE = 'workbench-ai-key';
const LEGACY_KEY_STORAGE = 'workbench-anthropic-key';

export function getStoredAnthropicKey(): string {
  try {
    return window.localStorage.getItem(AI_KEY_STORAGE)
      ?? window.localStorage.getItem(LEGACY_KEY_STORAGE)
      ?? '';
  } catch { return ''; }
}
export function storeAnthropicKey(key: string) {
  try {
    window.localStorage.setItem(AI_KEY_STORAGE, key);
    window.localStorage.removeItem(LEGACY_KEY_STORAGE);
  } catch { /* private mode */ }
}
export function clearAnthropicKey() {
  try {
    window.localStorage.removeItem(AI_KEY_STORAGE);
    window.localStorage.removeItem(LEGACY_KEY_STORAGE);
  } catch { /* ignore */ }
}

export function detectProvider(key: string): 'anthropic' | 'openai' {
  return key.startsWith('sk-ant-') ? 'anthropic' : 'openai';
}

// OpenAI's API blocks browser CORS, so OpenAI keys need the bundled Cloudflare
// Worker proxy (proxy/openai-worker.js) — its URL is stored here.
const OPENAI_PROXY_STORAGE = 'workbench-openai-proxy';

export function getStoredOpenAiProxy(): string {
  try { return window.localStorage.getItem(OPENAI_PROXY_STORAGE) ?? ''; } catch { return ''; }
}
export function storeOpenAiProxy(url: string) {
  try { window.localStorage.setItem(OPENAI_PROXY_STORAGE, url); } catch { /* private mode */ }
}
export function clearOpenAiProxy() {
  try { window.localStorage.removeItem(OPENAI_PROXY_STORAGE); } catch { /* ignore */ }
}

const ghHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
});

async function ghJson(token: string, url: string): Promise<any> {
  const response = await fetch(url, { headers: ghHeaders(token) });
  if (!response.ok) throw new Error(`GitHub returned ${response.status} for ${url.split('.com')[1] ?? url}`);
  return response.json();
}

function parseGitHubRepo(url: string): { owner: string; repo: string } | null {
  const match = /github\.com\/([^/]+)\/([^/#?]+)/.exec(url);
  return match ? { owner: match[1], repo: match[2].replace(/\.git$/, '') } : null;
}

function parsePullRequest(url: string): { owner: string; repo: string; number: string } | null {
  const match = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(url);
  return match ? { owner: match[1], repo: match[2], number: match[3] } : null;
}

export async function gatherRepoContext(
  token: string,
  repositoryUrl: string,
  pullRequestUrl: string,
): Promise<string> {
  const parts: string[] = [];
  let budget = MAX_CONTEXT_CHARS;
  const push = (label: string, text: string, cap: number) => {
    const chunk = `## ${label}\n${text.slice(0, Math.min(cap, budget))}`;
    parts.push(chunk);
    budget -= chunk.length;
  };

  const repo = parseGitHubRepo(repositoryUrl);
  if (repo && budget > 0) {
    try {
      const meta = await ghJson(token, `https://api.github.com/repos/${repo.owner}/${repo.repo}`);
      push('Repository', `${meta.full_name}: ${meta.description ?? '(no description)'} · language: ${meta.language ?? '?'} · created ${meta.created_at?.slice(0, 10)}`, 500);
    } catch { /* repo metadata is optional */ }
    try {
      const readme = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/readme`, {
        headers: { ...ghHeaders(token), Accept: 'application/vnd.github.raw+json' },
      });
      if (readme.ok) push('README', await readme.text(), 10_000);
    } catch { /* README is optional */ }
    try {
      const tree = await ghJson(token, `https://api.github.com/repos/${repo.owner}/${repo.repo}/git/trees/HEAD?recursive=1`);
      const files = (tree.tree ?? []).filter((e: any) => e.type === 'blob').map((e: any) => e.path).slice(0, 200).join('\n');
      push('File tree', files, 4_000);
    } catch { /* tree is optional */ }
  }

  const pr = parsePullRequest(pullRequestUrl);
  if (pr && budget > 0) {
    try {
      const pull = await ghJson(token, `https://api.github.com/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}`);
      push('Pull request', `${pull.title}\n\n${pull.body ?? ''}`, 4_000);
      const files = await ghJson(token, `https://api.github.com/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/files?per_page=30`);
      const diffs = (files as any[]).map((f) => `--- ${f.filename}\n${(f.patch ?? '').slice(0, 600)}`).join('\n');
      push('Pull request changes', diffs, 8_000);
    } catch { /* PR context is optional */ }
  }

  if (!parts.length) throw new Error('Add a repository (or pull request) link first — the AI reads it for context.');
  return parts.join('\n\n');
}

const SYSTEM_PROMPT = 'You help a developer document their portfolio projects. Use only the provided evidence and draft. Reply with the final text only — no preamble, no quotes, no markdown.';

async function draftWithAnthropic(apiKey: string, userPrompt: string): Promise<string> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });
    if (response.stop_reason === 'refusal') throw new Error('The draft request was declined.');
    return response.content
      .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new Error('That Anthropic API key was rejected — replace it via the GitHub icon dialog.');
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new Error('Anthropic rate limit hit — wait a moment and try again.');
    }
    throw error;
  }
}

async function draftWithOpenAI(apiKey: string, userPrompt: string): Promise<string> {
  const proxy = getStoredOpenAiProxy().replace(/\/$/, '');
  if (!proxy) {
    throw new Error("OpenAI blocks direct browser calls. Deploy the repo's proxy/openai-worker.js on Cloudflare Workers (free) and paste its URL in the GitHub dialog — or use an Anthropic key, which works directly.");
  }
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey, baseURL: `${proxy}/v1`, dangerouslyAllowBrowser: true });
  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_completion_tokens: 600,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    });
    return (response.choices?.[0]?.message?.content ?? '').trim();
  } catch (error) {
    if (error instanceof OpenAI.AuthenticationError) {
      throw new Error('That OpenAI API key was rejected — replace it via the GitHub icon dialog.');
    }
    if (error instanceof OpenAI.RateLimitError) {
      throw new Error('OpenAI rate limit hit — wait a moment and try again.');
    }
    throw error;
  }
}

export async function aiComplete(options: {
  field: 'description' | 'why';
  existing: string;
  projectName: string;
  context: string;
}): Promise<string> {
  const apiKey = getStoredAnthropicKey();
  if (!apiKey) throw new Error('Add an Anthropic or OpenAI API key first — GitHub icon in the header → AI drafts.');
  const { field, existing, projectName, context } = options;

  const instruction = field === 'description'
    ? 'Write a 1-3 sentence description of what this project does. Concrete and plain-English; no marketing fluff.'
    : 'Write 2-4 sentences on WHY this project was built — the problem, curiosity, or need behind it. First person ("I built this…"). If the current draft below contains intent, treat it as the strongest signal and refine it using the repository evidence.';

  const userPrompt = `Project: ${projectName}\n\nCurrent draft (may be empty):\n${existing.slice(0, 3_000)}\n\n${instruction}\n\nEvidence:\n${context.slice(0, MAX_CONTEXT_CHARS)}`;

  const text = detectProvider(apiKey) === 'anthropic'
    ? await draftWithAnthropic(apiKey, userPrompt)
    : await draftWithOpenAI(apiKey, userPrompt);
  if (!text) throw new Error('The AI returned nothing usable.');
  return text;
}

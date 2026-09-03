// AI autocomplete for the hosted editor. Provider shell: one pasted API key,
// routed by prefix — sk-ant-… calls the Anthropic API, other sk-… keys call
// OpenAI — both directly from the browser (each SDK's explicit browser opt-in).
// The SDKs are dynamically imported so neither ships until the AI button is used.
// Repo/PR evidence comes from the GitHub API with the editor's GitHub token.
// Context is capped so a single call never exceeds the input budget.

// ~12k tokens of input context per call — matches the evidence collector's
// own packing budget, so this is a belt-and-braces cap
const MAX_CONTEXT_CHARS = 50_000;

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

// Evidence collection lives in ai/evidence.ts (Stage 0 of the pipeline); this
// wrapper adds the safety policy and keeps the last package for the UI.
import { collectEvidence, describeContext, parseGitHubRepo, parsePullRequest, serializeContext, type RepositoryContext } from './ai/evidence';

// Only repos under these owners may be sent to an external model. Everything
// else (and anything outside github.com — ADO can't be reached at all) is
// refused before a single byte is collected.
const ALLOWED_OWNERS = ['aviman1258'];

let lastContext: RepositoryContext | null = null;

/** One line describing what the most recent draft was grounded in. */
export function describeLastEvidence(): string {
  return lastContext ? describeContext(lastContext) : '';
}

export async function gatherRepoContext(
  token: string,
  repositoryUrl: string,
  pullRequestUrl: string,
): Promise<string> {
  for (const url of [repositoryUrl, pullRequestUrl]) {
    const owner = (parsePullRequest(url) ?? parseGitHubRepo(url))?.owner;
    if (owner && !ALLOWED_OWNERS.includes(owner.toLowerCase())) {
      throw new Error(`For safety, AI drafts only read repositories owned by ${ALLOWED_OWNERS.join(', ')} — ${owner} is not on that list.`);
    }
  }
  const context = await collectEvidence(token, repositoryUrl, pullRequestUrl);
  if (!context.sources.length) throw new Error('Add a repository (or pull request) link first — the AI reads it for context.');
  lastContext = context;
  return serializeContext(context);
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
      throw new Error('That Anthropic API key was rejected — replace it via the connections icon in the header.');
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
    throw new Error("OpenAI blocks direct browser calls. Deploy the repo's proxy/openai-worker.js on Cloudflare Workers (free) and paste its URL in the connections dialog — or use an Anthropic key, which works directly.");
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
      throw new Error('That OpenAI API key was rejected — replace it via the connections icon in the header.');
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
  if (!apiKey) throw new Error('Add an Anthropic or OpenAI API key first — connections icon in the header.');
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

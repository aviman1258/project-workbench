// Browser storage for the AI credentials. One pasted key serves both
// providers: sk-ant-… is Anthropic (called directly from the browser), any
// other sk-… key is OpenAI (which blocks browser CORS, so those calls go
// through the bundled Cloudflare Worker proxy whose URL is stored alongside).

const AI_KEY_STORAGE = 'workbench-ai-key';
const LEGACY_KEY_STORAGE = 'workbench-anthropic-key';
const OPENAI_PROXY_STORAGE = 'workbench-openai-proxy';

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

export function getStoredOpenAiProxy(): string {
  try { return window.localStorage.getItem(OPENAI_PROXY_STORAGE) ?? ''; } catch { return ''; }
}
export function storeOpenAiProxy(url: string) {
  try { window.localStorage.setItem(OPENAI_PROXY_STORAGE, url); } catch { /* private mode */ }
}
export function clearOpenAiProxy() {
  try { window.localStorage.removeItem(OPENAI_PROXY_STORAGE); } catch { /* ignore */ }
}

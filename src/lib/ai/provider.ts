// Model access for the AI drafting flow. completeRaw() sends a prompt and
// returns plain text plus a truncation flag. The tier ('fast' | 'strong')
// keeps model choice decoupled from callers: this module maps it to a model
// per provider.

import { detectProvider, getStoredAnthropicKey, getStoredOpenAiProxy } from '../ai-complete';

export type ModelTier = 'fast' | 'strong';

const MODELS: Record<'anthropic' | 'openai', Record<ModelTier, string>> = {
  anthropic: { fast: 'claude-haiku-4-5-20251001', strong: 'claude-sonnet-5' },
  openai: { fast: 'gpt-4o-mini', strong: 'gpt-4o' },
};

export interface RawCompletion {
  text: string;
  /** the reply was cut off at the output-token limit */
  truncated: boolean;
}

/** Plain text completion; callers that expect long output should check `truncated`. */
export async function completeRaw(system: string, user: string, tier: ModelTier, maxTokens: number): Promise<RawCompletion> {
  const apiKey = getStoredAnthropicKey();
  if (!apiKey) throw new Error('Add an Anthropic or OpenAI API key first — connections icon in the header.');

  if (detectProvider(apiKey) === 'anthropic') {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    try {
      const response = await client.messages.create({
        model: MODELS.anthropic[tier],
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      });
      if (response.stop_reason === 'refusal') throw new Error('The request was declined.');
      const text = response.content
        .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
        .map((block) => block.text)
        .join('')
        .trim();
      return { text, truncated: response.stop_reason === 'max_tokens' };
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

  const proxy = getStoredOpenAiProxy().replace(/\/$/, '');
  if (!proxy) {
    throw new Error("OpenAI blocks direct browser calls. Deploy the repo's proxy/openai-worker.js on Cloudflare Workers (free) and paste its URL in the connections dialog — or use an Anthropic key, which works directly.");
  }
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey, baseURL: `${proxy}/v1`, dangerouslyAllowBrowser: true });
  const response = await client.chat.completions.create({
    model: MODELS.openai[tier],
    max_completion_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  return {
    text: (response.choices?.[0]?.message?.content ?? '').trim(),
    truncated: response.choices?.[0]?.finish_reason === 'length',
  };
}

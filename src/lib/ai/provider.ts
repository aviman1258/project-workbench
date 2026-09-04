// Model access for the AI pipeline. One entry point: completeStructured()
// sends a prompt and returns schema-validated JSON, retrying once with the
// validation errors when the first reply doesn't parse.
//
// The tier ('fast' | 'strong') is how escalation stays decoupled from the
// stages: callers pick a tier, this module maps it to a model per provider.

import type { z } from 'astro/zod';
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

async function completeText(system: string, user: string, tier: ModelTier, maxTokens: number): Promise<string> {
  return (await completeRaw(system, user, tier, maxTokens)).text;
}

/** Pull the JSON object out of a reply that may be fenced or wrapped in prose. */
function extractJson(reply: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(reply);
  const candidate = (fenced ? fenced[1] : reply).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  return start !== -1 && end > start ? candidate.slice(start, end + 1) : candidate;
}

export async function completeStructured<T>(options: {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  tier?: ModelTier;
  maxTokens?: number;
}): Promise<T> {
  const { system, user, schema, tier = 'fast', maxTokens = 3000 } = options;
  const jsonRule = '\n\nReply with a single JSON object only — no prose, no markdown fences, no comments.';

  let reply = await completeText(system + jsonRule, user, tier, maxTokens);
  for (let attempt = 0; attempt < 2; attempt++) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(reply));
    } catch {
      parsed = undefined;
    }
    if (parsed !== undefined) {
      const result = schema.safeParse(parsed);
      if (result.success) return result.data;
      if (attempt === 1) throw new Error(`The AI reply did not match the expected structure: ${result.error.issues[0]?.message ?? 'invalid'}.`);
      reply = await completeText(
        system + jsonRule,
        `${user}\n\nYour previous reply failed validation:\n${result.error.issues.slice(0, 5).map((i) => `- ${i.path.join('.')}: ${i.message}`).join('\n')}\n\nPrevious reply:\n${reply.slice(0, 4000)}\n\nReturn the corrected JSON object only.`,
        tier,
        maxTokens,
      );
    } else {
      if (attempt === 1) throw new Error('The AI reply was not valid JSON.');
      reply = await completeText(system + jsonRule, `${user}\n\nYour previous reply was not valid JSON. Return a single valid JSON object only.`, tier, maxTokens);
    }
  }
  throw new Error('The AI reply could not be parsed.');
}

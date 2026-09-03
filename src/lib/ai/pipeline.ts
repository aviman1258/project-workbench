// The staged demo pipeline. Stage 1 (code investigator) is implemented; the
// later stages (product analyst, demo director) will build on the same shapes.
//
// Ground rules baked into every stage: claims cite evidence source ids from
// the RepositoryContext, uncertainty is labeled (basis / unknowns) instead of
// smoothed over, and UNKNOWN beats invention.

import { z } from 'astro/zod';
import { completeStructured, type ModelTier } from './provider';
import { serializeContext, type EscalationSignals, type RepositoryContext } from './evidence';

export const claimSchema = z.object({
  value: z.string(),
  evidence: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  basis: z.enum(['observed', 'inferred-strong', 'inferred-weak', 'unknown']).default('observed'),
});
export type Claim = z.infer<typeof claimSchema>;

export const changeUnderstandingSchema = z.object({
  summary: z.string(),
  userFacingChanges: z.array(claimSchema).default([]),
  technicalChanges: z.array(claimSchema).default([]),
  affectedFlows: z.array(z.string()).default([]),
  unknowns: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});
export type ChangeUnderstanding = z.infer<typeof changeUnderstandingSchema>;

const INVESTIGATOR_SYSTEM = `You are a code investigator. Your job is to establish WHAT objectively changed, from evidence alone.

Rules:
- Use ONLY the provided evidence. Do not use outside knowledge about the project.
- Every claim's "evidence" array must contain source ids copied exactly from the evidence headers (e.g. "diff:src/foo.ts", "pr:12", "readme").
- "basis" is "observed" when the evidence states it directly, "inferred-strong"/"inferred-weak" when you deduced it, "unknown" when you cannot tell.
- Do NOT infer product motivation or user value — that is a later stage's job. Only state a motivation if the evidence says it explicitly.
- If something cannot be determined, put it in "unknowns" rather than guessing.
- "confidence" is your honest overall confidence in the analysis (0 to 1).`;

/** Stage 1: what objectively changed? */
export async function investigateChanges(
  context: RepositoryContext,
  tier: ModelTier = 'fast',
): Promise<ChangeUnderstanding> {
  const sourceIds = context.sources.map((s) => s.id).join(', ');
  return completeStructured({
    system: INVESTIGATOR_SYSTEM,
    user: `Valid evidence source ids: ${sourceIds}\n\nEvidence:\n${serializeContext(context)}\n\nAnalyze what changed${context.pr ? ` in PR #${context.pr.number}` : ' in this repository'}. Return JSON with this shape:\n{"summary": string, "userFacingChanges": [{"value": string, "evidence": [source ids], "confidence": 0-1, "basis": "observed"|"inferred-strong"|"inferred-weak"|"unknown"}], "technicalChanges": [same shape], "affectedFlows": [string], "unknowns": [string], "confidence": 0-1}`,
    schema: changeUnderstandingSchema,
    tier,
    maxTokens: 3000,
  });
}

/** Human-readable reasons this analysis might deserve the stronger model. */
export function escalationReasons(signals: EscalationSignals, result?: { confidence: number; unknowns: string[] }): string[] {
  const reasons: string[] = [];
  if (signals.emptyPrBody) reasons.push('the PR has no description');
  if (signals.noLinkedIssue) reasons.push('no linked issue');
  if (signals.largePr) reasons.push('the PR is unusually large');
  if (signals.manyAreasTouched) reasons.push('many unrelated areas are touched');
  if (result && result.confidence < 0.5) reasons.push('the analysis reports low confidence');
  if (result && result.unknowns.length > 3) reasons.push('many unknowns remain');
  return reasons;
}

// --- Stage 2: why does this matter? ---

export const productUnderstandingSchema = z.object({
  problem: claimSchema.optional(),
  user: claimSchema.optional(),
  previousBehavior: claimSchema.optional(),
  newBehavior: claimSchema.optional(),
  value: claimSchema.optional(),
  workflow: claimSchema.optional(),
  unknowns: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});
export type ProductUnderstanding = z.infer<typeof productUnderstandingSchema>;

const ANALYST_SYSTEM = `You are a product analyst. Stage 1 established WHAT changed; your job is to establish WHY it matters — the user, the problem, previous vs new behavior, the value.

Rules:
- Use ONLY the Stage 1 analysis and the evidence excerpts provided.
- Every field is optional: when the evidence does not support a conclusion, OMIT the field and add a line to "unknowns" instead. "Product motivation: insufficient evidence" is a better answer than an invented story.
- "basis" is "observed" only when a PR description, issue, README, or comment states it directly; use "inferred-strong"/"inferred-weak" for deductions from the code changes.
- Every claim's "evidence" array must contain source ids copied exactly from the provided list.
- "confidence" is your honest overall confidence (0 to 1).`;

// Stage 2 gets the prose evidence (intent lives there), not the raw diffs —
// Stage 1 already distilled those.
const PROSE_KINDS = new Set(['pr', 'issue', 'readme', 'commits', 'reviews', 'repo']);

export async function analyzeProduct(
  context: RepositoryContext,
  changes: ChangeUnderstanding,
  tier: ModelTier = 'fast',
): Promise<ProductUnderstanding> {
  const prose = context.sources.filter((s) => PROSE_KINDS.has(s.kind));
  const sourceIds = prose.map((s) => s.id).join(', ');
  return completeStructured({
    system: ANALYST_SYSTEM,
    user: `Valid evidence source ids: ${sourceIds}\n\nStage 1 analysis (established facts):\n${JSON.stringify(changes, null, 1)}\n\nEvidence excerpts:\n${prose.map((s) => `## ${s.kind}: ${s.ref}\n${s.text}`).join('\n\n')}\n\nInfer the product story. Return JSON with this shape (omit any field the evidence cannot support):\n{"problem": {"value": string, "evidence": [source ids], "confidence": 0-1, "basis": "observed"|"inferred-strong"|"inferred-weak"}, "user": …, "previousBehavior": …, "newBehavior": …, "value": …, "workflow": …, "unknowns": [string], "confidence": 0-1}`,
    schema: productUnderstandingSchema,
    tier,
    maxTokens: 2000,
  });
}

// --- Stage 3: how should this be demonstrated? ---

export const demoStepSchema = z.object({
  action: z.string(),
  expectedState: z.string(),
  narration: z.string(),
  evidence: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});
export type DemoStep = z.infer<typeof demoStepSchema>;

export const demoPlanSchema = z.object({
  title: z.string(),
  premise: z.string(),
  audience: z.enum(['engineering', 'product', 'executive', 'general']).default('general'),
  prerequisites: z.array(z.string()).default([]),
  steps: z.array(demoStepSchema).min(1),
  talkingPoints: z.array(z.string()).default([]),
  technicalNotes: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});
export type DemoPlan = z.infer<typeof demoPlanSchema>;

const DIRECTOR_SYSTEM = `You are a demo director. Turn the established change analysis and product understanding into a demo plan a person can perform.

Rules:
- You may ONLY demonstrate behavior the Stage 1/Stage 2 analyses established. You have no other knowledge of this software.
- The demo tells a story: problem → previous experience → action → new behavior → value. Not a list of code changes.
- Each step is one concrete action, the state the audience should observe, and one or two sentences of narration to speak.
- Carry the "evidence" source ids forward from the claims a step demonstrates.
- Anything uncertain, unverified, or established only weakly goes in "limitations" — never silently into a step.
- "prerequisites" are what must be true before starting (environment, data, login).`;

export async function directDemo(
  changes: ChangeUnderstanding,
  product: ProductUnderstanding,
  tier: ModelTier = 'fast',
): Promise<DemoPlan> {
  return completeStructured({
    system: DIRECTOR_SYSTEM,
    user: `Stage 1 — what changed:\n${JSON.stringify(changes, null, 1)}\n\nStage 2 — why it matters:\n${JSON.stringify(product, null, 1)}\n\nCreate the demo plan. Return JSON with this shape:\n{"title": string, "premise": string, "audience": "engineering"|"product"|"executive"|"general", "prerequisites": [string], "steps": [{"action": string, "expectedState": string, "narration": string, "evidence": [source ids], "confidence": 0-1}], "talkingPoints": [string], "technicalNotes": [string], "limitations": [string], "confidence": 0-1}`,
    schema: demoPlanSchema,
    tier,
    maxTokens: 3000,
  });
}

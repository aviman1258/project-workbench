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
export function escalationReasons(signals: EscalationSignals, result?: ChangeUnderstanding): string[] {
  const reasons: string[] = [];
  if (signals.emptyPrBody) reasons.push('the PR has no description');
  if (signals.noLinkedIssue) reasons.push('no linked issue');
  if (signals.largePr) reasons.push('the PR is unusually large');
  if (signals.manyAreasTouched) reasons.push('many unrelated areas are touched');
  if (result && result.confidence < 0.5) reasons.push('the analysis reports low confidence');
  if (result && result.unknowns.length > 3) reasons.push('many unknowns remain');
  return reasons;
}

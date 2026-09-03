// Deterministic renderers over the pipeline's structured output. These are
// template functions, not AI calls — every representation comes from the SAME
// underlying analysis, so they cannot drift from it or invent anything new.

import type { ChangeUnderstanding, Claim, DemoPlan, ProductUnderstanding } from './pipeline';

export type RenderKind = 'script' | 'checklist' | 'short' | 'story' | 'technical';

export const RENDER_LABELS: Record<RenderKind, string> = {
  script: 'Demo script',
  checklist: 'Checklist',
  short: '60-second version',
  story: 'Product story',
  technical: 'Technical explanation',
};

const said = (claim?: Claim) => claim?.value;
const bullet = (items: string[]) => items.map((item) => `• ${item}`).join('\n');

/** A natural script to speak while demonstrating. */
export function demoScript(plan: DemoPlan): string {
  const parts: string[] = [`# ${plan.title}`, '', plan.premise, ''];
  if (plan.prerequisites.length) parts.push(`Before we start: ${plan.prerequisites.join('; ')}.`, '');
  plan.steps.forEach((step, index) => {
    parts.push(`${index + 1}. ${step.narration}`, `   (${step.action} — the audience sees: ${step.expectedState})`, '');
  });
  if (plan.talkingPoints.length) parts.push('To close:', bullet(plan.talkingPoints));
  if (plan.limitations.length) parts.push('', 'If asked, be upfront about:', bullet(plan.limitations));
  return parts.join('\n').trim();
}

/** Concrete actions only: do X → observe Y. */
export function demoChecklist(plan: DemoPlan): string {
  const parts: string[] = [`# ${plan.title} — checklist`, ''];
  if (plan.prerequisites.length) parts.push('Prepare:', bullet(plan.prerequisites), '');
  parts.push(...plan.steps.map((step, index) => `${index + 1}. ${step.action} → ${step.expectedState}`));
  return parts.join('\n').trim();
}

/** The 60–90 second cut: premise, the three biggest beats, the value line. */
export function shortDemo(plan: DemoPlan, product: ProductUnderstanding): string {
  const beats = [...plan.steps].sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  const inOrder = plan.steps.filter((step) => beats.includes(step));
  const parts: string[] = [plan.premise, '', ...inOrder.map((step) => step.narration)];
  const value = said(product.value);
  if (value) parts.push('', `The takeaway: ${value}`);
  return parts.join('\n').trim();
}

/** Problem → insight → decision → implementation → result. */
export function productStory(changes: ChangeUnderstanding, product: ProductUnderstanding, plan: DemoPlan): string {
  const gap = '(insufficient evidence)';
  return [
    `# ${plan.title}`,
    '',
    `**Problem** — ${said(product.problem) ?? gap}`,
    `**Who it affects** — ${said(product.user) ?? gap}`,
    `**Before** — ${said(product.previousBehavior) ?? gap}`,
    `**Now** — ${said(product.newBehavior) ?? changes.summary}`,
    `**Value** — ${said(product.value) ?? gap}`,
    ...(product.unknowns.length ? ['', 'Open questions:', bullet(product.unknowns)] : []),
  ].join('\n').trim();
}

/** For an engineering audience: what actually changed, and the caveats. */
export function technicalExplanation(changes: ChangeUnderstanding, plan: DemoPlan): string {
  const parts: string[] = [`# ${plan.title} — technical notes`, '', changes.summary, ''];
  if (changes.technicalChanges.length) {
    parts.push('Changes:', ...changes.technicalChanges.map((claim) => `• ${claim.value} [${claim.evidence.join(', ')}]`), '');
  }
  if (changes.affectedFlows.length) parts.push(`Affected flows: ${changes.affectedFlows.join(' · ')}`, '');
  if (plan.technicalNotes.length) parts.push('Notes:', bullet(plan.technicalNotes), '');
  const caveats = [...changes.unknowns, ...plan.limitations];
  if (caveats.length) parts.push('Caveats:', bullet(caveats));
  return parts.join('\n').trim();
}

export function renderAll(changes: ChangeUnderstanding, product: ProductUnderstanding, plan: DemoPlan): Record<RenderKind, string> {
  return {
    script: demoScript(plan),
    checklist: demoChecklist(plan),
    short: shortDemo(plan, product),
    story: productStory(changes, product, plan),
    technical: technicalExplanation(changes, plan),
  };
}

import { z } from 'astro/zod';

export const projectStatuses = ['idea', 'dev', 'review', 'delivered'] as const;
export const privacyLevels = ['private', 'public'] as const;

export const projectMetadataSchema = z.object({
  id: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a lowercase kebab-case slug'),
  name: z.string().min(1),
  description: z.string().min(1),
  why: z.string().min(1),
  status: z.enum(projectStatuses),
  privacy: z.enum(privacyLevels),
  startDate: z.coerce.date(),
  updatedDate: z.coerce.date(),
  artifactOrder: z.array(z.string().min(1)).optional(),
  featuredArtifact: z.string().min(1).optional(),
  repositoryUrl: z.string().url().optional(),
  pullRequestUrl: z.string().url().optional(),
  // soft delete: the record stays in git, the site stops rendering it
  deleted: z.boolean().optional(),
});

const dateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const projectDraftSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  why: z.string().trim().min(1).max(3000),
  status: z.enum(projectStatuses),
  privacy: z.enum(privacyLevels),
  startDate: dateInput,
  updatedDate: dateInput.optional(),
});

export const projectUpdateSchema = projectDraftSchema.omit({ updatedDate: true });

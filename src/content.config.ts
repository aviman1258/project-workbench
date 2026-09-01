import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { projectMetadataSchema } from './lib/project-schema';

export { privacyLevels, projectStatuses } from './lib/project-schema';

const projects = defineCollection({
  loader: glob({ pattern: '**/index.md', base: './src/content/projects' }),
  schema: projectMetadataSchema,
});

export const collections = { projects };

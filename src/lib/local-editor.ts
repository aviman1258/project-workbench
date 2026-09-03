import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';
import { parse, stringify } from 'yaml';
import {
  projectDraftSchema,
  projectMetadataSchema,
  projectUpdateSchema,
} from './project-schema';
import {
  AiFillError,
  fillProjectFromRepository,
  startRepositoryLogin,
} from './codex-ai-fill';
import {
  createDeviceAuthOptions,
  DeviceAuthError,
  deviceUnlockCookie,
  requireDeviceUnlock,
  verifyDeviceAuth,
} from './device-auth';

const defaultProjectsRoot = path.resolve('src/content/projects');
const maxJsonBytes = 40 * 1024 * 1024;
const maxArtifactBytes = 25 * 1024 * 1024;
const artifactMimeTypes: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

class EditorError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly field?: string,
  ) {
    super(message);
  }
}

const fieldLabels: Record<string, string> = {
  name: 'Project name',
  description: 'Description',
  why: 'Why it was built',
  status: 'Status',
  privacy: 'Privacy',
  startDate: 'Start date',
  artifact: 'Artifact file',
  repositoryUrl: 'Repository address',
};

function validationError(
  issues: readonly { message: string; path: readonly PropertyKey[]; code: string }[],
  fallback: string,
): EditorError {
  const issue = issues[0];
  const field = typeof issue?.path[0] === 'string' ? issue.path[0] : undefined;
  const label = field ? fieldLabels[field] ?? field.replaceAll('-', ' ') : undefined;
  const genericMessage = issue?.message.startsWith('Invalid input: expected');
  const message = genericMessage && label ? `${label} is required.` : issue?.message ?? fallback;
  return new EditorError(message, 400, field);
}

function sendJson(response: ServerResponse, status: number, value: unknown) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(value));
}

function isLocalRequest(request: IncomingMessage): boolean {
  const remoteAddress = request.socket.remoteAddress ?? '';
  const isLoopback =
    remoteAddress === '::1' ||
    remoteAddress === '127.0.0.1' ||
    remoteAddress.startsWith('::ffff:127.');
  if (!isLoopback) return false;

  const origin = request.headers.origin;
  if (!origin) return true;

  try {
    const hostname = new URL(origin).hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxJsonBytes) throw new EditorError('Request is too large.', 413);
    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new EditorError('Request body must be valid JSON.');
  }
}

function parseFrontmatter(source: string): Record<string, unknown> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  if (!match) throw new EditorError('Project index.md is missing YAML front matter.', 500);
  return parse(match[1]) as Record<string, unknown>;
}

async function touchProjectUpdated(projectRoot: string, patch: Record<string, unknown> = {}) {
  const indexPath = path.join(projectRoot, 'index.md');
  const source = await readFile(indexPath, 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) throw new EditorError('Project index.md is missing YAML front matter.', 500);
  const metadata: Record<string, unknown> = {
    ...(parse(match[1]) as Record<string, unknown>),
    ...patch,
    updatedDate: new Date().toISOString().slice(0, 10),
  };
  for (const key of Object.keys(metadata)) {
    if (metadata[key] === undefined) delete metadata[key];
  }
  projectMetadataSchema.parse(metadata);
  const body = source.slice(match[0].length).replace(/^\r?\n/, '');
  await writeFile(indexPath, `---\n${stringify(metadata, { lineWidth: 0 }).trimEnd()}\n---\n\n${body}`, 'utf8');
}

async function listProjectFolders(projectsRoot: string) {
  const entries = await readdir(projectsRoot, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'));
}

async function findProjectFolder(projectsRoot: string, slug: string): Promise<string> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new EditorError('Invalid project slug.');
  }

  for (const entry of await listProjectFolders(projectsRoot)) {
    try {
      const source = await readFile(path.join(projectsRoot, entry.name, 'index.md'), 'utf8');
      if (parseFrontmatter(source).slug === slug) return path.join(projectsRoot, entry.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  throw new EditorError('Project not found.', 404);
}

async function isPrivateProject(projectsRoot: string, slug: string): Promise<boolean> {
  const projectRoot = await findProjectFolder(projectsRoot, slug);
  const source = await readFile(path.join(projectRoot, 'index.md'), 'utf8');
  return parseFrontmatter(source).privacy === 'private';
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function createProject(projectsRoot: string, rawInput: unknown) {
  const parsedDraft = projectDraftSchema.safeParse(rawInput);
  if (!parsedDraft.success) {
    throw validationError(parsedDraft.error.issues, 'Project details are invalid.');
  }

  const draft = parsedDraft.data;
  const slug = slugify(draft.name);
  if (!slug) throw new EditorError('Project name needs at least one letter or number.', 400, 'name');
  const folders = await listProjectFolders(projectsRoot);

  for (const folder of folders) {
    const sourcePath = path.join(projectsRoot, folder.name, 'index.md');
    try {
      const metadata = parseFrontmatter(await readFile(sourcePath, 'utf8'));
      if (metadata.slug === slug) throw new EditorError('A project with that name already exists.', 409, 'name');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  const numericIds = folders
    .map((folder) => /^(\d+)(?:-|$)/.exec(folder.name)?.[1])
    .filter((id): id is string => Boolean(id))
    .map(Number);
  const id = String((numericIds.length ? Math.max(...numericIds) : 0) + 1).padStart(3, '0');
  const folderName = `${id}-${slug}`;
  const projectRoot = path.join(projectsRoot, folderName);
  const artifactsRoot = path.join(projectRoot, 'artifacts');

  const metadata = {
    id,
    slug,
    name: draft.name,
    description: draft.description,
    why: draft.why,
    status: draft.status,
    privacy: draft.privacy,
    startDate: draft.startDate,
    updatedDate: draft.updatedDate ?? draft.startDate,
  };

  projectMetadataSchema.parse(metadata);
  await mkdir(artifactsRoot, { recursive: true });
  const frontmatter = stringify(metadata, { lineWidth: 0 }).trimEnd();
  await writeFile(path.join(projectRoot, 'index.md'), `---\n${frontmatter}\n---\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });

  return { id, slug, folder: folderName };
}

async function updateProject(projectsRoot: string, slug: string, rawInput: unknown) {
  const parsedUpdate = projectUpdateSchema.safeParse(rawInput);
  if (!parsedUpdate.success) {
    throw validationError(parsedUpdate.error.issues, 'Project details are invalid.');
  }

  const projectRoot = await findProjectFolder(projectsRoot, slug);
  const indexPath = path.join(projectRoot, 'index.md');
  const source = await readFile(indexPath, 'utf8');
  const existing = parseFrontmatter(source);
  const update = parsedUpdate.data;
  const metadata = {
    id: existing.id,
    slug: existing.slug,
    name: update.name,
    description: update.description,
    why: update.why,
    status: update.status,
    privacy: update.privacy,
    startDate: update.startDate,
    updatedDate: new Date().toISOString().slice(0, 10),
    ...(existing.artifactOrder !== undefined ? { artifactOrder: existing.artifactOrder } : {}),
    ...(existing.featuredArtifact !== undefined ? { featuredArtifact: existing.featuredArtifact } : {}),
    ...(existing.repositoryUrl !== undefined ? { repositoryUrl: existing.repositoryUrl } : {}),
    ...(existing.pullRequestUrl !== undefined ? { pullRequestUrl: existing.pullRequestUrl } : {}),
  };

  projectMetadataSchema.parse(metadata);
  const frontmatter = stringify(metadata, { lineWidth: 0 }).trimEnd();
  const bodyMatch = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(source);
  const legacyBody = bodyMatch ? source.slice(bodyMatch[0].length).replace(/^\r?\n/, '') : '';
  await writeFile(indexPath, `---\n${frontmatter}\n---\n${legacyBody ? `\n${legacyBody}` : ''}`, 'utf8');
  return { slug };
}

function safeFilename(filename: string): string {
  const original = path.basename(filename.trim());
  const extension = path.extname(original).toLowerCase();
  const stem = path.basename(original, path.extname(original)).replace(/[^a-zA-Z0-9._-]+/g, '-');
  if (!stem || !extension) {
    throw new EditorError('Artifacts need a filename with an extension.', 400, 'artifact');
  }
  return `${stem}${extension}`;
}

async function addArtifact(projectsRoot: string, slug: string, rawInput: unknown) {
  if (!rawInput || typeof rawInput !== 'object') throw new EditorError('Artifact details are invalid.', 400, 'artifact');
  const input = rawInput as Record<string, unknown>;
  if (typeof input.filename !== 'string' || typeof input.data !== 'string') {
    throw new EditorError('Artifact filename and file data are required.', 400, 'artifact');
  }

  const projectRoot = await findProjectFolder(projectsRoot, slug);
  const artifactsRoot = path.join(projectRoot, 'artifacts');
  const filename = safeFilename(input.filename);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input.data)) throw new EditorError('Artifact data is invalid.', 400, 'artifact');
  const contents = Buffer.from(input.data, 'base64');
  if (!contents.length) throw new EditorError('The selected artifact is empty.', 400, 'artifact');
  if (contents.length > maxArtifactBytes) throw new EditorError('Artifacts must be 25 MB or smaller.', 413, 'artifact');

  await mkdir(artifactsRoot, { recursive: true });
  const extension = path.extname(filename);
  const stem = path.basename(filename, extension);
  let finalName = filename;
  let suffix = 2;
  const existing = new Set(await readdir(artifactsRoot));
  while (existing.has(finalName)) finalName = `${stem}-${suffix++}${extension}`;

  await writeFile(path.join(artifactsRoot, finalName), contents, { flag: 'wx' });
  // the first artifact a project gets becomes its featured artifact
  const metadata = parseFrontmatter(await readFile(path.join(projectRoot, 'index.md'), 'utf8'));
  await touchProjectUpdated(projectRoot, metadata.featuredArtifact ? {} : { featuredArtifact: finalName });
  return { filename: finalName };
}

async function listArtifactFiles(projectRoot: string): Promise<Set<string>> {
  try {
    return new Set(await readdir(path.join(projectRoot, 'artifacts')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Set();
    throw error;
  }
}

function artifactNameOrThrow(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new EditorError('Artifact filename is required.', 400, 'artifact');
  const name = value.trim();
  if (path.basename(name) !== name || name.includes('\\')) throw new EditorError('Invalid artifact filename.', 400, 'artifact');
  return name;
}

async function reorderArtifacts(projectsRoot: string, slug: string, rawInput: unknown) {
  if (!rawInput || typeof rawInput !== 'object' || !Array.isArray((rawInput as Record<string, unknown>).order)) {
    throw new EditorError('An ordered list of artifact filenames is required.', 400, 'artifact');
  }

  const projectRoot = await findProjectFolder(projectsRoot, slug);
  const existing = await listArtifactFiles(projectRoot);
  const order: string[] = [];
  for (const entry of (rawInput as { order: unknown[] }).order) {
    const name = artifactNameOrThrow(entry);
    if (!existing.has(name)) throw new EditorError(`No artifact named "${name}" exists.`, 404, 'artifact');
    if (!order.includes(name)) order.push(name);
  }

  await touchProjectUpdated(projectRoot, { artifactOrder: order });
  return { order };
}

async function deleteArtifact(projectsRoot: string, slug: string, rawInput: unknown) {
  if (!rawInput || typeof rawInput !== 'object') throw new EditorError('Artifact details are invalid.', 400, 'artifact');
  const filename = artifactNameOrThrow((rawInput as Record<string, unknown>).filename);

  const projectRoot = await findProjectFolder(projectsRoot, slug);
  const existing = await listArtifactFiles(projectRoot);
  if (!existing.has(filename)) throw new EditorError(`No artifact named "${filename}" exists.`, 404, 'artifact');

  await rm(path.join(projectRoot, 'artifacts', filename));

  const metadata = parseFrontmatter(await readFile(path.join(projectRoot, 'index.md'), 'utf8'));
  const currentOrder = Array.isArray(metadata.artifactOrder) ? (metadata.artifactOrder as string[]) : undefined;
  const patch: Record<string, unknown> = currentOrder
    ? { artifactOrder: currentOrder.filter((name) => name !== filename) }
    : {};
  // deleting the featured artifact promotes the next one (display order first)
  if (metadata.featuredArtifact === filename) {
    const remaining = await listArtifactFiles(projectRoot);
    const ordered = (patch.artifactOrder as string[] | undefined)?.filter((name) => remaining.has(name)) ?? [];
    patch.featuredArtifact = ordered[0] ?? [...remaining].sort()[0] ?? undefined;
  }
  await touchProjectUpdated(projectRoot, patch);
  return { deleted: filename };
}

async function featureArtifact(projectsRoot: string, slug: string, rawInput: unknown) {
  if (!rawInput || typeof rawInput !== 'object') throw new EditorError('Artifact details are invalid.', 400, 'artifact');
  const filename = artifactNameOrThrow((rawInput as Record<string, unknown>).filename);

  const projectRoot = await findProjectFolder(projectsRoot, slug);
  const existing = await listArtifactFiles(projectRoot);
  if (!existing.has(filename)) throw new EditorError(`No artifact named "${filename}" exists.`, 404, 'artifact');

  await touchProjectUpdated(projectRoot, { featuredArtifact: filename });
  return { featured: filename };
}

export function localEditorPlugin(projectsRoot = defaultProjectsRoot): Plugin {
  return {
    name: 'builder-portfolio-local-editor',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        // WebAuthn requires a domain name as the relying-party ID, so device unlock
        // breaks when the app is opened via an IP literal. Redirect to localhost.
        const hostHeader = request.headers.host ?? '';
        const hostMatch = /^(127\.0\.0\.1|\[::1\])(:\d+)?$/.exec(hostHeader);
        if (hostMatch) {
          response.statusCode = 307;
          response.setHeader('Location', `http://localhost${hostMatch[2] ?? ''}${request.url ?? '/'}`);
          response.setHeader('Cache-Control', 'no-store');
          response.end();
          return;
        }

        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
        const projectPageMatch = /^\/projects\/([^/]+)\/?$/.exec(pathname);
        if (projectPageMatch && (request.method === 'GET' || request.method === 'HEAD')) {
          try {
            const slug = decodeURIComponent(projectPageMatch[1]);
            if (await isPrivateProject(projectsRoot, slug)) requireDeviceUnlock(request);
          } catch (error) {
            if (error instanceof DeviceAuthError) {
              response.statusCode = 302;
              response.setHeader('Location', `/?unlock=${encodeURIComponent(projectPageMatch[1])}`);
              response.setHeader('Cache-Control', 'no-store');
              response.end();
              return;
            }
            if (error instanceof EditorError && error.status === 404) return next();
            throw error;
          }
        }

        const artifactMatch = /^\/project-artifacts\/([^/]+)\/([^/]+)$/.exec(pathname);
        if (artifactMatch) {
          if (!isLocalRequest(request)) {
            sendJson(response, 403, { error: 'Project artifacts are available only from localhost.' });
            return;
          }
          if (request.method !== 'GET' && request.method !== 'HEAD') {
            sendJson(response, 405, { error: 'Method not allowed.' });
            return;
          }

          try {
            const slug = decodeURIComponent(artifactMatch[1]);
            const filename = decodeURIComponent(artifactMatch[2]);
            if (path.basename(filename) !== filename || filename.includes('\\')) {
              throw new EditorError('Invalid artifact path.', 400);
            }
            const extension = path.extname(filename).toLowerCase();
            const mimeType = artifactMimeTypes[extension] ?? 'application/octet-stream';
            const projectRoot = await findProjectFolder(projectsRoot, slug);
            if (await isPrivateProject(projectsRoot, slug)) requireDeviceUnlock(request);
            const contents = await readFile(path.join(projectRoot, 'artifacts', filename));
            response.statusCode = 200;
            response.setHeader('Content-Type', mimeType);
            response.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(filename)}`);
            response.setHeader('Cache-Control', 'no-store');
            response.setHeader('Content-Length', contents.length);
            response.end(request.method === 'HEAD' ? undefined : contents);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
              sendJson(response, 404, { error: 'Artifact not found.' });
            } else if (error instanceof EditorError || error instanceof DeviceAuthError) {
              sendJson(response, error.status, { error: error.message });
            } else {
              server.config.logger.error(error instanceof Error ? error.stack ?? error.message : String(error));
              sendJson(response, 500, { error: 'The artifact could not be opened.' });
            }
          }
          return;
        }

        if (!pathname.startsWith('/api/local/')) return next();

        if (!isLocalRequest(request)) {
          sendJson(response, 403, { error: 'The editing API is available only from localhost.' });
          return;
        }
        if (request.method !== 'POST') {
          sendJson(response, 405, { error: 'Method not allowed.' });
          return;
        }

        try {
          const body = await readJson(request);
          if (pathname === '/api/local/projects') {
            requireDeviceUnlock(request);
            sendJson(response, 201, await createProject(projectsRoot, body));
            return;
          }

          if (pathname === '/api/local/device-auth/status') {
            requireDeviceUnlock(request);
            sendJson(response, 200, { verified: true });
            return;
          }

          if (pathname === '/api/local/device-auth/options') {
            sendJson(response, 200, await createDeviceAuthOptions(request));
            return;
          }

          if (pathname === '/api/local/device-auth/verify') {
            const verification = await verifyDeviceAuth(request, body);
            response.setHeader('Set-Cookie', deviceUnlockCookie(request, verification.token));
            sendJson(response, 200, verification);
            return;
          }

          if (pathname === '/api/local/repository-fill') {
            sendJson(response, 200, await fillProjectFromRepository(body));
            return;
          }

          if (pathname === '/api/local/repository-auth') {
            sendJson(response, 200, await startRepositoryLogin(body));
            return;
          }

          const projectMatch = /^\/api\/local\/projects\/([^/]+)$/.exec(pathname);
          if (projectMatch) {
            const slug = decodeURIComponent(projectMatch[1]);
            if (await isPrivateProject(projectsRoot, slug)) requireDeviceUnlock(request);
            sendJson(response, 200, await updateProject(projectsRoot, slug, body));
            return;
          }

          const uploadMatch = /^\/api\/local\/projects\/([^/]+)\/artifacts$/.exec(pathname);
          if (uploadMatch) {
            const slug = decodeURIComponent(uploadMatch[1]);
            if (await isPrivateProject(projectsRoot, slug)) requireDeviceUnlock(request);
            sendJson(response, 201, await addArtifact(projectsRoot, slug, body));
            return;
          }

          const orderMatch = /^\/api\/local\/projects\/([^/]+)\/artifacts\/order$/.exec(pathname);
          if (orderMatch) {
            const slug = decodeURIComponent(orderMatch[1]);
            if (await isPrivateProject(projectsRoot, slug)) requireDeviceUnlock(request);
            sendJson(response, 200, await reorderArtifacts(projectsRoot, slug, body));
            return;
          }

          const featureMatch = /^\/api\/local\/projects\/([^/]+)\/artifacts\/feature$/.exec(pathname);
          if (featureMatch) {
            const slug = decodeURIComponent(featureMatch[1]);
            if (await isPrivateProject(projectsRoot, slug)) requireDeviceUnlock(request);
            sendJson(response, 200, await featureArtifact(projectsRoot, slug, body));
            return;
          }

          const removeMatch = /^\/api\/local\/projects\/([^/]+)\/artifacts\/delete$/.exec(pathname);
          if (removeMatch) {
            const slug = decodeURIComponent(removeMatch[1]);
            if (await isPrivateProject(projectsRoot, slug)) requireDeviceUnlock(request);
            sendJson(response, 200, await deleteArtifact(projectsRoot, slug, body));
            return;
          }

          sendJson(response, 404, { error: 'Editor endpoint not found.' });
        } catch (error) {
          if (error instanceof EditorError || error instanceof AiFillError || error instanceof DeviceAuthError) {
            const field = error instanceof EditorError ? error.field : undefined;
            const details = error instanceof AiFillError ? error.details : undefined;
            sendJson(response, error.status, { error: error.message, ...(field ? { field } : {}), ...details });
            return;
          }
          server.config.logger.error(error instanceof Error ? error.stack ?? error.message : String(error));
          sendJson(response, 500, { error: 'The file could not be saved.' });
        }
      });
    },
  };
}

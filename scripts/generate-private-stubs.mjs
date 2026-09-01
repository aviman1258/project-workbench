// Runs in the Pages deploy before `astro build` (PUBLIC_ONLY=1). Reads the private
// vault repo with PRIVATE_REPO_TOKEN and writes locked stub projects into
// src/content/projects/: real id/status/dates so the card is honest, but the name,
// description, and why are generic — the real content never enters the public build.
// The locked page fetches it from the vault client-side after GitHub authentication.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OWNER = 'aviman1258';
const VAULT = 'workbench-private';
const token = process.env.PRIVATE_REPO_TOKEN;

if (!token) {
  console.log('[private-stubs] PRIVATE_REPO_TOKEN not set — building without private stubs.');
  process.exit(0);
}

const gh = async (apiPath) => {
  const response = await fetch(`https://api.github.com${apiPath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) throw new Error(`GitHub ${response.status} for ${apiPath}`);
  return response.json();
};

const folders = (await gh(`/repos/${OWNER}/${VAULT}/contents/projects`))
  .filter((entry) => entry.type === 'dir')
  .map((entry) => entry.name);

for (const folder of folders) {
  const file = await gh(`/repos/${OWNER}/${VAULT}/contents/projects/${encodeURIComponent(folder)}/index.md`);
  const text = Buffer.from(String(file.content), 'base64').toString('utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) { console.warn(`[private-stubs] ${folder}/index.md has no front matter, skipping`); continue; }
  const pick = (key) => /^["']?(.*?)["']?$/.exec((new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(match[1])?.[1] ?? '').trim())?.[1] ?? '';
  const id = pick('id');
  const status = pick('status') || 'dev';
  const startDate = pick('startDate');
  const updatedDate = pick('updatedDate') || startDate;
  if (!id || !startDate) { console.warn(`[private-stubs] ${folder} missing id/startDate, skipping`); continue; }

  const stubDir = path.resolve(`src/content/projects/${id}-private-stub`);
  await mkdir(path.join(stubDir, 'artifacts'), { recursive: true });
  const stub = `---
id: "${id}"
slug: private-${id}
name: Private Project
description: This project is private. Connect GitHub with an authorized account to view it.
why: This project is private. Connect GitHub with an authorized account to view it.
status: ${status}
privacy: private
startDate: ${startDate}
updatedDate: ${updatedDate}
---
`;
  await writeFile(path.join(stubDir, 'index.md'), stub, 'utf8');
  console.log(`[private-stubs] wrote stub for ${id} (${folder})`);
}

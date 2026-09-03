// Converts every PowerPoint artifact to PDF and removes the original.
// Runs in CI (see .github/workflows/convert-pptx.yml) with LibreOffice
// installed; front-matter references (artifactOrder, featuredArtifact)
// are renamed along with the file.
//
// PROJECTS_ROOT: folder holding <id>-<slug>/artifacts/ trees
//   - public repo: src/content/projects (default)
//   - vault repo:  projects

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.env.PROJECTS_ROOT ?? 'src/content/projects';
const soffice = process.env.SOFFICE ?? 'soffice';

const converted = [];
for (const dir of readdirSync(root, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  const artifacts = path.join(root, dir.name, 'artifacts');
  if (!existsSync(artifacts)) continue;

  for (const file of readdirSync(artifacts)) {
    if (!/\.pptx?$/i.test(file)) continue;
    const source = path.join(artifacts, file);
    const pdfName = file.replace(/\.pptx?$/i, '.pdf');
    console.log(`converting ${source} -> ${pdfName}`);
    try {
      execFileSync(soffice, ['--headless', '--convert-to', 'pdf', '--outdir', artifacts, source], { stdio: 'inherit', timeout: 180_000 });
    } catch (error) {
      console.error(`conversion failed for ${source}: ${error.message}`);
      continue;
    }
    if (!existsSync(path.join(artifacts, pdfName))) {
      console.error(`LibreOffice produced no output for ${source}`);
      continue;
    }
    rmSync(source);

    const indexPath = path.join(root, dir.name, 'index.md');
    if (existsSync(indexPath)) {
      const text = readFileSync(indexPath, 'utf8');
      const next = text.split(file).join(pdfName);
      if (next !== text) writeFileSync(indexPath, next);
    }
    converted.push(`${dir.name}/${file}`);
  }
}

console.log(converted.length ? `converted: ${converted.join(', ')}` : 'nothing to convert');

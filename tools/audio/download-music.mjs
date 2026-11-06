// Temporary signed URLs are supplied in a local, untracked manifest, never in source.
import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
const entries = JSON.parse(await readFile(process.argv[2], 'utf8'));
const dir = resolve('assets/audio');
await Promise.all(Array.from({ length: 4 }, async () => {
  while (entries.length) {
    const { file, url } = entries.shift();
    if (basename(file) !== file || !file.endsWith('.mp3')) throw new Error('Invalid asset name');
    const path = resolve(dir, file);
    try { await access(path); console.log('exists', file); continue; } catch {}
    const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length < 50000) throw new Error(`${file}: invalid audio length`);
    await writeFile(path, bytes); console.log('saved', file, bytes.length);
  }
}));

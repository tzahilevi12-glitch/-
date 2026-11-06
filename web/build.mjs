// Bundles the web app into web/dist (served by Express). `--watch` rebuilds on change.
import { build, context } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const outdir = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

const options = {
  entryPoints: { app: path.join(root, 'src/main.tsx') }, // CSS is imported by main.tsx → dist/app.css
  outdir,
  bundle: true,
  format: 'esm',
  target: 'es2022',
  jsx: 'automatic',
  minify: !watch,
  sourcemap: watch,
  nodePaths: process.env.NODE_PATH ? process.env.NODE_PATH.split(path.delimiter) : [],
  logLevel: 'info',
};

await mkdir(outdir, { recursive: true });
// Stamp the asset links with the build time so browsers always load the newest version after a deploy.
const stamp = Date.now().toString(36);
const html = (await readFile(path.join(root, 'index.html'), 'utf8'))
  .replace('/app.css"', `/app.css?v=${stamp}"`)
  .replace('/app.js"', `/app.js?v=${stamp}"`);
await writeFile(path.join(outdir, 'index.html'), html);
if (watch) await (await context(options)).watch();
else await build(options);

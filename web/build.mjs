// Bundles the web app into web/dist (served by Express). `--watch` rebuilds on change.
import { build, context } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
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
await copyFile(path.join(root, 'index.html'), path.join(outdir, 'index.html'));
if (watch) await (await context(options)).watch();
else await build(options);

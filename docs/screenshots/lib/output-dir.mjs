/**
 * Where verification scripts write their screenshots, PDFs and facts.
 *
 * Committed evidence under docs/screenshots/ is only overwritten when the run
 * asks for it with UPDATE_SCREENSHOTS=1. Otherwise the same relative layout
 * goes under $TMPDIR/karea-shots/, so a script can be re-run without touching
 * the repository. Paths outside docs/screenshots/ are used as given.
 *
 * The lookup is by path text, not by this file's location, because some
 * scripts are bundled to /tmp before they run.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const UPDATE = process.env.UPDATE_SCREENSHOTS === '1';
export const TEMP_ROOT = path.join(os.tmpdir(), 'karea-shots');

const MARK = `${path.sep}docs${path.sep}screenshots${path.sep}`;
const announced = new Set();

export function outputDir(dir) {
  const abs = path.resolve(dir);
  const i = `${abs}${path.sep}`.lastIndexOf(MARK);
  const out = UPDATE || i < 0 ? abs : path.join(TEMP_ROOT, abs.slice(i + MARK.length));
  fs.mkdirSync(out, { recursive: true });
  if (!announced.has(out)) {
    announced.add(out);
    console.error(`output: ${out}${UPDATE ? ' (UPDATE_SCREENSHOTS=1, committed files)' : ''}`);
  }
  return out;
}

export const scriptOutputDir = (metaUrl, ...sub) =>
  outputDir(path.join(path.dirname(fileURLToPath(metaUrl)), ...sub));

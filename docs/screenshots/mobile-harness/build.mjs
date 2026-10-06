/**
 * Bundles real mobile screens for the browser with react-native-web.
 * Dependencies come from mobile/ devDependencies (react-native-web,
 * react-dom, esbuild); nothing here is imported by the app itself.
 * Usage: node build.mjs <outdir>
 */
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobileDir = path.resolve(here, '../../../mobile');
const req = createRequire(path.join(mobileDir, 'package.json'));
const esbuild = req('esbuild');

export async function build(outdir) {
  fs.mkdirSync(outdir, { recursive: true });
  const stub = path.join(here, 'stubs.tsx');
  // Only data plumbing is replaced; every visual component is real source.
  const stubbed = [
    /^@react-native-async-storage\/async-storage$/,
    /^react-native-safe-area-context$/,
    /^@react-native\/assets-registry\/registry$/,
    /^@react-navigation\/native$/,
    /\/auth\/AuthProvider$/,
    /\/offline\/ReferenceCacheProvider$/,
    /\/api\/client$/,
    /\/lib\/criticalAlertSound$/,
    /\/components\/ConfirmDialog$/,
    /\/components\/ApprovalUndoToast$/,
    /^expo-image-picker$/,
    /^expo-file-system\/legacy$/,
    /^expo-network$/,
    /\/lib\/prepareUploadImage$/,
  ];
  const fromMobile = /^(react|react-dom|react-native-web|react-native-svg|lucide-react-native)(\/.*)?$/;

  const plugin = {
    name: 'karea-rnw',
    setup(b) {
      b.onResolve({ filter: /.*/ }, (args) => {
        if (args.importer === stub && args.path.startsWith('.')) return undefined;
        if (args.importer !== stub && stubbed.some((re) => re.test(args.path))) {
          return { path: stub };
        }
        if (args.path === 'react-native') return { path: req.resolve('react-native-web') };
        if (fromMobile.test(args.path)) return { path: req.resolve(args.path) };
        return undefined;
      });
    },
  };

  await esbuild.build({
    entryPoints: [path.join(here, 'entry.tsx')],
    bundle: true,
    outfile: path.join(outdir, 'app.js'),
    format: 'iife',
    jsx: 'automatic',
    loader: { '.js': 'jsx' },
    resolveExtensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js', '.jsx'],
    mainFields: ['browser', 'module', 'main'],
    define: {
      'process.env.NODE_ENV': '"production"',
      __DEV__: 'false',
      global: 'window',
    },
    plugins: [plugin],
    logLevel: 'warning',
  });
  fs.writeFileSync(
    path.join(outdir, 'index.html'),
    `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>html,body,#root{margin:0;min-height:100%;display:flex;flex-direction:column;font-family:-apple-system,system-ui,sans-serif}</style>
</head><body><div id="root"></div><script src="app.js"></script></body></html>`,
  );
  return outdir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = path.resolve(process.argv[2] ?? 'mobile-harness-out');
  await build(out);
  console.log('built', out);
}

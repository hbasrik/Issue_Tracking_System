/**
 * Bundles the real mobile VehicleStationScreen for react-native-web.
 * Needs a throwaway install (not a project dependency):
 *   RNW_DIR=/tmp/karea-rnw with react, react-dom, react-native-web,
 *   react-native-svg, lucide-react-native, esbuild.
 * Usage: RNW_DIR=/tmp/karea-rnw node build.mjs <outdir>
 */
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const rnw = process.env.RNW_DIR ?? '/tmp/karea-rnw';
const req = createRequire(path.join(rnw, 'package.json'));
const esbuild = req('esbuild');
const outdir = path.resolve(process.argv[2] ?? path.join(rnw, 'out'));
fs.mkdirSync(outdir, { recursive: true });

const stub = path.join(here, 'stubs.tsx');
const stubbed = [
  /^@react-native-async-storage\/async-storage$/,
  /^react-native-safe-area-context$/,
  /^@react-native\/assets-registry\/registry$/,
  /^@react-navigation\/native$/,
  /\/auth\/AuthProvider$/,
  /\/offline\/ReferenceCacheProvider$/,
  /\/api\/client$/,
];
const fromRnw = /^(react|react-dom|react-native-svg|lucide-react-native)(\/.*)?$/;

const plugin = {
  name: 'karea-rnw',
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      if (args.importer === stub) {
        if (args.path.startsWith('.')) return undefined;
      }
      if (stubbed.some((re) => re.test(args.path)) && args.importer !== stub) {
        return { path: stub };
      }
      if (args.path === 'react-native') {
        return { path: req.resolve('react-native-web') };
      }
      if (fromRnw.test(args.path)) {
        return { path: req.resolve(args.path) };
      }
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
console.log('built', outdir);

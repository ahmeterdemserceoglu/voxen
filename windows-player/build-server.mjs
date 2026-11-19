/**
 * server.js'i tek dosyaya paketler (release sidecar'ı için).
 *
 * Kullanım: node build-server.mjs
 * Çıktı:    server-bundle.cjs + sea-config.json
 *
 * Sonraki adım (Node SEA ile tek exe, Node 22+):
 *   node --experimental-sea-config sea-config.json
 *   node -e "require('fs').copyFileSync(process.execPath, 'voxen-server.exe')"
 *   npx postject voxen-server.exe NODE_SEA_BLOB sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
 */
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';

await build({
  entryPoints: ['server.js'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: 'server-bundle.cjs',
  sourcemap: false,
  minify: true,
  legalComments: 'none',
  external: [], // her şey pakete dahil
  logLevel: 'info',
});

writeFileSync(
  'sea-config.json',
  JSON.stringify(
    {
      main: 'server-bundle.cjs',
      output: 'sea-prep.blob',
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: true,
      assets: {},
    },
    null,
    2,
  ),
);

console.log('server-bundle.cjs ve sea-config.json hazır.');

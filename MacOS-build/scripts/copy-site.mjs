// Copy the built website (../dist, from `npm run build:wasm && npm run build`
// at the top of the repo) into ./site, which the app serves. Leaves out the
// README tour videos (online only on the website too) and the service worker
// (the app has its files locally, it needs no offline cache).
import { cpSync, existsSync, mkdirSync, rmSync, copyFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(dirname(fileURLToPath(import.meta.url)))
const src = resolve(process.env.XPP_SITE || join(here, '..', 'dist'))
const dst = join(here, 'site')

for (const need of ['index.html', 'wasm/xppaut.wasm', 'wasm/jspi/xppaut.wasm']) {
  if (!existsSync(join(src, need))) {
    console.error(`copy-site: ${join(src, need)} is missing. Build the site first:\n` +
      '  (repo top) npm run build:wasm && npm run build')
    process.exit(1)
  }
}
rmSync(dst, { recursive: true, force: true })
cpSync(src, dst, {
  recursive: true,
  filter: (p) => !/[\\/]videos([\\/]|$)/.test(p.slice(src.length)) && !p.endsWith('sw.js'),
})
// app icon for electron-builder (it makes the .icns from a 512 px png)
mkdirSync(join(here, 'build'), { recursive: true })
copyFileSync(join(src, 'icon-512.png'), join(here, 'build', 'icon.png'))
console.log(`copy-site: ${src} -> ${dst}`)

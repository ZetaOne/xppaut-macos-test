#!/usr/bin/env node
// Smoke test of the desktop app: launch it, open lorenz.ode the way Finder
// does (the app's 'open-file' event), integrate (Initialconds, Go), export the
// data and check it, and take screenshots. Writes everything to smoke-out/:
// result.json, 1-start.png, 2-model.png, 3-integrated.png, data.csv.
//
//   node test/smoke.mjs                 run from source (electron .)
//   XPP_APP=/path/to/XPPAUT node test/smoke.mjs   run a packaged app binary
//
// Exit code 0 = all checks passed.
import { _electron as electron } from 'playwright'
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(dirname(fileURLToPath(import.meta.url)))
const out = join(here, 'smoke-out')
mkdirSync(out, { recursive: true })
const result = { platform: `${process.platform}-${process.arch}`, checks: {}, ok: false }
const check = (name, pass, detail) => {
  result.checks[name] = { pass: !!pass, detail }
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// a copy of the example outside the app, like a file the user double-clicks
const work = mkdtempSync(join(tmpdir(), 'xpp-smoke-'))
const ode = join(work, 'lorenz.ode')
copyFileSync(join(here, 'site', 'odes', 'ode', 'lorenz.ode'), ode)

const app = await electron.launch(
  process.env.XPP_APP
    ? { executablePath: process.env.XPP_APP, args: [] }
    : { args: [here] },
)
let page
try {
  page = await app.firstWindow()
  page.on('console', (m) => console.log('page:', m.text()))
  page.on('pageerror', (e) => console.log('page error:', e.message))
  await page.waitForLoadState('load')
  await page.waitForSelector('#upload', { state: 'attached', timeout: 30000 })
  const info = await app.evaluate(({ app }) => ({ name: app.getName(), version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome }))
  result.app = info
  check('page loaded', (await page.title()).length > 0, await page.title())
  check('fast WebAssembly build available (JSPI)', await page.evaluate(() => 'Suspending' in WebAssembly))
  await page.screenshot({ path: join(out, '1-start.png') })

  // open the model as Finder would
  await app.evaluate(({ app }, p) => app.emit('open-file', { preventDefault() {} }, p), ode)
  await page.waitForFunction(() => window.xpp?.running, null, { timeout: 60000 })
  check('XPP started from a file opened in Finder', true)
  check('XPP runs the JSPI build', (await page.evaluate(() => window.xpp.engine)) === 'jspi', await page.evaluate(() => window.xpp.engine))
  await sleep(1500)
  await page.screenshot({ path: join(out, '2-model.png') })

  // Initialconds -> Go
  await page.evaluate(() => {
    window.xpp.pressKey('i')
    window.xpp.pressKey('g')
  })
  await sleep(500)
  await page.waitForFunction(() => !window.xpp.busy, null, { timeout: 60000 })
  await sleep(1000)
  await page.screenshot({ path: join(out, '3-integrated.png') })

  const rows = await page.evaluate(() => window.xpp.writeCsv('smoke.csv'))
  const csv = await page.evaluate(() => new TextDecoder().decode(window.xpp.readFile('smoke.csv')))
  writeFileSync(join(out, 'data.csv'), csv)
  const lines = csv.trim().split('\n')
  const last = lines.at(-1).split(',').map(Number)
  check('integration produced data', rows > 100, { rows, header: lines[0] })
  check('data is finite and bounded (Lorenz attractor)', last.every(Number.isFinite) && last.slice(1).every((v) => Math.abs(v) < 100), lines.at(-1))
  result.ok = Object.values(result.checks).every((c) => c.pass)
} catch (e) {
  check('no errors', false, String(e?.stack || e))
  if (page) await page.screenshot({ path: join(out, 'error.png') }).catch(() => {})
} finally {
  writeFileSync(join(out, 'result.json'), JSON.stringify(result, null, 2))
  // close without the "XPP is still running" question
  await app.evaluate(({ app, BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) w.destroy()
    app.quit()
  }).catch(() => {})
  await app.close().catch(() => {})
}
console.log(result.ok ? 'SMOKE TEST PASSED' : 'SMOKE TEST FAILED')
process.exit(result.ok ? 0 : 1)

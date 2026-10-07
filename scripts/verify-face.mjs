/** Targeted deterministic checks. Run: node scripts/verify-face.mjs (requires installed TypeScript).
 * Uses production functions; does not measure real biometric accuracy or run a browser camera.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const require = createRequire(import.meta.url)
const ts = require('typescript')
const root = fileURLToPath(new URL('../', import.meta.url))
const out = await mkdtemp(join(tmpdir(), 'nexotime-face-'))
let total = 0
const check = async (name, test) => { await test(); total++; console.log(`OK ${total}: ${name}`) }
try {
  for (const name of ['camera', 'face', 'faceSession', 'kiosk']) {
    const source = await readFile(join(root, `src/lib/${name}.ts`), 'utf8')
    const result = ts.transpileModule(source, {
      fileName: `${name}.ts`, reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
    })
    assert.equal(result.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0)
    await writeFile(join(out, `${name}.mjs`), result.outputText.replace(/from '\.\/(camera|face)'/g, "from './$1.mjs'"))
  }
  const f = await import(pathToFileURL(join(out, 'face.mjs')))
  const { FaceSession } = await import(pathToFileURL(join(out, 'faceSession.mjs')))
  const { openCamera, tuneCamera, waitForFreshFrame } = await import(pathToFileURL(join(out, 'camera.mjs')))
  const face = (shift = 0) => Array.from({ length: 128 }, (_, i) => Math.sin(i) * 0.1 + shift)
  const employee = (id, descriptors, status = 'active', enabled = true) => ({ id, status, identifications: [{ method: 'face', enabled, descriptors }] })
  const ana = employee('ana', [face(), face(0.003)])
  const beto = employee('beto', [face(0.12), face(0.122)])
  const candidates = f.faceCandidates([ana, beto])
  const tuning = f.tuningFor('balanced')
  const good = { pixelWidth: 140, size: 0.3, brightness: 125, offset: { x: 0, y: 0 }, yaw: 1, sharpness: 4, edgeGap: 0.2 }
  await check('valid descriptors only', () => {
    for (const d of [[], [1], Array(128).fill(NaN), Array(128).fill(Infinity), Array(128).fill('0'), null]) assert.equal(f.isFaceDescriptor(d), false)
    assert.equal(f.isFaceDescriptor(face()), true)
  })
  await check('invalid vectors cannot match', () => {
    assert.equal(f.descriptorDistance([], face()), Infinity)
    assert.equal(f.nearestFace(candidates, []), null)
    assert.equal(f.nearestFace([{ employee: ana, descriptors: [[]] }], face()), null)
  })
  await check('active enabled employees only', () => {
    const list = f.faceCandidates([ana, employee('off', [face()], 'inactive'), employee('disabled', [face()], 'active', false), employee('bad', [[]])])
    assert.deepEqual(list.map((c) => c.employee.id), ['ana'])
  })
  await check('known person', () => assert.equal(f.nearestFace(candidates, face(0.004)).employee.id, 'ana'))
  await check('unknown person rejected', () => assert.equal(f.isConfidentMatch(f.nearestFace(candidates, face(1)), tuning), false))
  await check('ambiguous people rejected', () => {
    const same = f.faceCandidates([ana, employee('twin', [face(), face(0.003)])])
    assert.equal(f.isConfidentMatch(f.nearestFace(same, face()), tuning), false)
  })
  await check('three independent confirmations required', () => {
    const s = new FaceSession()
    assert.equal(s.push(candidates, face(), tuning, 100).accepted, null)
    assert.equal(s.push(candidates, face(0.001), tuning, 200).accepted, null)
    assert.equal(s.push(candidates, face(0.002), tuning, 300).accepted.employee.id, 'ana')
  })
  await check('basic camera requires four readings', () => {
    const s = new FaceSession(); const t = f.tuningFor('relaxed')
    for (let i = 0; i < 3; i++) assert.equal(s.push(candidates, face(), t, 100 + i * 100).accepted, null)
    assert.equal(s.push(candidates, face(), t, 400).accepted.employee.id, 'ana')
  })
  await check('person change cannot inherit confirmations', () => {
    const s = new FaceSession()
    s.push(candidates, face(), tuning, 100); s.push(candidates, face(), tuning, 200)
    const result = s.push(candidates, face(0.12), tuning, 300)
    assert.equal(result.accepted, null); assert.equal(result.progress, 1)
  })
  await check('uncertain frame resets evidence', () => {
    const s = new FaceSession(); s.push(candidates, face(), tuning, 100)
    assert.equal(s.push(candidates, face(1), tuning, 200).progress, 0)
    assert.equal(s.push(candidates, face(), tuning, 300).progress, 1)
  })
  await check('quality failure reset cannot accept stale evidence', () => {
    const s = new FaceSession(); s.push(candidates, face(), tuning, 100); s.reset()
    assert.equal(s.push(candidates, face(), tuning, 200).progress, 1)
  })
  await check('long gaps reset evidence', () => {
    const s = new FaceSession(); s.push(candidates, face(), tuning, 100)
    assert.equal(s.push(candidates, face(), tuning, 7000).progress, 1)
  })
  await check('changed policy resets evidence', () => {
    const s = new FaceSession(); s.push(candidates, face(), tuning, 100)
    assert.equal(s.push(candidates, face(), f.tuningFor('strict'), 200).progress, 1)
  })
  await check('sudden descriptor jump resets evidence', () => {
    const s = new FaceSession(); s.push([candidates[0]], face(), tuning, 100)
    assert.equal(s.push([candidates[0]], face(0.04), tuning, 200).progress, 1)
  })
  await check('no synthetic average can rescue individually rejected faces', () => {
    const s = new FaceSession()
    for (let i = 0; i < 6; i++) assert.equal(s.push([candidates[0]], face(i % 2 ? 0.08 : -0.08), tuning, i * 100).accepted, null)
  })
  await check('digital zoom cannot compensate missing native pixels', () => assert.ok(f.qualityIssues({ ...good, pixelWidth: 35, size: 0.5 }).includes('low_detail')))
  await check('unavailable native dimensions rejected', () => assert.ok(f.qualityIssues({ ...good, pixelWidth: undefined }).includes('low_detail')))
  await check('good frame passes quality', () => assert.deepEqual(f.qualityIssues(good, { blur: true }), []))
  await check('blur and light gates', () => {
    assert.ok(f.qualityIssues({ ...good, sharpness: 0.1 }, { blur: true }).includes('blurry'))
    assert.ok(f.qualityIssues({ ...good, brightness: 15 }).includes('dark'))
    assert.ok(f.qualityIssues({ ...good, brightness: 250 }).includes('bright'))
  })
  await check('crop and distance guidance', () => {
    assert.ok(f.qualityIssues({ ...good, edgeGap: -0.2 }).includes('cut_off'))
    assert.ok(f.qualityIssues({ ...good, size: 0.9 }).includes('close'))
    assert.ok(f.qualityIssues({ ...good, size: 0.05 }).includes('small'))
  })
  await check('invalid thresholds cannot disable comparisons', () => {
    assert.equal(f.tuningFor('balanced', NaN).threshold, tuning.threshold)
    assert.equal(f.tuningFor('balanced', 4).threshold, 0.75)
  })
  await check('camera retries unsupported constraints', async () => {
    const calls = []; const stream = {}
    const result = await openCamera({ getUserMedia: async (c) => { calls.push(c); if (calls.length < 3) throw { name: 'OverconstrainedError' }; return stream } })
    assert.equal(result, stream); assert.deepEqual(calls.map((c) => c.video.width.ideal), [1920, 1280, 640])
  })
  await check('camera permission denial is not retried', async () => {
    let count = 0
    await assert.rejects(openCamera({ getUserMedia: async () => { count++; throw new DOMException('Denied', 'NotAllowedError') } }))
    assert.equal(count, 1)
  })
  await check('camera busy is not retried', async () => {
    let count = 0
    await assert.rejects(openCamera({ getUserMedia: async () => { count++; throw new DOMException('Busy', 'NotReadableError') } }))
    assert.equal(count, 1)
  })
  await check('rear camera preference preserved', async () => {
    await openCamera({ getUserMedia: async (c) => { assert.equal(c.video.facingMode.ideal, 'environment'); return {} } }, true, 'environment')
  })
  await check('unsupported camera tuning is harmless', async () => {
    await tuneCamera({})
    await tuneCamera({ getCapabilities: () => ({ focusMode: ['continuous'] }), applyConstraints: async () => { throw Error('unsupported') } })
  })
  await check('only supported continuous controls requested', async () => {
    let requested
    await tuneCamera({ getCapabilities: () => ({ focusMode: ['continuous'], exposureMode: ['manual'] }), applyConstraints: async (v) => { requested = v } })
    assert.deepEqual(requested, { advanced: [{ focusMode: 'continuous' }] })
  })
  await check('duplicate frames wait for actual new video', async () => {
    const video = { readyState: 2, videoWidth: 640, videoHeight: 480, paused: false, ended: false, currentTime: 1 }
    await waitForFreshFrame(video)
    let completed = false
    const next = waitForFreshFrame(video).then(() => { completed = true })
    await new Promise((resolve) => setTimeout(resolve, 60)); assert.equal(completed, false)
    video.currentTime = 2; await next; assert.equal(completed, true)
  })
  await check('stalled video fails with actionable error', async () => {
    const video = { readyState: 0, videoWidth: 0, videoHeight: 0, paused: true, currentTime: 0 }
    await assert.rejects(waitForFreshFrame(video), /imágenes nuevas/)
  })
  console.log(`\n${total} comprobaciones dirigidas correctas. No sustituye pruebas de cámara real.`)
} finally { await rm(out, { recursive: true, force: true }) }

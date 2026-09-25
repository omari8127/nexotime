import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

/**
 * Writes dist/sw.js from sw-template.js with the exact list of built files, so the
 * installed app can start with no network. The version changes whenever any file does,
 * which is what makes browsers install the new worker.
 */
export function serviceWorkerPlugin(root: string): Plugin {
  let outDir = 'dist'
  return {
    name: 'nexotime-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const files: string[] = []
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = path.join(dir, name)
          if (statSync(full).isDirectory()) walk(full)
          else files.push('/' + path.relative(outDir, full).split(path.sep).join('/'))
        }
      }
      walk(outDir)

      const usable = files.filter((f) => f !== '/sw.js')
      const models = usable.filter((f) => f.startsWith('/models/'))
      const core = usable.filter((f) => !f.startsWith('/models/'))

      const hash = createHash('sha256')
      for (const f of core) hash.update(f).update(readFileSync(path.join(outDir, f)))
      const version = `${Date.now().toString(36)}-${hash.digest('hex').slice(0, 10)}`

      const template = readFileSync(path.resolve(root, 'sw-template.js'), 'utf8')
      const output = template
        .replace('__VERSION__', version)
        .replace('__CORE_FILES__', JSON.stringify(core))
        .replace('__MODEL_FILES__', JSON.stringify(models))
      writeFileSync(path.join(outDir, 'sw.js'), output)
    },
  }
}

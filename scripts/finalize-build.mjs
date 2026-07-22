import { access, copyFile, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const root = new URL('..', import.meta.url)
const dist = new URL('../dist', import.meta.url)
const entries = await readdir(dist, { withFileTypes: true })

let workerEntry
for (const entry of entries) {
  if (!entry.isDirectory() || ['client', 'server', '.openai'].includes(entry.name)) continue
  const candidate = join(dist.pathname, entry.name, 'index.js')
  const wranglerConfig = join(dist.pathname, entry.name, 'wrangler.json')
  try {
    await access(candidate)
    await access(wranglerConfig)
    workerEntry = candidate
    break
  } catch {
    // Continue until the Cloudflare Worker environment is found.
  }
}

if (!workerEntry) throw new Error('未找到 Cloudflare Worker 构建入口。')

const serverDirectory = new URL('../dist/server/', import.meta.url)
await mkdir(serverDirectory, { recursive: true })
await copyFile(workerEntry, new URL('index.js', serverDirectory))

await access(new URL('../dist/client/index.html', import.meta.url))
await access(new URL('../dist/.openai/hosting.json', import.meta.url))
await access(new URL('../dist/server/index.js', import.meta.url))

console.log(`Build finalized from ${workerEntry.replace(root.pathname, '')}`)

import { spawnSync } from 'node:child_process'

const isCloudflareWorkersBuild = process.env.WORKERS_CI === '1'
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const args = isCloudflareWorkersBuild
  ? ['--no-install', 'vinext', 'build']
  : ['--no-install', 'next', 'build']

console.log(`[build] target=${isCloudflareWorkersBuild ? 'cloudflare-workers' : 'nextjs'}`)

const result = spawnSync(command, args, {
  stdio: 'inherit',
  env: process.env,
})

if (result.error) {
  console.error(result.error)
  process.exit(1)
}

process.exit(result.status ?? 1)

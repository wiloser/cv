import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sites } from './build/sites-vite-plugin'

export default defineConfig(async () => {
  process.env.WRANGLER_WRITE_LOGS ??= 'false'
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/wrangler.log'
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry'

  const { cloudflare } = await import('@cloudflare/vite-plugin')

  return {
    plugins: [
      react(),
      tailwindcss(),
      sites(),
      cloudflare({
        config: {
          main: './worker/index.ts',
          compatibility_date: '2026-05-22',
          compatibility_flags: ['nodejs_compat'],
          assets: {
            binding: 'ASSETS',
            not_found_handling: 'single-page-application',
          },
        },
      }),
    ],
    server: {
      port: 5174,
      strictPort: true,
      watch: process.env.CODEX_SANDBOX === 'seatbelt' ? { useFsEvents: false, usePolling: true } : undefined,
    },
  }
})

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_QUANT_MONITOR_URL?: string
  readonly VITE_QUANT_SYNC_URL?: string
	readonly VITE_QUANT_OPTIMIZE_URL?: string
	readonly VITE_QUANT_MARKET_URL?: string
	readonly VITE_QUANT_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

export type QuantSourceStatus = 'healthy' | 'warning' | 'offline'

export interface QuantMetric {
  label: string
  value: string
  change: string
  direction: 'up' | 'down' | 'flat'
  note: string
}

export interface QuantTrendPoint {
  date: string
  value: number
  secondary: number
}

export interface QuantSource {
  name: string
  type: string
  status: QuantSourceStatus
  lastSync: string
  records: string
  coverage: string
  latency: string
}

export interface QuantQualityMetric {
  label: string
  value: number
  color: string
}

export interface QuantAlert {
  level: 'info' | 'warning' | 'critical'
  title: string
  description: string
  time: string
}

export interface QuantSyncRun {
  time: string
  label: string
  status: 'done' | 'running' | 'pending'
  detail: string
}

export interface QuantBacktestPoint {
  date: string
  close?: number
  equity: number
  benchmark: number
  drawdown: number
  position: number
}

export interface QuantBacktestTrade {
  date: string
  side: 'buy' | 'sell'
  reason: string
  price: number
  fee: number
  pnl: number
}

export interface QuantBacktest {
  strategy: string
  fastPeriod: number
  slowPeriod: number
  initialCapital: number
  finalEquity: number
  strategyReturn: number
  benchmarkFinalEquity: number
  benchmarkReturn: number
  excessReturn: number
  sharpeRatio?: number
  benchmarkSharpeRatio?: number
  maxDrawdown: number
  totalTrades: number
  executions: number
  winningTrades: number
  winRate: number
  feeRate: number
  slippageRate: number
  bars: number
  start: string
  end: string
  equityCurve: QuantBacktestPoint[]
  trades: QuantBacktestTrade[]
  assumptions: string[]
}

export interface QuantMonitorData {
  mode: 'demo' | 'live'
  instrumentId?: string
  bar?: string
  fastPeriod?: number
  slowPeriod?: number
  updatedAt: string
  nextSyncAt: string
  syncSchedule: string
  sourceNote: string
  metrics: QuantMetric[]
  trend: QuantTrendPoint[]
  sources: QuantSource[]
  quality: QuantQualityMetric[]
  alerts: QuantAlert[]
  syncRuns: QuantSyncRun[]
  backtest?: QuantBacktest
}

export interface QuantMarketQuote {
  instrumentId: string
  last: number
  open24h: number
  high24h: number
  low24h: number
  volume24h: number
  volumeCurrency24h: number
  change24h: number
  updatedAt: string
}

export interface QuantNotificationSettings {
  enabled: boolean
  email: string
  onBuy: boolean
  onSell: boolean
}

export interface QuantUser {
  id: string
  email: string
  createdAt: string
  updatedAt: string
  watchlist: string[]
  notifications: QuantNotificationSettings
}

export interface QuantOptimizationCandidate {
  fastPeriod: number
  slowPeriod: number
  finalEquity: number
  strategyReturn: number
  benchmarkReturn: number
  excessReturn: number
  sharpeRatio: number
  benchmarkSharpeRatio: number
  maxDrawdown: number
  totalTrades: number
  equityCurve?: QuantBacktestPoint[]
}

export interface QuantOptimization {
  instrumentId?: string
  bar?: string
  objective: string
  bars: number
  start: string
  end: string
  fastMin: number
  fastMax: number
  slowMin: number
  slowMax: number
  step: number
  tested: number
  best: QuantBacktest
  candidates: QuantOptimizationCandidate[]
}

export const quantDataUrl = import.meta.env.VITE_QUANT_MONITOR_URL?.trim() || '/data/quant-monitor.json'
export const quantSyncUrl = import.meta.env.VITE_QUANT_SYNC_URL?.trim()
export const quantOptimizeUrl = import.meta.env.VITE_QUANT_OPTIMIZE_URL?.trim() || (quantSyncUrl ? quantSyncUrl.replace(/\/sync\/?$/, '/optimize') : '')
export const quantMarketUrl = import.meta.env.VITE_QUANT_MARKET_URL?.trim() || (quantDataUrl.includes('/api/quant/monitor') ? quantDataUrl.replace(/\/monitor\/?$/, '/market') : '')
export const quantApiBaseUrl = import.meta.env.VITE_QUANT_API_URL?.trim() || (quantSyncUrl ? quantSyncUrl.replace(/\/sync\/?$/, '') : '')

export function quantApiUrl(path: string) {
  if (!quantApiBaseUrl) return ''
  return `${quantApiBaseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

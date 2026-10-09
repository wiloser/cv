import {
  Activity,
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Info,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Workflow,
  XCircle,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { quantDataUrl, quantOptimizeUrl, quantSyncUrl, type QuantAlert, type QuantMonitorData, type QuantOptimization, type QuantSourceStatus } from '../data/quant'
import { BacktestPerformanceChart } from './quant/BacktestPerformanceChart'
import { HyperparameterComparisonChart } from './quant/HyperparameterComparisonChart'

interface QuantMonitorPageProps {
  initialData: QuantMonitorData
  routeSymbol?: string
}

const shell = 'mx-auto w-[calc(100%_-_28px)] max-w-[1280px] sm:w-[calc(100%_-_48px)]'

const sourceStatusMeta: Record<QuantSourceStatus, { label: string; className: string; dot: string }> = {
  healthy: { label: '运行正常', className: 'bg-[#effaf3] text-[#27734a]', dot: 'bg-[#63ce8f]' },
  warning: { label: '有延迟', className: 'bg-[#fff8e8] text-[#94651f]', dot: 'bg-[#d9a441]' },
  offline: { label: '已离线', className: 'bg-[#fff0f0] text-[#a04444]', dot: 'bg-[#d66a6a]' },
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`
}

function formatMoney(value: number) {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatRatio(value?: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '--'
}

function withQuery(url: string, values: Record<string, string | number>) {
  const target = new URL(url, window.location.origin)
  Object.entries(values).forEach(([key, value]) => target.searchParams.set(key, String(value)))
  return target.toString()
}

async function fetchQuantMonitorData(symbol: string, fast: number, slow: number) {
  const query = { symbol, fast, slow }
  if (quantSyncUrl) {
    const syncResponse = await fetch(withQuery(quantSyncUrl, query), { method: 'POST', cache: 'no-store' })
    if (!syncResponse.ok) throw new Error(`同步数据失败：${syncResponse.status}`)
  }
  const response = await fetch(quantSyncUrl ? withQuery(quantDataUrl, query) : quantDataUrl, { cache: 'no-store' })
  if (!response.ok) throw new Error(`读取数据失败：${response.status}`)
  return response.json() as Promise<QuantMonitorData>
}

function AlertIcon({ level }: { level: QuantAlert['level'] }) {
  if (level === 'critical') return <XCircle className="size-4 text-[#c55656]" />
  if (level === 'warning') return <TriangleAlert className="size-4 text-[#b17a25]" />
  return <Info className="size-4 text-[#5557e8]" />
}

export function QuantMonitorPage({ initialData, routeSymbol }: QuantMonitorPageProps) {
  const [data, setData] = useState(initialData)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [symbol, setSymbol] = useState(routeSymbol ?? initialData.instrumentId ?? 'BTC-USDT')
  const [fastPeriod, setFastPeriod] = useState(String(initialData.fastPeriod ?? initialData.backtest?.fastPeriod ?? 12))
  const [slowPeriod, setSlowPeriod] = useState(String(initialData.slowPeriod ?? initialData.backtest?.slowPeriod ?? 26))
  const [optimizing, setOptimizing] = useState(false)
  const [optimization, setOptimization] = useState<QuantOptimization | null>(null)
  const [optimizeError, setOptimizeError] = useState('')
  const [fastMin, setFastMin] = useState('5')
  const [fastMax, setFastMax] = useState('30')
  const [slowMin, setSlowMin] = useState('20')
  const [slowMax, setSlowMax] = useState('80')
  const [searchStep, setSearchStep] = useState('1')

  useEffect(() => {
    document.title = '量化监测平台 · 项目工作台'
  }, [])

  useEffect(() => {
    const normalizedSymbol = routeSymbol?.trim().toUpperCase()
    const initialSymbol = (initialData.instrumentId ?? 'BTC-USDT').toUpperCase()
    if (!normalizedSymbol || normalizedSymbol === initialSymbol) return

    let active = true
    const fast = initialData.fastPeriod ?? initialData.backtest?.fastPeriod ?? 12
    const slow = initialData.slowPeriod ?? initialData.backtest?.slowPeriod ?? 26
    const loadTimer = window.setTimeout(() => {
      if (!active) return
      setSyncing(true)
      setSyncError('')
      setOptimization(null)
      void fetchQuantMonitorData(normalizedSymbol, fast, slow)
        .then((nextData) => {
          if (!active) return
          setData(nextData)
          setSymbol(nextData.instrumentId ?? normalizedSymbol)
          setFastPeriod(String(nextData.fastPeriod ?? fast))
          setSlowPeriod(String(nextData.slowPeriod ?? slow))
        })
        .catch((error: unknown) => {
          if (active) setSyncError(error instanceof Error ? error.message : '读取标的数据失败，请稍后重试')
        })
        .finally(() => {
          if (active) setSyncing(false)
        })
    }, 0)

    return () => {
      active = false
      window.clearTimeout(loadTimer)
    }
  }, [initialData, routeSymbol])

  const handleRefresh = async () => {
    const normalizedSymbol = symbol.trim().toUpperCase()
    const fast = Number(fastPeriod)
    const slow = Number(slowPeriod)
    if (!normalizedSymbol) {
      setSyncError('请输入 symbol')
      return
    }
    if (!Number.isInteger(fast) || !Number.isInteger(slow) || fast <= 0 || slow <= 0 || fast >= slow) {
      setSyncError('EMA 快周期必须是正整数，且小于慢周期')
      return
    }

    setSyncing(true)
    setSyncError('')
    setOptimization(null)
    setOptimizeError('')

    try {
      const nextData = await fetchQuantMonitorData(normalizedSymbol, fast, slow)
      setData(nextData)
      setSymbol(nextData.instrumentId ?? normalizedSymbol)
      setFastPeriod(String(nextData.fastPeriod ?? fast))
      setSlowPeriod(String(nextData.slowPeriod ?? slow))
    } catch (error: unknown) {
      setSyncError(error instanceof Error ? error.message : '同步失败，请稍后重试')
    } finally {
      setSyncing(false)
    }
  }

  const handleOptimize = async () => {
    const normalizedSymbol = symbol.trim().toUpperCase()
    const fastMinValue = Number(fastMin)
    const fastMaxValue = Number(fastMax)
    const slowMinValue = Number(slowMin)
    const slowMaxValue = Number(slowMax)
    const stepValue = Number(searchStep)
    if (!quantOptimizeUrl) {
      setOptimizeError('未配置参数寻优接口')
      return
    }
    if (!normalizedSymbol) {
      setOptimizeError('请输入 symbol')
      return
    }
    if (![fastMinValue, fastMaxValue, slowMinValue, slowMaxValue, stepValue].every(Number.isInteger) || fastMinValue <= 0 || fastMaxValue < fastMinValue || slowMinValue <= 0 || slowMaxValue < slowMinValue || stepValue <= 0) {
      setOptimizeError('搜索范围必须是正整数，且最小值不能大于最大值')
      return
    }

    setOptimizing(true)
    setOptimizeError('')
    try {
      const response = await fetch(withQuery(quantOptimizeUrl, {
        symbol: normalizedSymbol,
        fastMin: fastMinValue,
        fastMax: fastMaxValue,
        slowMin: slowMinValue,
        slowMax: slowMaxValue,
        step: stepValue,
      }), { cache: 'no-store' })
      if (!response.ok) throw new Error(`参数寻优失败：${response.status}`)
      const result = await response.json() as QuantOptimization
      setOptimization(result)
      setSymbol(result.instrumentId ?? normalizedSymbol)
    } catch (error: unknown) {
      setOptimizeError(error instanceof Error ? error.message : '参数寻优失败，请稍后重试')
    } finally {
      setOptimizing(false)
    }
  }

  const healthySources = data.sources.filter((source) => source.status === 'healthy').length

  return (
    <main>
      <section className="overflow-hidden bg-[#151615] text-white">
        <div className={`${shell} relative py-9 sm:py-14`}>
          <div className="pointer-events-none absolute -right-20 -top-36 size-[420px] rounded-full border border-[#5557e8]/25" aria-hidden="true" />
              <div className="pointer-events-none absolute right-24 top-16 size-32 rounded-full border border-[#d9ff63]/20" aria-hidden="true" />
              <Link className="relative inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-2 text-[10px] font-semibold text-white/65 no-underline transition hover:border-white/40 hover:text-white" to="/quant"><ArrowLeft className="size-3.5" /> 返回标的列表</Link>

          <div className="relative mt-9 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
            <div>
              <h1 className="mt-4 mb-0 max-w-[780px] text-[42px] leading-[1.04] tracking-[-0.065em] sm:text-[66px]">量化监测平台</h1>
              <p className="mt-4 mb-0 font-mono text-[10px] font-semibold tracking-[0.12em] text-[#d9ff63]">{data.instrumentId} · SINGLE INSTRUMENT DETAIL</p>
            </div>

            <div className="rounded-[22px] border border-white/10 bg-white/[.06] p-5 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-[11px] font-semibold text-white/80"><span className="size-2 rounded-full bg-[#63ce8f] shadow-[0_0_0_5px_rgba(99,206,143,.12)]" /> 数据管道运行正常</span>
                <span className="rounded-full bg-[#d9ff63] px-2 py-1 font-mono text-[8px] font-bold text-[#151615]">{data.mode === 'live' ? 'LIVE' : 'DEMO'}</span>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
                <div><dt className="font-mono text-[8px] text-white/35">最近同步</dt><dd className="mt-1 text-[13px] font-semibold text-white">{formatDate(data.updatedAt)}</dd></div>
                <div><dt className="font-mono text-[8px] text-white/35">下次同步</dt><dd className="mt-1 text-[13px] font-semibold text-white">{formatDate(data.nextSyncAt)}</dd></div>
              </dl>
              <p className="mt-4 mb-0 flex items-center gap-2 text-[10px] text-white/45"><Clock3 className="size-3.5" /> {data.syncSchedule}</p>
            </div>
          </div>
        </div>
      </section>

      <div className={`${shell} py-8 sm:py-12`}>
        <div className="flex flex-col gap-4 rounded-[18px] border border-[#d9dad3] bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#effaf3] text-[#27734a]"><CheckCircle2 className="size-4" /></span>
            <div>
              <p className="m-0 text-[12px] font-bold text-[#27734a]">今日同步窗口已完成</p>
            </div>
          </div>
          <div className="flex flex-1 flex-wrap items-end gap-2">
            <label className="text-[9px] font-semibold text-[#777a74]">Symbol<input className="mt-1 block h-8 w-[112px] rounded-lg border border-[#d6d7d0] bg-white px-2 font-mono text-[10px] font-normal text-[#151615] outline-none transition focus:border-[#5557e8]" list="quant-symbols" onChange={(event) => setSymbol(event.target.value)} placeholder="BTC-USDT" value={symbol} /></label>
            <datalist id="quant-symbols"><option value="BTC-USDT" /><option value="ETH-USDT" /><option value="SOL-USDT" /><option value="BNB-USDT" /><option value="XRP-USDT" /></datalist>
            <label className="text-[9px] font-semibold text-[#777a74]">快 EMA<input className="mt-1 block h-8 w-[62px] rounded-lg border border-[#d6d7d0] bg-white px-2 font-mono text-[10px] font-normal text-[#151615] outline-none transition focus:border-[#5557e8]" min="1" onChange={(event) => setFastPeriod(event.target.value)} type="number" value={fastPeriod} /></label>
            <label className="text-[9px] font-semibold text-[#777a74]">慢 EMA<input className="mt-1 block h-8 w-[62px] rounded-lg border border-[#d6d7d0] bg-white px-2 font-mono text-[10px] font-normal text-[#151615] outline-none transition focus:border-[#5557e8]" min="2" onChange={(event) => setSlowPeriod(event.target.value)} type="number" value={slowPeriod} /></label>
          </div>
          <div className="flex items-center gap-3">
            {syncError && <span className="text-[10px] text-[#b04e4e]" role="alert">{syncError}</span>}
            <button className="inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-[#d6d7d0] bg-white px-3.5 text-[10px] font-bold text-[#555852] transition hover:border-[#151615] hover:text-[#151615] disabled:cursor-not-allowed disabled:opacity-60" disabled={syncing || !quantSyncUrl} onClick={handleRefresh} type="button"><RefreshCw className={`size-3.5 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? '正在同步' : '应用并回测'}</button>
          </div>
        </div>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="核心指标">
          {data.metrics.map((metric) => (
            <article className="rounded-[18px] border border-[#deded7] bg-white p-5" key={metric.label}>
              <div className="flex items-start justify-between gap-3"><span className="text-[11px] font-semibold text-[#777a74]">{metric.label}</span><span className="grid size-8 place-items-center rounded-xl bg-[#f4f4f0] text-[#5557e8]"><Activity className="size-4" /></span></div>
              <div className="mt-5 flex items-end justify-between gap-3"><strong className="text-[30px] tracking-[-0.06em] text-[#151615]">{metric.value}</strong><span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-[9px] font-bold ${metric.direction === 'up' ? 'bg-[#effaf3] text-[#27734a]' : metric.direction === 'down' ? 'bg-[#fff8e8] text-[#94651f]' : 'bg-[#f3f3ef] text-[#777a74]'}`}>{metric.direction === 'up' && <ArrowUpRight className="size-3" />}{metric.direction === 'down' && <ArrowDownRight className="size-3" />}{metric.change}</span></div>
              <p className="mt-2 mb-0 text-[9px] text-[#a0a29c]">{metric.note}</p>
            </article>
          ))}
        </section>

        {data.backtest && (
          <section className="mt-6 rounded-[22px] border border-[#deded7] bg-white p-5 sm:p-6" aria-labelledby="backtest-title">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="mt-2 mb-0 text-[24px] tracking-[-0.045em]" id="backtest-title">EMA 策略回测</h2>
                <p className="mt-2 mb-0 text-[10px] text-[#858880]">EMA{data.backtest.fastPeriod} / EMA{data.backtest.slowPeriod} · {data.backtest.start} 至 {data.backtest.end} · {data.backtest.bars} 根 K 线</p>
              </div>
              <span className="rounded-full bg-[#f3f3ef] px-3 py-1.5 font-mono text-[9px] font-semibold text-[#777a74]">仅做多 · 次日开盘执行</span>
            </div>

            <BacktestPerformanceChart backtest={data.backtest} />

            {data.backtest.trades.length > 0 && (
              <div className="mt-5 overflow-x-auto border-t border-[#ecece7] pt-5">
                <div className="mb-3 text-[10px] font-semibold text-[#555852]">最近交易</div>
                <table className="w-full min-w-[560px] border-collapse text-left text-[10px] text-[#777a74]">
                  <thead><tr className="border-b border-[#ecece7] font-mono text-[8px] text-[#a0a29c]"><th className="pb-2 font-normal">日期</th><th className="pb-2 font-normal">方向</th><th className="pb-2 font-normal">原因</th><th className="pb-2 font-normal">价格</th><th className="pb-2 font-normal">本次 P&L</th></tr></thead>
                  <tbody>{data.backtest.trades.slice(-6).reverse().map((trade, index) => <tr className="border-b border-[#f0f0ec] last:border-0" key={`${trade.date}-${trade.side}-${index}`}><td className="py-3 font-mono">{trade.date}</td><td className={`py-3 font-semibold ${trade.side === 'buy' ? 'text-[#27734a]' : 'text-[#94651f]'}`}>{trade.side === 'buy' ? '买入' : '卖出'}</td><td className="py-3">{trade.reason}</td><td className="py-3 font-mono">{formatMoney(trade.price)}</td><td className={`py-3 font-mono ${trade.pnl > 0 ? 'text-[#27734a]' : trade.pnl < 0 ? 'text-[#94651f]' : ''}`}>{trade.side === 'buy' ? '--' : formatMoney(trade.pnl)}</td></tr>)}</tbody>
                </table>
              </div>
            )}

            <div className="mt-4 text-[9px] leading-[1.7] text-[#a0a29c]">{data.backtest.assumptions.join(' · ')}</div>
          </section>
        )}

        <section className="mt-6 rounded-[22px] border border-[#deded7] bg-white p-5 sm:p-6" aria-labelledby="optimization-title">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="mt-2 mb-0 text-[24px] tracking-[-0.045em]" id="optimization-title">超参数对比</h2>
              <p className="mt-2 mb-0 text-[10px] text-[#858880]">按夏普比率排序，比较不同 EMA 组合的风险收益</p>
            </div>
            <button className="inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-[#d6d7d0] bg-white px-3.5 text-[10px] font-bold text-[#555852] transition hover:border-[#151615] hover:text-[#151615] disabled:cursor-not-allowed disabled:opacity-60" disabled={optimizing} onClick={handleOptimize} type="button"><Activity className={optimizing ? 'size-3.5 animate-pulse' : 'size-3.5'} /> {optimizing ? '正在搜索' : '寻找最优'}</button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-[9px] font-semibold text-[#777a74]">快 EMA 最小<input className="mt-1 block h-8 w-full rounded-lg border border-[#d6d7d0] bg-white px-2 font-mono text-[10px] font-normal text-[#151615] outline-none transition focus:border-[#5557e8]" min="1" onChange={(event) => setFastMin(event.target.value)} type="number" value={fastMin} /></label>
            <label className="text-[9px] font-semibold text-[#777a74]">快 EMA 最大<input className="mt-1 block h-8 w-full rounded-lg border border-[#d6d7d0] bg-white px-2 font-mono text-[10px] font-normal text-[#151615] outline-none transition focus:border-[#5557e8]" min="1" onChange={(event) => setFastMax(event.target.value)} type="number" value={fastMax} /></label>
            <label className="text-[9px] font-semibold text-[#777a74]">慢 EMA 最小<input className="mt-1 block h-8 w-full rounded-lg border border-[#d6d7d0] bg-white px-2 font-mono text-[10px] font-normal text-[#151615] outline-none transition focus:border-[#5557e8]" min="2" onChange={(event) => setSlowMin(event.target.value)} type="number" value={slowMin} /></label>
            <label className="text-[9px] font-semibold text-[#777a74]">慢 EMA 最大<input className="mt-1 block h-8 w-full rounded-lg border border-[#d6d7d0] bg-white px-2 font-mono text-[10px] font-normal text-[#151615] outline-none transition focus:border-[#5557e8]" min="2" onChange={(event) => setSlowMax(event.target.value)} type="number" value={slowMax} /></label>
            <label className="text-[9px] font-semibold text-[#777a74]">步长<input className="mt-1 block h-8 w-full rounded-lg border border-[#d6d7d0] bg-white px-2 font-mono text-[10px] font-normal text-[#151615] outline-none transition focus:border-[#5557e8]" min="1" onChange={(event) => setSearchStep(event.target.value)} type="number" value={searchStep} /></label>
          </div>
          {optimizeError && <p className="mt-3 mb-0 text-[10px] text-[#b04e4e]" role="alert">{optimizeError}</p>}

          {optimization && (
            <>
              <p className="mt-5 mb-0 text-[10px] text-[#858880]">{optimization.instrumentId} · {optimization.start} 至 {optimization.end} · 测试 {optimization.tested} 组 · 目标：夏普比率</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  { label: '最优 EMA', value: 'EMA' + optimization.best.fastPeriod + ' / EMA' + optimization.best.slowPeriod, tone: 'text-[#151615]' },
                  { label: '最优策略夏普', value: formatRatio(optimization.best.sharpeRatio), tone: (optimization.best.sharpeRatio ?? 0) >= 0 ? 'text-[#27734a]' : 'text-[#94651f]' },
                  { label: '买入持有夏普', value: formatRatio(optimization.best.benchmarkSharpeRatio), tone: (optimization.best.benchmarkSharpeRatio ?? 0) >= 0 ? 'text-[#27734a]' : 'text-[#94651f]' },
                  { label: '夏普差值', value: formatRatio((optimization.best.sharpeRatio ?? 0) - (optimization.best.benchmarkSharpeRatio ?? 0)), tone: 'text-[#5557e8]' },
                  { label: '策略收益', value: formatPercent(optimization.best.strategyReturn), tone: optimization.best.strategyReturn >= 0 ? 'text-[#27734a]' : 'text-[#94651f]' },
                ].map((metric) => <div className="rounded-2xl bg-[#f8f8f5] p-4" key={metric.label}><p className="m-0 text-[10px] font-semibold text-[#858880]">{metric.label}</p><strong className={`mt-3 block text-[22px] tracking-[-0.06em] ${metric.tone}`}>{metric.value}</strong></div>)}
              </div>

              <HyperparameterComparisonChart
                best={{ fastPeriod: optimization.best.fastPeriod, slowPeriod: optimization.best.slowPeriod }}
                candidates={optimization.candidates}
              />

              <div className="mt-5 overflow-x-auto border-t border-[#ecece7] pt-5">
                <div className="mb-3 text-[10px] font-semibold text-[#555852]">候选组合</div>
                <table className="w-full min-w-[720px] border-collapse text-left text-[10px] text-[#777a74]">
                  <thead><tr className="border-b border-[#ecece7] font-mono text-[8px] text-[#a0a29c]"><th className="pb-2 font-normal">排名</th><th className="pb-2 font-normal">EMA</th><th className="pb-2 font-normal">策略夏普</th><th className="pb-2 font-normal">基准夏普</th><th className="pb-2 font-normal">夏普差值</th><th className="pb-2 font-normal">策略收益</th><th className="pb-2 font-normal">最大回撤</th></tr></thead>
                  <tbody>{optimization.candidates.map((candidate, index) => <tr className="border-b border-[#f0f0ec] last:border-0" key={candidate.fastPeriod + '-' + candidate.slowPeriod}><td className="py-3 font-mono">{index + 1}</td><td className="py-3 font-mono font-semibold text-[#151615]">{candidate.fastPeriod} / {candidate.slowPeriod}</td><td className="py-3 font-mono font-semibold text-[#5557e8]">{formatRatio(candidate.sharpeRatio)}</td><td className="py-3 font-mono">{formatRatio(candidate.benchmarkSharpeRatio)}</td><td className="py-3 font-mono">{formatRatio(candidate.sharpeRatio - candidate.benchmarkSharpeRatio)}</td><td className={`py-3 font-mono ${candidate.strategyReturn >= 0 ? 'text-[#27734a]' : 'text-[#94651f]'}`}>{formatPercent(candidate.strategyReturn)}</td><td className="py-3 font-mono">{formatPercent(candidate.maxDrawdown)}</td></tr>)}</tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section className="mt-6 rounded-[22px] border border-[#deded7] bg-white p-5 sm:p-6" aria-labelledby="quality-title">
            <div className="flex items-start justify-between gap-4"><div><h2 className="mt-2 mb-0 text-[24px] tracking-[-0.045em]" id="quality-title">数据质量</h2></div><ShieldCheck className="size-5 text-[#63ce8f]" /></div>
            <div className="mt-7 space-y-5">
              {data.quality.map((item) => <div key={item.label}><div className="flex items-center justify-between gap-3 text-[10px] font-semibold text-[#555852]"><span>{item.label}</span><span>{item.value.toFixed(1)}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#f0f0ec]"><div className="h-full rounded-full" style={{ backgroundColor: item.color, width: `${item.value}%` }} /></div></div>)}
            </div>
        </section>

        <section className="mt-6 rounded-[22px] border border-[#deded7] bg-white p-5 sm:p-6" aria-labelledby="sources-title">
          <div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="mt-2 mb-0 text-[24px] tracking-[-0.045em]" id="sources-title">数据源健康度</h2></div><span className="rounded-full bg-[#effaf3] px-3 py-1.5 text-[10px] font-semibold text-[#27734a]">{healthySources} / {data.sources.length} 个源运行正常</span></div>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead><tr className="border-b border-[#ecece7] font-mono text-[8px] tracking-[0.08em] text-[#a0a29c]"><th className="pb-3 font-normal">数据源</th><th className="pb-3 font-normal">接入方式</th><th className="pb-3 font-normal">状态</th><th className="pb-3 font-normal">最近同步</th><th className="pb-3 font-normal">记录数</th><th className="pb-3 font-normal">覆盖率</th><th className="pb-3 font-normal">延迟</th></tr></thead>
              <tbody>{data.sources.map((source) => { const status = sourceStatusMeta[source.status]; return <tr className="border-b border-[#f0f0ec] text-[11px] text-[#555852] last:border-0" key={source.name}><td className="py-4 font-semibold text-[#151615]">{source.name}</td><td className="py-4">{source.type}</td><td className="py-4"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${status.className}`}><span className={`size-1.5 rounded-full ${status.dot}`} />{status.label}</span></td><td className="py-4 font-mono text-[10px]">{source.lastSync}</td><td className="py-4 font-mono text-[10px]">{source.records}</td><td className="py-4 font-mono text-[10px]">{source.coverage}</td><td className="py-4 font-mono text-[10px]">{source.latency}</td></tr> })}</tbody>
            </table>
          </div>
        </section>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
          <section className="rounded-[22px] border border-[#deded7] bg-white p-5 sm:p-6" aria-labelledby="alerts-title">
            <div className="flex items-start justify-between gap-4"><div><h2 className="mt-2 mb-0 text-[24px] tracking-[-0.045em]" id="alerts-title">异常与提醒</h2></div><TriangleAlert className="size-5 text-[#d9a441]" /></div>
            <div className="mt-6 space-y-3">{data.alerts.map((alert) => <div className="flex gap-3 rounded-2xl bg-[#f8f8f5] p-4" key={`${alert.time}-${alert.title}`}><span className="mt-0.5 shrink-0"><AlertIcon level={alert.level} /></span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><p className="m-0 text-[11px] font-bold text-[#3f423d]">{alert.title}</p><time className="shrink-0 font-mono text-[9px] text-[#a0a29c]">{alert.time}</time></div><p className="mt-2 mb-0 text-[10px] leading-[1.7] text-[#777a74]">{alert.description}</p></div></div>)}</div>
          </section>

          <section className="rounded-[22px] border border-[#deded7] bg-white p-5 sm:p-6" aria-labelledby="sync-title">
            <div className="flex items-start justify-between gap-4"><div><h2 className="mt-2 mb-0 text-[24px] tracking-[-0.045em]" id="sync-title">最近同步流水</h2></div><Workflow className="size-5 text-[#5557e8]" /></div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">{data.syncRuns.map((run, index) => <div className="relative flex gap-3 rounded-2xl border border-[#ecece7] p-4" key={`${run.time}-${run.label}`}><div className="relative flex flex-col items-center"><span className={`grid size-7 place-items-center rounded-full ${run.status === 'done' ? 'bg-[#effaf3] text-[#27734a]' : 'bg-[#f3f3ef] text-[#858880]'}`}><CheckCircle2 className="size-3.5" /></span>{index < data.syncRuns.length - 1 && <span className="absolute top-8 h-8 w-px bg-[#deded7] sm:hidden" />}</div><div><div className="flex items-center gap-2"><time className="font-mono text-[9px] text-[#5557e8]">{run.time}</time><span className="text-[11px] font-bold text-[#3f423d]">{run.label}</span></div><p className="mt-2 mb-0 text-[10px] leading-[1.7] text-[#858880]">{run.detail}</p></div></div>)}</div>
          </section>
        </div>

      </div>
    </main>
  )
}

import { useId, useMemo, useState, type MouseEvent } from 'react'
import type { QuantBacktest } from '../../data/quant'

type ChartWindow = 'all' | '90d' | '30d'
type PanelKey = 'price' | 'return' | 'drawdown'

interface PerformancePoint {
  date: string
  close: number | null
  closeReturn: number | null
  strategyReturn: number
  benchmarkReturn: number
  drawdown: number
  benchmarkDrawdown: number
}

interface ChartSeries {
  key: string
  label: string
  color: string
  values: Array<number | null>
  dash?: string
}

interface ChartPanel {
  key: PanelKey
  title: string
  unit: string
  top: number
  height: number
  minimum: number
  maximum: number
  ticks: number[]
  series: ChartSeries[]
  y: (value: number) => number
}

interface BacktestPerformanceChartProps {
  backtest: QuantBacktest
  className?: string
}

const chartWidth = 860
const left = 64
const right = 22
const top = 18
const bottom = 36
const panelHeight = 134
const panelGap = 16

const windowOptions: Array<{ key: ChartWindow; label: string }> = [
  { key: 'all', label: '全部' },
  { key: '90d', label: '近 90 日' },
  { key: '30d', label: '近 30 日' },
]

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`
}

function formatRatio(value?: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '--'
}

function formatMoney(value: number) {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatPrice(value: number) {
  if (Math.abs(value) >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
  return value.toFixed(2)
}

function formatAxisValue(value: number, unit: string) {
  if (unit === '%') return `${(value * 100).toFixed(0)}%`
  return formatPrice(value)
}

function niceTicks(minimum: number, maximum: number, targetCount = 4) {
  if (minimum === maximum) return [minimum]

  const roughStep = (maximum - minimum) / targetCount
  const magnitude = 10 ** Math.floor(Math.log10(roughStep))
  const normalized = roughStep / magnitude
  const multiplier = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1
  const step = multiplier * magnitude
  const first = Math.ceil(minimum / step) * step
  const ticks: number[] = []

  for (let value = first; value <= maximum + step * 0.001; value += step) {
    ticks.push(Number(value.toFixed(6)))
  }

  return ticks.length > 0 ? ticks : [minimum, maximum]
}

function linePath(values: Array<number | null>, x: (index: number) => number, y: (value: number) => number) {
  let path = ''
  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) return
    path += `${path ? ' L' : 'M'} ${x(index)} ${y(value)}`
  })
  return path
}

function areaPath(values: Array<number | null>, baseline: number, x: (index: number) => number, y: (value: number) => number) {
  const indexes = values.map((value, index) => value === null || !Number.isFinite(value) ? -1 : index).filter((index) => index >= 0)
  if (indexes.length === 0) return ''
  const first = indexes[0]
  const last = indexes[indexes.length - 1]
  const line = indexes.map((index) => `${index === first ? 'M' : 'L'} ${x(index)} ${y(values[index] ?? baseline)}`).join(' ')
  return `${line} L ${x(last)} ${y(baseline)} L ${x(first)} ${y(baseline)} Z`
}

function dateIndexes(length: number, count = 6) {
  if (length <= 1) return [0]
  const size = Math.min(length, count)
  return Array.from({ length: size }, (_, index) => Math.round(index * (length - 1) / (size - 1)))
}

function tone(value: number) {
  return value >= 0 ? 'text-[#27734a]' : 'text-[#94651f]'
}

export function BacktestPerformanceChart({ backtest, className = '' }: BacktestPerformanceChartProps) {
  const titleId = useId()
  const [window, setWindow] = useState<ChartWindow>('all')
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const points = useMemo<PerformancePoint[]>(() => {
    const initialCapital = backtest.initialCapital > 0 ? backtest.initialCapital : 1
    const firstClose = backtest.equityCurve.find((point) => typeof point.close === 'number' && Number.isFinite(point.close))?.close ?? null
    return backtest.equityCurve.map((point, index) => {
      const benchmarkPeak = Math.max(...backtest.equityCurve.slice(0, index + 1).map((item) => item.benchmark))
      const benchmarkDrawdown = benchmarkPeak > 0 ? point.benchmark / benchmarkPeak - 1 : 0
      const close = typeof point.close === 'number' && Number.isFinite(point.close) ? point.close : null
      return {
        date: point.date,
        close,
        closeReturn: close !== null && firstClose !== null && firstClose > 0 ? close / firstClose - 1 : null,
        strategyReturn: point.equity / initialCapital - 1,
        benchmarkReturn: point.benchmark / initialCapital - 1,
        drawdown: point.drawdown,
        benchmarkDrawdown,
      }
    })
  }, [backtest])

  const visiblePoints = useMemo(() => {
    const length = window === 'all' ? points.length : Math.min(points.length, window === '90d' ? 90 : 30)
    return points.slice(-length)
  }, [points, window])

  const hasCloseSeries = visiblePoints.some((point) => point.close !== null)
  const currentIndex = visiblePoints.length === 0 ? 0 : Math.min(activeIndex ?? visiblePoints.length - 1, visiblePoints.length - 1)
  const currentPoint = visiblePoints[currentIndex]

  const geometry = useMemo(() => {
    if (visiblePoints.length === 0) return null

    const panelKeys: PanelKey[] = hasCloseSeries ? ['price', 'return', 'drawdown'] : ['return', 'drawdown']
    const chartHeight = top + panelKeys.length * panelHeight + (panelKeys.length - 1) * panelGap + bottom
    const innerWidth = chartWidth - left - right
    const x = (index: number) => left + index / Math.max(visiblePoints.length - 1, 1) * innerWidth
    const seriesByPanel: Record<PanelKey, ChartSeries[]> = {
      price: [{ key: 'close', label: '收盘价', color: '#151615', values: visiblePoints.map((point) => point.close) }],
      return: [
        { key: 'strategy-return', label: '策略收益', color: '#5557e8', values: visiblePoints.map((point) => point.strategyReturn) },
        { key: 'benchmark-return', label: '买入持有', color: '#a0a29c', dash: '5 5', values: visiblePoints.map((point) => point.benchmarkReturn) },
        { key: 'close-return', label: '价格收益', color: '#d9a441', dash: '3 4', values: visiblePoints.map((point) => point.closeReturn) },
      ],
      drawdown: [
        { key: 'strategy-drawdown', label: '策略回撤', color: '#c55656', values: visiblePoints.map((point) => point.drawdown) },
        { key: 'benchmark-drawdown', label: '基准回撤', color: '#a0a29c', dash: '5 5', values: visiblePoints.map((point) => point.benchmarkDrawdown) },
      ],
    }

    const panelTitles: Record<PanelKey, { title: string; unit: string }> = {
      price: { title: '收盘价曲线', unit: 'USDT' },
      return: { title: '收益曲线', unit: '%' },
      drawdown: { title: '回撤曲线', unit: '%' },
    }

    const panels: ChartPanel[] = panelKeys.map((key, index) => {
      const values = seriesByPanel[key].flatMap((series) => series.values.filter((value): value is number => value !== null && Number.isFinite(value)))
      let minimum = values.length > 0 ? Math.min(...values) : 0
      let maximum = values.length > 0 ? Math.max(...values) : 1
      if (key !== 'price') {
        minimum = Math.min(minimum, 0)
        maximum = Math.max(maximum, 0)
      }
      if (minimum === maximum) {
        minimum -= key === 'price' ? 1 : 0.01
        maximum += key === 'price' ? 1 : 0.01
      }
      const padding = (maximum - minimum) * 0.12
      minimum -= padding
      maximum += padding
      if (key !== 'price') maximum = Math.max(maximum, 0)
      const panelTop = top + index * (panelHeight + panelGap)
      const y = (value: number) => panelTop + panelHeight - ((value - minimum) / Math.max(maximum - minimum, 1e-9)) * panelHeight
      return { key, ...panelTitles[key], top: panelTop, height: panelHeight, minimum, maximum, ticks: niceTicks(minimum, maximum), series: seriesByPanel[key], y }
    })

    return { chartHeight, x, panels, dateTicks: dateIndexes(visiblePoints.length) }
  }, [hasCloseSeries, visiblePoints])

  if (!geometry || !currentPoint) {
    return <div className={`rounded-2xl bg-[#f8f8f5] p-5 text-[10px] text-[#858880] ${className}`}>暂无可展示的回测曲线</div>
  }

  const handleMouseMove = (event: MouseEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const viewX = (event.clientX - bounds.left) / Math.max(bounds.width, 1) * chartWidth
    const chartLeft = left
    const chartRight = chartWidth - right
    const ratio = Math.max(0, Math.min(1, (viewX - chartLeft) / (chartRight - chartLeft)))
    setActiveIndex(Math.round(ratio * Math.max(visiblePoints.length - 1, 0)))
  }

  const metrics = [
    { label: '策略收益', value: formatPercent(backtest.strategyReturn), className: tone(backtest.strategyReturn) },
    { label: '买入持有', value: formatPercent(backtest.benchmarkReturn), className: tone(backtest.benchmarkReturn) },
    { label: '超额收益', value: formatPercent(backtest.excessReturn), className: tone(backtest.excessReturn) },
    { label: '最大回撤', value: formatPercent(backtest.maxDrawdown), className: 'text-[#94651f]' },
    { label: '策略夏普', value: formatRatio(backtest.sharpeRatio), className: tone(backtest.sharpeRatio ?? 0) },
    { label: '基准夏普', value: formatRatio(backtest.benchmarkSharpeRatio), className: tone(backtest.benchmarkSharpeRatio ?? 0) },
    { label: '最终权益', value: formatMoney(backtest.finalEquity), className: 'text-[#151615]' },
    { label: '交易次数', value: String(backtest.totalTrades), className: 'text-[#151615]' },
  ]

  return (
    <section className={`mt-5 ${className}`} aria-labelledby={titleId}>
      <h3 className="sr-only" id={titleId}>EMA 回测收益、收盘价与回撤图表</h3>

      <div className="overflow-x-auto rounded-2xl border border-[#ecece7] bg-[#f8f8f5]" role="list" aria-label="回测单值指标">
        <div className="flex min-w-max divide-x divide-[#e5e6df]">
          {metrics.map((metric) => (
            <div className="min-w-[116px] flex-1 px-4 py-3" key={metric.label} role="listitem">
              <p className="m-0 text-[9px] font-semibold text-[#858880]">{metric.label}</p>
              <strong className={`mt-1.5 block text-[17px] tracking-[-0.05em] ${metric.className}`}>{metric.value}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="m-0 text-[11px] font-bold text-[#555852]">收益 / 行情 / 回撤</p>
          <p className="mt-1 mb-0 text-[9px] text-[#858880]">三组曲线共用时间轴，悬停图表可查看同一交易日的收盘价、收益和回撤</p>
        </div>
        <div className="flex rounded-full bg-[#f2f2ee] p-1" role="tablist" aria-label="回测时间范围">
          {windowOptions.map((option) => (
            <button
              aria-selected={window === option.key}
              className={`cursor-pointer rounded-full border-0 px-3 py-1.5 text-[9px] font-semibold ${window === option.key ? 'bg-white text-[#151615] shadow-sm' : 'bg-transparent text-[#858880]'}`}
              key={option.key}
              onClick={() => setWindow(option.key)}
              role="tab"
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl bg-[#f8f8f5] p-2 sm:p-3">
        <svg
          aria-label="EMA 回测收盘价、收益和回撤曲线"
          className="h-auto w-full"
          onMouseMove={handleMouseMove}
          role="img"
          viewBox={`0 0 ${chartWidth} ${geometry.chartHeight}`}
        >
          {geometry.panels.map((panel) => (
            <g key={panel.key}>
              <rect fill="#fbfbf8" height={panel.height} rx="12" width={chartWidth - left - right} x={left} y={panel.top} />
              <text fill="#555852" fontSize="11" fontWeight="600" x={left + 12} y={panel.top + 19}>{panel.title}</text>
              <text fill="#a0a29c" fontSize="9" textAnchor="end" x={chartWidth - right - 12} y={panel.top + 19}>{panel.unit}</text>
              {panel.ticks.map((tick) => (
                <g key={`${panel.key}-${tick}`}>
                  <line stroke={tick === 0 && panel.key !== 'price' ? '#bfc1ba' : '#e6e7e1'} strokeDasharray={tick === 0 && panel.key !== 'price' ? '3 3' : '4 5'} x1={left} x2={chartWidth - right} y1={panel.y(tick)} y2={panel.y(tick)} />
                  <text fill="#a0a29c" fontSize="9" textAnchor="end" x={left - 9} y={panel.y(tick) + 3}>{formatAxisValue(tick, panel.unit)}</text>
                </g>
              ))}
              {panel.series.map((series) => (
                <g key={series.key}>
                  {panel.key === 'drawdown' && series.key === 'strategy-drawdown' && <path d={areaPath(series.values, 0, geometry.x, panel.y)} fill="#c55656" opacity=".08" />}
                  <path d={linePath(series.values, geometry.x, panel.y)} fill="none" stroke={series.color} strokeDasharray={series.dash} strokeLinecap="round" strokeLinejoin="round" strokeWidth={series.key === 'strategy-return' || series.key === 'close' ? 2.8 : 2} />
                </g>
              ))}
            </g>
          ))}

          <line stroke="#5557e8" strokeDasharray="3 4" strokeOpacity=".42" x1={geometry.x(currentIndex)} x2={geometry.x(currentIndex)} y1={top} y2={geometry.chartHeight - bottom} />
          {geometry.panels.map((panel) => panel.series.map((series) => {
            const value = series.values[currentIndex]
            if (value === null || !Number.isFinite(value)) return null
            return <circle cx={geometry.x(currentIndex)} cy={panel.y(value)} fill="#fff" key={`${panel.key}-${series.key}-active`} r="4" stroke={series.color} strokeWidth="2" />
          }))}

          {geometry.dateTicks.map((index) => (
            <text fill="#858880" fontSize="9" key={`date-${index}`} textAnchor="middle" x={geometry.x(index)} y={geometry.chartHeight - 9}>{visiblePoints[index].date}</text>
          ))}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[9px] text-[#777a74]">
        {geometry.panels.flatMap((panel) => panel.series).map((series) => <span className="inline-flex items-center gap-1.5" key={series.key}><span className="h-0.5 w-4" style={{ backgroundColor: series.color }} />{series.label}</span>)}
        {!hasCloseSeries && <span className="text-[#94651f]">当前回测数据尚未返回收盘价字段</span>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[#ecece7] bg-white px-3 py-2 text-[9px] text-[#777a74]">
        <strong className="font-mono text-[#5557e8]">{currentPoint.date}</strong>
        {currentPoint.close !== null && <span>收盘 {formatPrice(currentPoint.close)}</span>}
        <span>策略收益 {formatPercent(currentPoint.strategyReturn)}</span>
        <span>买入持有 {formatPercent(currentPoint.benchmarkReturn)}</span>
        <span className="text-[#94651f]">策略回撤 {formatPercent(currentPoint.drawdown)}</span>
        <span>基准回撤 {formatPercent(currentPoint.benchmarkDrawdown)}</span>
      </div>
    </section>
  )
}

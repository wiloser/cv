import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { QuantOptimizationCandidate } from '../../data/quant'

interface HyperparameterPoint {
  fastPeriod: number
  slowPeriod: number
}

interface ComparisonPoint {
  date: string
  strategyReturn: number
  drawdown: number
}

interface CandidateSeries {
  candidate: QuantOptimizationCandidate
  key: string
  label: string
  color: string
  points: ComparisonPoint[]
}

export interface HyperparameterComparisonChartProps {
  candidates: QuantOptimizationCandidate[]
  best: HyperparameterPoint
  className?: string
}

const chartWidth = 960
const chartHeight = 440
const plotLeft = 78
const plotRight = 28
const plotTop = 42
const plotBottom = 68
const plotWidth = chartWidth - plotLeft - plotRight
const plotHeight = chartHeight - plotTop - plotBottom
const colors = ['#5658d9', '#398b69', '#d19032', '#cf5b62', '#7d69c7', '#328899', '#b36691', '#7d8794', '#a24e4e', '#507a9b']

function candidateKey(candidate: HyperparameterPoint) {
  return `${candidate.fastPeriod}-${candidate.slowPeriod}`
}

function formatPercent(value: number, digits = 2) {
  const rounded = Number((value * 100).toFixed(digits))
  return `${rounded.toFixed(digits)}%`
}

function niceTicks(minimum: number, maximum: number, targetCount = 6) {
  if (Math.abs(maximum - minimum) < 1e-9) return [minimum]

  const roughStep = (maximum - minimum) / targetCount
  const magnitude = 10 ** Math.floor(Math.log10(roughStep))
  const normalized = roughStep / magnitude
  const multiplier = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1
  const step = multiplier * magnitude
  const first = Math.ceil(minimum / step) * step
  const ticks: number[] = []

  for (let value = first; value <= maximum + step * 0.001; value += step) {
    ticks.push(Number(value.toFixed(8)))
  }

  return ticks.length > 0 ? ticks : [minimum, maximum]
}

function dateIndexes(length: number, targetCount = 6) {
  if (length <= 1) return [0]
  const count = Math.min(length, targetCount)
  return Array.from({ length: count }, (_, index) => Math.round((index * (length - 1)) / (count - 1)))
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

function interpolate(points: ComparisonPoint[], position: number, value: (point: ComparisonPoint) => number) {
  if (points.length === 0) return 0
  const lowerIndex = Math.floor(clamp(position, 0, points.length - 1))
  const upperIndex = Math.min(points.length - 1, lowerIndex + 1)
  const ratio = position - lowerIndex
  const lowerValue = value(points[lowerIndex])
  const upperValue = value(points[upperIndex])
  return lowerValue + (upperValue - lowerValue) * ratio
}

function linePath(points: ComparisonPoint[], value: (point: ComparisonPoint) => number, x: (index: number) => number, y: (value: number) => number) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(2)} ${y(value(point)).toFixed(2)}`).join(' ')
}

export function HyperparameterComparisonChart({ candidates, best, className = '' }: HyperparameterComparisonChartProps) {
  const titleId = useId()
  const [selectedKey, setSelectedKey] = useState('')
  const [hoveredKey, setHoveredKey] = useState('')
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([])
  const [hoverPosition, setHoverPosition] = useState<number | null>(null)
  const [pinnedPosition, setPinnedPosition] = useState<number | null>(null)

  const chart = useMemo(() => {
    const series = candidates.map((candidate, index): CandidateSeries | null => {
      const rawPoints = candidate.equityCurve ?? []
      const initialEquity = rawPoints[0]?.equity ?? 0
      if (rawPoints.length === 0 || initialEquity <= 0) return null

      return {
        candidate,
        key: candidateKey(candidate),
        label: `EMA${candidate.fastPeriod} / EMA${candidate.slowPeriod}`,
        color: colors[index % colors.length],
        points: rawPoints.map((point) => ({
          date: point.date,
          strategyReturn: point.equity / initialEquity - 1,
          drawdown: point.drawdown,
        })),
      }
    }).filter((item): item is CandidateSeries => item !== null)

    if (series.length === 0) return null

    const values = series.flatMap((item) => item.points.flatMap((point) => [point.strategyReturn, point.drawdown]))
    const minimum = Math.min(0, ...values)
    const maximum = Math.max(0, ...values)
    const range = Math.max(maximum - minimum, 1e-9)
    const sharedX = (index: number) => plotLeft + (index / Math.max(series[0].points.length - 1, 1)) * plotWidth
    const sharedY = (value: number) => plotTop + ((maximum - value) / range) * plotHeight

    return {
      series,
      dates: series[0].points.map((point) => point.date),
      ticks: niceTicks(minimum, maximum),
      sharedX,
      sharedY,
      xIndexes: dateIndexes(series[0].points.length),
    }
  }, [candidates])

  if (!chart) {
    return <div className={`rounded-2xl bg-[#f8f8f5] p-5 text-[10px] text-[#858880] ${className}`}>优化结果未包含候选组合曲线，请重新执行寻找最优</div>
  }

  const bestKey = candidateKey(best)
  const visibleSeries = chart.series.filter((series) => !hiddenKeys.includes(series.key))
  const plottedSeries = visibleSeries.length > 0 ? visibleSeries : chart.series
  const requestedActiveKey = hoveredKey || selectedKey || bestKey
  const activeSeries = plottedSeries.find((series) => series.key === requestedActiveKey) ?? plottedSeries.find((series) => series.key === bestKey) ?? plottedSeries[0]
  const activeKey = activeSeries.key
  const activeCandidate = activeSeries.candidate
  const zeroY = chart.sharedY(0)
  const displayPosition = hoverPosition ?? pinnedPosition
  const displayIndex = displayPosition === null ? null : Math.round(displayPosition)
  const displayDate = displayIndex === null ? '' : chart.dates[clamp(displayIndex, 0, chart.dates.length - 1)]
  const displayValues = displayPosition === null
    ? []
    : plottedSeries.map((series) => ({
        series,
        strategyReturn: interpolate(series.points, displayPosition, (point) => point.strategyReturn),
        drawdown: interpolate(series.points, displayPosition, (point) => point.drawdown),
      }))

  const resolveCursorPosition = (event: PointerEvent<SVGRectElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const ratio = bounds.width > 0 ? (event.clientX - bounds.left) / bounds.width : 0
    return clamp(ratio, 0, 1) * Math.max(chart.dates.length - 1, 1)
  }

  const handleChartPointerMove = (event: PointerEvent<SVGRectElement>) => {
    setHoverPosition(resolveCursorPosition(event))
  }

  const handleChartPointerUp = (event: PointerEvent<SVGRectElement>) => {
    const position = resolveCursorPosition(event)
    setPinnedPosition((current) => current !== null && Math.abs(current - position) < 0.05 ? null : position)
  }

  const toggleSeriesVisibility = (key: string) => {
    setSelectedKey(key)
    setHiddenKeys((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key)
      const visibleCount = chart.series.filter((series) => !current.includes(series.key)).length
      return visibleCount <= 1 ? current : [...current, key]
    })
  }

  const handleSeriesKeyDown = (event: KeyboardEvent<SVGGElement>, key: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setSelectedKey(key)
    }
  }

  const orderedSeries = [...plottedSeries].sort((left, right) => Number(left.key === activeKey) - Number(right.key === activeKey))

  return (
    <section className={`mt-5 overflow-hidden rounded-2xl bg-[#f8f8f5] p-3 sm:p-4 ${className}`} aria-labelledby={titleId}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-[13px] font-bold text-[#3f423d]" id={titleId}>收益 / 回撤同图对比</h3>
          <p className="mt-1 mb-0 text-[9px] text-[#858880]">全部候选组合绘制在同一坐标系：实线代表累计收益，虚线代表回撤，所有曲线共用日期与百分比坐标</p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[9px] font-semibold text-[#858880]">
          <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 rounded-full bg-[#5658d9]" />收益</span>
          <span className="inline-flex items-center gap-1"><span className="w-4 border-t border-dashed border-[#5658d9]" />回撤</span>
          <span className="text-[#c0c2bd]">·</span>
          <span>前 {chart.series.length} 组</span>
        </div>
      </div>

      <div className="relative mt-3 overflow-x-auto rounded-2xl border border-[#e8e9ed] bg-white p-2 sm:p-3">
        {displayPosition !== null && (
          <div className="pointer-events-none absolute right-4 top-4 z-10 max-w-[calc(100%-2rem)] rounded-xl border border-[#dfe2ef] bg-white/95 px-3 py-2 shadow-sm backdrop-blur-sm" role="tooltip">
            <div className="flex items-center justify-between gap-3 text-[9px] font-semibold text-[#555852]">
              <span>{pinnedPosition !== null && hoverPosition === null ? '已定位日期' : '光标日期'} · {displayDate}</span>
              <span className="font-normal text-[#9298a6]">收益 / 回撤</span>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 xl:grid-cols-4">
              {displayValues.map(({ series, strategyReturn, drawdown }) => (
                <div className="flex min-w-0 items-center gap-1.5 text-[9px]" key={series.key}>
                  <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: series.color }} />
                  <span className="max-w-[96px] truncate text-[#6f7480]">{series.label}</span>
                  <span className="shrink-0 font-mono text-[#27734a]">{formatPercent(strategyReturn, 1)}</span>
                  <span className="shrink-0 font-mono text-[#94651f]">{formatPercent(drawdown, 1)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <svg aria-label="超参数组合收益与回撤同图对比" className="h-auto min-w-[760px] w-full" role="img" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
          <title>超参数组合收益与回撤同图对比</title>
          <desc>实线为累计收益，虚线为回撤。所有候选组合共用交易日期和百分比坐标，可悬停查看同一日期的所有曲线。</desc>
          <rect fill="#fbfcff" height={plotHeight} rx="16" stroke="#edf0f7" width={plotWidth} x={plotLeft} y={plotTop} />
          <rect fill="#f8fbff" height={zeroY - plotTop} rx="16" width={plotWidth} x={plotLeft} y={plotTop} />
          <rect fill="#fffaf5" height={plotTop + plotHeight - zeroY} rx="16" width={plotWidth} x={plotLeft} y={zeroY} />

          <text fill="#303340" fontSize="12" fontWeight="700" x={plotLeft + 14} y={plotTop + 22}>收益 / 回撤曲线</text>
          <text fill="#9298a6" fontSize="9" textAnchor="end" x={chartWidth - plotRight - 14} y={plotTop + 22}>同一百分比坐标</text>

          {chart.ticks.map((tick) => (
            <g key={`y-${tick}`}>
              <line stroke={Math.abs(tick) < 1e-9 ? '#aeb5c5' : '#e1e5ee'} strokeDasharray={Math.abs(tick) < 1e-9 ? undefined : '2 6'} strokeWidth={Math.abs(tick) < 1e-9 ? 1.5 : 1} x1={plotLeft} x2={chartWidth - plotRight} y1={chart.sharedY(tick)} y2={chart.sharedY(tick)} />
              <text fill="#9298a6" fontSize="10" textAnchor="end" x={plotLeft - 12} y={chart.sharedY(tick) + 4}>{formatPercent(tick, 0)}</text>
            </g>
          ))}

          <text className="axis-title" data-axis="y" fill="#6f7480" fontSize="10" fontWeight="600" textAnchor="middle" transform={`rotate(-90 18 ${plotTop + plotHeight / 2})`} x="18" y={plotTop + plotHeight / 2}>收益 / 回撤（%）</text>

          {chart.xIndexes.map((index) => (
            <g key={`x-${index}`}>
              <line opacity="0.8" stroke="#e4e7ee" strokeDasharray="2 7" x1={chart.sharedX(index)} x2={chart.sharedX(index)} y1={plotTop} y2={plotTop + plotHeight} />
              <text fill="#9298a6" fontSize="9" textAnchor={index === 0 ? 'start' : index === chart.dates.length - 1 ? 'end' : 'middle'} x={chart.sharedX(index)} y={plotTop + plotHeight + 22}>{chart.dates[index]}</text>
            </g>
          ))}

          <text className="axis-title" data-axis="x" fill="#6f7480" fontSize="10" fontWeight="600" textAnchor="middle" x={plotLeft + plotWidth / 2} y={plotTop + plotHeight + 48}>交易日期（全部曲线共用）</text>

          {orderedSeries.map((series) => {
            const isBest = series.key === bestKey
            const isActive = series.key === activeKey
            const opacity = isActive ? 0.98 : 0.58
            const returnWidth = isActive ? 2.8 : isBest ? 2.2 : 1.45
            const drawdownWidth = isActive ? 2.1 : isBest ? 1.8 : 1.15
            const lastIndex = series.points.length - 1
            return (
              <g
                aria-label={`${series.label}，策略收益 ${formatPercent(series.candidate.strategyReturn)}，最大回撤 ${formatPercent(series.candidate.maxDrawdown)}`}
                className="cursor-pointer outline-none"
                key={series.key}
                onClick={() => setSelectedKey(series.key)}
                onFocus={() => setSelectedKey(series.key)}
                onKeyDown={(event) => handleSeriesKeyDown(event, series.key)}
                onMouseEnter={() => setHoveredKey(series.key)}
                onMouseLeave={() => setHoveredKey('')}
                role="button"
                tabIndex={0}
              >
                <path d={linePath(series.points, (point) => point.drawdown, chart.sharedX, chart.sharedY)} fill="none" opacity={opacity * 0.72} stroke={series.color} strokeDasharray="5 5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={drawdownWidth} />
                <path d={linePath(series.points, (point) => point.strategyReturn, chart.sharedX, chart.sharedY)} fill="none" opacity={opacity} stroke={series.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={returnWidth} />
                {isBest && <circle cx={chart.sharedX(lastIndex)} cy={chart.sharedY(series.points[lastIndex].strategyReturn)} fill="#fff" r="4" stroke={series.color} strokeWidth="2" />}
                <title>{`${series.label} · 策略收益 ${formatPercent(series.candidate.strategyReturn)} · 最大回撤 ${formatPercent(series.candidate.maxDrawdown)}`}</title>
              </g>
            )
          })}

          {displayPosition !== null && (
            <g data-chart-hover-guide="cross-series" pointerEvents="none">
              <line stroke="#5658d9" strokeDasharray="3 4" strokeOpacity="0.55" strokeWidth="1" x1={chart.sharedX(displayPosition)} x2={chart.sharedX(displayPosition)} y1={plotTop} y2={plotTop + plotHeight} />
              {displayValues.map(({ series, strategyReturn }) => (
                <circle data-chart-hover-marker="return" cx={chart.sharedX(displayPosition)} cy={chart.sharedY(strategyReturn)} fill={series.color} key={series.key} r="3.5" stroke="#fff" strokeWidth="1.5" />
              ))}
            </g>
          )}

          <rect
            aria-label="按交易日期查看全部候选组合"
            className="cursor-pointer"
            data-chart-hit="cross-series"
            data-chart-hover-overlay="cross-series"
            fill="transparent"
            height={plotHeight}
            onPointerCancel={() => setHoverPosition(null)}
            onPointerLeave={() => setHoverPosition(null)}
            onPointerMove={handleChartPointerMove}
            onPointerUp={handleChartPointerUp}
            width={plotWidth}
            x={plotLeft}
            y={plotTop}
          />
        </svg>
      </div>

      <div className="mt-3 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4" aria-label="超参数组合图例">
        {chart.series.map((series) => {
          const isBest = series.key === bestKey
          const isActive = series.key === activeKey
          const isVisible = !hiddenKeys.includes(series.key)
          return (
            <button
              aria-label={`${isVisible ? '隐藏' : '显示'} ${series.label}曲线`}
              aria-pressed={isVisible}
              className={`flex min-w-0 cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition ${isActive && isVisible ? 'border-[#cfd0f7] bg-white shadow-sm' : isVisible ? 'border-transparent bg-transparent hover:border-[#ecece7] hover:bg-white' : 'border-transparent bg-transparent opacity-45 hover:bg-white'}`}
              key={series.key}
              onClick={() => toggleSeriesVisibility(series.key)}
              onMouseEnter={() => isVisible && setHoveredKey(series.key)}
              onMouseLeave={() => setHoveredKey('')}
              type="button"
            >
              <span className="flex shrink-0 items-center gap-0.5" aria-hidden="true">
                <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: series.color }} />
                <span className="w-3 border-t border-dashed" style={{ borderColor: series.color }} />
              </span>
              <span className={`min-w-0 flex-1 truncate text-[9px] font-semibold ${isVisible ? 'text-[#555852]' : 'text-[#9298a6] line-through'}`}>{series.label}{isBest ? ' · 最优' : ''}</span>
              <span className="shrink-0 font-mono text-[9px] text-[#27734a]">{formatPercent(series.candidate.strategyReturn)}</span>
              <span className="shrink-0 font-mono text-[9px] text-[#94651f]">{formatPercent(series.candidate.maxDrawdown)}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[9px] text-[#858880]" aria-live="polite">
        <span>{pinnedPosition !== null ? '已固定一个交易日期，点击图表可更换' : '悬停图表查看同一交易日的全部候选组合，点击可固定日期'}</span>
        {pinnedPosition !== null && <button className="cursor-pointer text-[#5658d9] underline underline-offset-2" onClick={() => setPinnedPosition(null)} type="button">取消日期定位</button>}
      </div>

      <div className="mt-2 grid gap-3 rounded-xl border border-[#ecece7] bg-white p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div>
          <p className="m-0 text-[9px] font-semibold text-[#858880]">当前选中组合 · 图例可切换曲线显隐</p>
          <strong className="mt-1 block text-[18px] tracking-[-0.05em] text-[#151615]">{activeSeries.label}</strong>
        </div>
        <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-[9px] sm:grid-cols-4">
          <div><span className="text-[#a0a29c]">策略夏普</span><strong className="ml-1 font-mono text-[#5557e8]">{activeCandidate.sharpeRatio.toFixed(2)}</strong></div>
          <div><span className="text-[#a0a29c]">策略收益</span><strong className="ml-1 font-mono text-[#27734a]">{formatPercent(activeCandidate.strategyReturn)}</strong></div>
          <div><span className="text-[#a0a29c]">最大回撤</span><strong className="ml-1 font-mono text-[#94651f]">{formatPercent(activeCandidate.maxDrawdown)}</strong></div>
          <div><span className="text-[#a0a29c]">交易次数</span><strong className="ml-1 font-mono text-[#151615]">{activeCandidate.totalTrades}</strong></div>
        </div>
      </div>
    </section>
  )
}

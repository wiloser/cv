import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpDown,
  ArrowUpRight,
  CircleAlert,
  ChevronDown,
  ChevronUp,
  Plus,
  RefreshCw,
  Search,
  Star,
  UserRound,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getQuantUser, updateQuantWatchlist } from '../data/quantAccount'
import { quantMarketUrl, type QuantMarketQuote, type QuantMonitorData, type QuantUser } from '../data/quant'

interface QuantOverviewPageProps {
  initialData: QuantMonitorData
}

interface InstrumentDefinition {
  symbol: string
  baseCurrency: string
  quoteCurrency: string
  category: string
}

const shell = 'mx-auto w-[calc(100%_-_28px)] max-w-[1280px] sm:w-[calc(100%_-_48px)]'

type MarketSortKey = 'symbol' | 'last' | 'change24h' | 'high24h' | 'low24h' | 'volume24h' | 'volumeCurrency24h'
type SortDirection = 'asc' | 'desc'

function normalizeSymbol(value: string) {
  return value.trim().toUpperCase().replace('/', '-')
}

function isValidSymbol(value: string) {
  return /^[A-Z0-9]{2,16}-[A-Z0-9]{2,8}$/.test(value)
}

function formatPrice(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '--'
  return value.toLocaleString('en-US', { minimumFractionDigits: value >= 1000 ? 2 : 3, maximumFractionDigits: value >= 1000 ? 2 : 6 })
}

function formatCompact(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '--'
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value)
}

function formatTime(value?: string) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date)
}

function formatPercent(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--'
  return `${(value * 100).toFixed(2)}%`
}

function initials(symbol: string) {
  return symbol.split('-')[0].slice(0, 2)
}

function instrumentFor(symbol: string) {
  const [baseCurrency = symbol, quoteCurrency = ''] = symbol.split('-')
  return { symbol, baseCurrency, quoteCurrency, category: quoteCurrency ? `OKX 现货 · ${quoteCurrency}` : '自定义关注' }
}

function changeTone(change?: number) {
  if (typeof change !== 'number' || !Number.isFinite(change)) return 'text-[#858880]'
  return change >= 0 ? 'text-[#27734a]' : 'text-[#a04444]'
}

function QuoteSummary({ quote }: { quote?: QuantMarketQuote }) {
  if (!quote) {
    return <div className="text-right"><span className="font-mono text-[12px] text-[#a0a29c]">--</span><span className="mt-1 block text-[9px] text-[#b4b6b0]">等待行情</span></div>
  }

  return (
    <div className="text-right">
      <strong className="block font-mono text-[13px] tracking-[-0.03em] text-[#151615]">{formatPrice(quote.last)}</strong>
      <span className={`mt-1 inline-flex items-center gap-0.5 font-mono text-[9px] font-semibold ${changeTone(quote.change24h)}`}>
        {quote.change24h >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
        {formatPercent(quote.change24h)}
      </span>
    </div>
  )
}

function QuoteDetail({ quote }: { quote?: QuantMarketQuote }) {
  return (
    <div className="hidden min-w-[214px] grid-cols-3 gap-4 text-right sm:grid">
      <div><span className="block text-[8px] text-[#a0a29c]">24h 高</span><strong className="mt-1 block font-mono text-[10px] font-medium text-[#555852]">{formatPrice(quote?.high24h)}</strong></div>
      <div><span className="block text-[8px] text-[#a0a29c]">24h 低</span><strong className="mt-1 block font-mono text-[10px] font-medium text-[#555852]">{formatPrice(quote?.low24h)}</strong></div>
      <div><span className="block text-[8px] text-[#a0a29c]">成交量</span><strong className="mt-1 block font-mono text-[10px] font-medium text-[#555852]">{formatCompact(quote?.volume24h)}</strong></div>
    </div>
  )
}

function InstrumentRow({ instrument, quote, watched, onToggle }: { instrument: InstrumentDefinition; quote?: QuantMarketQuote; watched: boolean; onToggle: () => void }) {
  return (
    <div className="group flex items-center gap-3 border-b border-[#efefe9] py-3.5 last:border-0">
      <Link className="flex min-w-0 flex-1 items-center gap-3 no-underline" to={`/quant/${encodeURIComponent(instrument.symbol)}`}>
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f1f2fb] font-mono text-[10px] font-bold text-[#5557e8]">{initials(instrument.symbol)}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2"><strong className="font-mono text-[11px] text-[#151615]">{instrument.symbol}</strong><span className="truncate text-[10px] text-[#858880]">{instrument.baseCurrency}</span></span>
          <span className="mt-1 block truncate text-[9px] text-[#a0a29c]">{instrument.category}</span>
        </span>
        <QuoteDetail quote={quote} />
        <QuoteSummary quote={quote} />
        <ArrowRight className="size-4 shrink-0 text-[#b2b4ae] transition group-hover:translate-x-0.5 group-hover:text-[#5557e8]" aria-hidden="true" />
      </Link>
      <button aria-label={`${watched ? '取消关注' : '关注'} ${instrument.symbol}`} aria-pressed={watched} className={`grid size-8 shrink-0 cursor-pointer place-items-center rounded-full transition ${watched ? 'bg-[#f4f4df] text-[#a57816]' : 'text-[#b4b6b0] hover:bg-[#f5f5f0] hover:text-[#a57816]'}`} onClick={onToggle} type="button">
        <Star className="size-3.5" fill={watched ? 'currentColor' : 'none'} />
      </button>
    </div>
  )
}

function SortButton({ label, column, sortKey, sortDirection, onSort }: { label: string; column: MarketSortKey; sortKey: MarketSortKey; sortDirection: SortDirection; onSort: (column: MarketSortKey) => void }) {
  const active = sortKey === column
  return (
    <button aria-label={`按${label}${active && sortDirection === 'desc' ? '降序' : '升序'}排序`} className={`inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[9px] font-semibold transition ${active ? 'text-[#5557e8]' : 'text-[#858880] hover:text-[#151615]'}`} onClick={() => onSort(column)} type="button">
      {label}
      {active ? (sortDirection === 'asc' ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />) : <ArrowUpDown className="size-3 text-[#b4b6b0]" />}
    </button>
  )
}

function MarketTable({ quotes, watchlist, onToggle, sortKey, sortDirection, onSort }: { quotes: QuantMarketQuote[]; watchlist: string[]; onToggle: (symbol: string) => void; sortKey: MarketSortKey; sortDirection: SortDirection; onSort: (column: MarketSortKey) => void }) {
  return (
    <div className="max-h-[720px] overflow-auto rounded-xl border border-[#efefe9]">
      <table className="w-full min-w-[900px] border-collapse text-left">
        <thead className="sticky top-0 z-10 bg-[#fbfbf8]/95 backdrop-blur-sm">
          <tr className="border-b border-[#deded7]">
            <th className="px-4 py-3"><SortButton column="symbol" label="标的" onSort={onSort} sortDirection={sortDirection} sortKey={sortKey} /></th>
            <th className="px-4 py-3 text-right"><SortButton column="last" label="最新价" onSort={onSort} sortDirection={sortDirection} sortKey={sortKey} /></th>
            <th className="px-4 py-3 text-right"><SortButton column="change24h" label="24h 涨跌" onSort={onSort} sortDirection={sortDirection} sortKey={sortKey} /></th>
            <th className="px-4 py-3 text-right"><SortButton column="high24h" label="24h 高" onSort={onSort} sortDirection={sortDirection} sortKey={sortKey} /></th>
            <th className="px-4 py-3 text-right"><SortButton column="low24h" label="24h 低" onSort={onSort} sortDirection={sortDirection} sortKey={sortKey} /></th>
            <th className="px-4 py-3 text-right"><SortButton column="volume24h" label="24h 成交量" onSort={onSort} sortDirection={sortDirection} sortKey={sortKey} /></th>
            <th className="px-4 py-3 text-right"><SortButton column="volumeCurrency24h" label="24h 成交额" onSort={onSort} sortDirection={sortDirection} sortKey={sortKey} /></th>
            <th className="w-12 px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {quotes.map((quote) => {
            const instrument = instrumentFor(quote.instrumentId)
            const watched = watchlist.includes(quote.instrumentId)
            return (
              <tr className="group border-b border-[#efefe9] transition last:border-0 hover:bg-[#fbfbf8]" key={quote.instrumentId}>
                <td className="px-4 py-3">
                  <Link className="flex items-center gap-3 no-underline" to={`/quant/${encodeURIComponent(quote.instrumentId)}`}>
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#f1f2fb] font-mono text-[9px] font-bold text-[#5557e8]">{initials(quote.instrumentId)}</span>
                    <span className="min-w-0"><strong className="block font-mono text-[11px] text-[#151615]">{quote.instrumentId}</strong><span className="mt-1 block text-[9px] text-[#a0a29c]">{instrument.baseCurrency} / {instrument.quoteCurrency}</span></span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-right font-mono text-[11px] text-[#151615]">{formatPrice(quote.last)}</td>
                <td className={`px-4 py-3 text-right font-mono text-[10px] font-semibold ${changeTone(quote.change24h)}`}>{formatPercent(quote.change24h)}</td>
                <td className="px-4 py-3 text-right font-mono text-[10px] text-[#555852]">{formatPrice(quote.high24h)}</td>
                <td className="px-4 py-3 text-right font-mono text-[10px] text-[#555852]">{formatPrice(quote.low24h)}</td>
                <td className="px-4 py-3 text-right font-mono text-[10px] text-[#555852]">{formatCompact(quote.volume24h)}</td>
                <td className="px-4 py-3 text-right font-mono text-[10px] text-[#555852]">{formatCompact(quote.volumeCurrency24h)} <span className="text-[8px] text-[#a0a29c]">{instrument.quoteCurrency}</span></td>
                <td className="px-4 py-3 text-right"><button aria-label={`${watched ? '取消关注' : '关注'} ${quote.instrumentId}`} aria-pressed={watched} className={`grid size-7 cursor-pointer place-items-center rounded-full transition ${watched ? 'bg-[#f4f4df] text-[#a57816]' : 'text-[#b4b6b0] hover:bg-[#f5f5f0] hover:text-[#a57816]'}`} onClick={() => onToggle(quote.instrumentId)} type="button"><Star className="size-3.5" fill={watched ? 'currentColor' : 'none'} /></button></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function QuantOverviewPage({ initialData }: QuantOverviewPageProps) {
  const [user, setUser] = useState<QuantUser | null>(null)
  const [accountLoading, setAccountLoading] = useState(true)
  const [accountError, setAccountError] = useState('')
  const [accountNotice, setAccountNotice] = useState('')
  const [watchlist, setWatchlist] = useState<string[]>([])
  const [quotes, setQuotes] = useState<QuantMarketQuote[]>([])
  const [marketLoading, setMarketLoading] = useState(Boolean(quantMarketUrl))
  const [marketError, setMarketError] = useState('')
  const [search, setSearch] = useState('')
  const [customSymbol, setCustomSymbol] = useState('')
  const [addError, setAddError] = useState('')
  const [sortKey, setSortKey] = useState<MarketSortKey>('symbol')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  useEffect(() => {
    let active = true
    getQuantUser()
      .then((currentUser) => {
        if (!active) return
        setUser(currentUser)
        setWatchlist(currentUser?.watchlist ?? [])
      })
      .catch((error: unknown) => { if (active) setAccountError(error instanceof Error ? error.message : '账户状态读取失败') })
      .finally(() => { if (active) setAccountLoading(false) })
    return () => { active = false }
  }, [])

  const refreshQuotes = useCallback(async () => {
    if (!quantMarketUrl) {
      setMarketLoading(false)
      return
    }
    setMarketLoading(true)
    setMarketError('')
    try {
      const marketEndpoint = new URL(quantMarketUrl, window.location.origin)
      marketEndpoint.searchParams.set('quoteCcy', 'USDT')
      const response = await fetch(marketEndpoint.toString(), { cache: 'no-store' })
      if (!response.ok) throw new Error(`行情读取失败：${response.status}`)
      const result = await response.json() as QuantMarketQuote[]
      setQuotes(result)
    } catch (error: unknown) {
      setMarketError(error instanceof Error ? error.message : '行情读取失败')
    } finally {
      setMarketLoading(false)
    }
  }, [])

  useEffect(() => {
    const initialTimer = window.setTimeout(() => { void refreshQuotes() }, 0)
    const timer = window.setInterval(() => { void refreshQuotes() }, 60_000)
    return () => {
      window.clearTimeout(initialTimer)
      window.clearInterval(timer)
    }
  }, [refreshQuotes])

  useEffect(() => {
    document.title = '量化监测 · 标的关注'
  }, [])

  const fallbackQuote = useMemo<QuantMarketQuote | undefined>(() => {
    const points = initialData.backtest?.equityCurve ?? []
    const lastPoint = points[points.length - 1]
    if (!lastPoint || typeof lastPoint.close !== 'number') return undefined
    return {
      instrumentId: initialData.instrumentId ?? 'BTC-USDT',
      last: lastPoint.close,
      open24h: lastPoint.close,
      high24h: lastPoint.close,
      low24h: lastPoint.close,
      volume24h: 0,
      volumeCurrency24h: 0,
      change24h: 0,
      updatedAt: initialData.updatedAt,
    }
  }, [initialData])

  const marketQuotes = useMemo(() => quotes.length > 0 ? quotes : fallbackQuote ? [fallbackQuote] : [], [fallbackQuote, quotes])

  const quoteMap = useMemo(() => {
    const map = new Map(marketQuotes.map((quote) => [quote.instrumentId, quote]))
    return map
  }, [marketQuotes])

  const watchedInstruments = useMemo(() => watchlist.map(instrumentFor), [watchlist])
  const filteredMarketQuotes = useMemo(() => {
    const normalized = search.trim().toLowerCase()
    const filtered = marketQuotes.filter((quote) => `${quote.instrumentId} ${instrumentFor(quote.instrumentId).baseCurrency} ${instrumentFor(quote.instrumentId).quoteCurrency}`.toLowerCase().includes(normalized))
    return [...filtered].sort((left, right) => {
      const leftValue = sortKey === 'symbol' ? left.instrumentId : left[sortKey]
      const rightValue = sortKey === 'symbol' ? right.instrumentId : right[sortKey]
      const comparison = typeof leftValue === 'string' && typeof rightValue === 'string' ? leftValue.localeCompare(rightValue) : Number(leftValue) - Number(rightValue)
      if (comparison === 0) return left.instrumentId.localeCompare(right.instrumentId)
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [marketQuotes, search, sortDirection, sortKey])

  const handleSort = (column: MarketSortKey) => {
    if (column === sortKey) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortKey(column)
    setSortDirection(column === 'symbol' ? 'asc' : 'desc')
  }

  const toggleWatchlist = (symbol: string) => {
    if (!user) {
      setAccountNotice('登录后才能保存关注列表，并接收买入 / 卖出信号邮件。')
      return
    }
    const next = watchlist.includes(symbol) ? watchlist.filter((item) => item !== symbol) : [symbol, ...watchlist]
    setWatchlist(next)
    setAccountError('')
    void updateQuantWatchlist(next)
      .then((updated) => { setUser(updated); setWatchlist(updated.watchlist) })
      .catch((error: unknown) => {
        setWatchlist(watchlist)
        setAccountError(error instanceof Error ? error.message : '关注列表保存失败')
      })
  }

  const addCustomSymbol = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalized = normalizeSymbol(customSymbol)
    if (!isValidSymbol(normalized)) {
      setAddError('请输入类似 BTC-USDT 的 OKX 标的')
      return
    }
    if (!user) {
      setAccountNotice('登录后才能保存自定义关注标的。')
      return
    }
    const next = watchlist.includes(normalized) ? watchlist : [normalized, ...watchlist]
    setWatchlist(next)
    setAccountError('')
    void updateQuantWatchlist(next)
      .then((updated) => { setUser(updated); setWatchlist(updated.watchlist) })
      .catch((error: unknown) => {
        setWatchlist(watchlist)
        setAccountError(error instanceof Error ? error.message : '关注列表保存失败')
      })
    setCustomSymbol('')
    setAddError('')
  }

  const latestMarketTime = quotes.reduce((latest, quote) => quote.updatedAt > latest ? quote.updatedAt : latest, initialData.updatedAt)

  return (
    <main>
      <section className="overflow-hidden bg-[#151615] text-white">
        <div className={`${shell} relative py-9 sm:py-14`}>
          <div className="pointer-events-none absolute -right-20 -top-36 size-[420px] rounded-full border border-[#5557e8]/25" aria-hidden="true" />
          <div className="pointer-events-none absolute right-24 top-16 size-32 rounded-full border border-[#d9ff63]/20" aria-hidden="true" />
          <Link className="relative inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-2 text-[10px] font-semibold text-white/65 no-underline transition hover:border-white/40 hover:text-white" to="/">返回工作台</Link>

          <div className="relative mt-9 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
            <div>
              <p className="m-0 font-mono text-[10px] font-semibold tracking-[0.22em] text-[#d9ff63]">MARKET WATCH / OKX SPOT</p>
              <h1 className="mt-4 mb-0 max-w-[760px] text-[42px] leading-[1.04] tracking-[-0.065em] sm:text-[66px]">关注市场，<br />再进入策略细节。</h1>
              <p className="mt-6 mb-0 max-w-[620px] text-[12px] leading-[1.8] text-white/55">从 OKX 全量标的中建立自己的关注列表，再进入单个标的的 EMA 回测、超参比较和收益曲线分析。</p>
            </div>

            <div className="rounded-[22px] border border-white/10 bg-white/[.06] p-5 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-[11px] font-semibold text-white/80"><span className="size-2 rounded-full bg-[#63ce8f] shadow-[0_0_0_5px_rgba(99,206,143,.12)]" /> 行情管道</span>
                <span className="rounded-full bg-[#d9ff63] px-2 py-1 font-mono text-[8px] font-bold text-[#151615]">{marketLoading ? 'SYNC' : marketError ? 'WARN' : 'LIVE'}</span>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
                <div><dt className="font-mono text-[8px] text-white/35">我的关注</dt><dd className="mt-1 text-[20px] font-semibold text-white">{watchlist.length}</dd></div>
                <div><dt className="font-mono text-[8px] text-white/35">OKX 标的</dt><dd className="mt-1 text-[20px] font-semibold text-white">{marketQuotes.length || '--'}</dd></div>
              </dl>
              <p className="mt-4 mb-0 text-[10px] text-white/45">行情更新时间 · {formatTime(latestMarketTime)}</p>
              <Link className="mt-4 inline-flex items-center gap-2 text-[10px] font-bold text-[#d9ff63] no-underline hover:underline" to="/quant/account"><UserRound className="size-3.5" />{accountLoading ? '读取账户…' : user ? user.email : '登录并设置通知'}</Link>
            </div>
          </div>
        </div>
      </section>

      <div className={`${shell} py-8 sm:py-12`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="m-0 font-mono text-[9px] font-semibold tracking-[0.16em] text-[#5557e8]">WATCHLIST</p>
            <h2 className="mt-2 mb-0 text-[28px] tracking-[-0.055em]">市场观察</h2>
            <p className="mt-2 mb-0 text-[10px] text-[#858880]">关注列表跟随账户保存，点击标的进入独立详情页。</p>
          </div>
          <button className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-[#d6d7d0] bg-white px-3.5 text-[10px] font-bold text-[#555852] transition hover:border-[#151615] hover:text-[#151615] disabled:cursor-not-allowed disabled:opacity-60" disabled={marketLoading} onClick={() => { void refreshQuotes() }} type="button"><RefreshCw className={`size-3.5 ${marketLoading ? 'animate-spin' : ''}`} />{marketLoading ? '刷新中' : '刷新行情'}</button>
        </div>

        {(accountNotice || accountError) && <div className="mt-5 flex items-start gap-2 rounded-xl bg-[#fff8e8] px-3.5 py-3 text-[10px] leading-[1.6] text-[#94651f]" role="status"><CircleAlert className="mt-0.5 size-3.5 shrink-0" />{accountNotice || accountError}<Link className="ml-auto shrink-0 font-bold text-[#5557e8] no-underline hover:underline" to="/quant/account">账户设置 →</Link></div>}

        <section className="mt-6 rounded-[22px] border border-[#deded7] bg-white p-5 sm:p-6" aria-labelledby="watchlist-title">
            <div className="flex items-center justify-between gap-3"><div><h2 className="m-0 text-[18px] tracking-[-0.04em]" id="watchlist-title">我的关注</h2><p className="mt-1 mb-0 text-[9px] text-[#a0a29c]">{watchlist.length} 个标的</p></div><Star className="size-5 text-[#a57816]" /></div>
            <form className="mt-5 flex gap-2" onSubmit={addCustomSymbol}>
              <label className="sr-only" htmlFor="custom-quant-symbol">添加关注标的</label>
              <input className="h-9 min-w-0 flex-1 rounded-lg border border-[#d6d7d0] bg-[#fbfbf8] px-3 font-mono text-[10px] text-[#151615] outline-none transition placeholder:text-[#b4b6b0] focus:border-[#5557e8]" id="custom-quant-symbol" onChange={(event) => setCustomSymbol(event.target.value)} placeholder="输入 OKX 标的，例如 BTC-USDT" value={customSymbol} />
              <button className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-[#151615] px-3 text-[10px] font-bold text-white transition hover:bg-[#5557e8]" type="submit"><Plus className="size-3.5" />关注</button>
            </form>
            {addError && <p className="mt-2 mb-0 text-[9px] text-[#a04444]" role="alert">{addError}</p>}

            <div className="mt-4">
              {watchedInstruments.length > 0 ? watchedInstruments.map((instrument) => <InstrumentRow instrument={instrument} key={instrument.symbol} onToggle={() => toggleWatchlist(instrument.symbol)} quote={quoteMap.get(instrument.symbol)} watched />) : <div className="rounded-xl bg-[#f8f8f5] px-4 py-8 text-center text-[10px] text-[#858880]">{user ? '还没有关注标的，从下方全量列表添加。' : '登录后管理你的关注列表并接收信号邮件。'}</div>}
            </div>
        </section>

        <section className="mt-6 rounded-[22px] border border-[#deded7] bg-white p-5 sm:p-6" aria-labelledby="market-list-title">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="m-0 font-mono text-[9px] font-semibold tracking-[0.16em] text-[#5557e8]">MARKET LIST</p><h2 className="mt-2 mb-0 text-[22px] tracking-[-0.05em]" id="market-list-title">OKX 全量标的</h2><p className="mt-1 mb-0 text-[9px] text-[#a0a29c]">{marketQuotes.length} 个 USDT 现货标的 · 点击列名切换正序 / 反序</p></div>
            <label className="relative"><span className="sr-only">搜索标的</span><Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#a0a29c]" /><input className="h-9 w-[190px] rounded-lg border border-[#d6d7d0] bg-[#fbfbf8] pl-8 pr-2 font-mono text-[10px] text-[#151615] outline-none transition placeholder:text-[#b4b6b0] focus:border-[#5557e8]" onChange={(event) => setSearch(event.target.value)} placeholder="搜索 symbol / 币种" value={search} /></label>
          </div>
          {marketError && <p className="mt-4 mb-0 rounded-xl bg-[#fff8e8] px-3 py-2 text-[9px] text-[#94651f]" role="status">{marketError}，仍可进入详情页拉取数据。</p>}
          <div className="mt-5">
            <MarketTable onSort={handleSort} onToggle={toggleWatchlist} quotes={filteredMarketQuotes} sortDirection={sortDirection} sortKey={sortKey} watchlist={watchlist} />
            {filteredMarketQuotes.length === 0 && <p className="py-8 text-center text-[10px] text-[#858880]">{marketLoading ? '正在读取 OKX 全量标的…' : '没有匹配的标的'}</p>}
          </div>
        </section>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#deded7] pt-5 text-[9px] text-[#a0a29c]">
          <span>数据源：OKX public market tickers · 每 60 秒刷新</span>
          <span>点击标的名称进入 EMA 详情</span>
        </div>
      </div>
    </main>
  )
}

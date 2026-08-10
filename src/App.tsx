import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  Code2,
  Command,
  Compass,
  GraduationCap,
  Layers3,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import { CaseDetail } from './components/ProjectDetail'
import { CaseCard } from './components/RepositoryCard'
import { loadSiteContent, type SiteContent } from './data/content'
import type { GraduationCase } from './data/projects'
import { getResourceBySlug, type ResourcePost } from './data/resources'

const shell = 'mx-auto w-[calc(100%_-_28px)] max-w-[1280px] sm:w-[calc(100%_-_48px)]'

interface SiteContentProps {
  resources: ResourcePost[]
  cases: GraduationCase[]
}

interface SearchIntent {
  label: string
  triggers: string[]
  signals: string[]
}

const searchIntents: SearchIntent[] = [
  { label: '推荐系统', triggers: ['推荐', '个性化', '协同过滤', 'usercf', '算法'], signals: ['推荐', '个性化', 'usercf', '协同过滤', '评分', '行为'] },
  { label: '数据可视化', triggers: ['数据', '分析', '可视化', '图表', '大屏', 'echarts'], signals: ['数据', '分析', '可视化', '图表', 'echarts', '词云', '趋势'] },
  { label: 'AI / NLP', triggers: ['ai', '人工智能', '智能', 'nlp', '自然语言', '模型', '情感'], signals: ['ai', '智能', 'nlp', '模型', '情感', 'snownlp'] },
  { label: 'Python', triggers: ['python', 'django', '后端'], signals: ['python', 'django', 'drf', '后端'] },
  { label: '前后端应用', triggers: ['网站', '平台', '管理系统', '前后端', 'web', 'react'], signals: ['系统', '平台', 'react', 'django', 'drf', '管理'] },
  { label: '教育场景', triggers: ['教育', '学习', '课程', '知识图谱', '路径'], signals: ['学习', '课程', '知识', '路径', '掌握度'] },
  { label: '电商场景', triggers: ['电商', '商城', '商品', '购物', '订单'], signals: ['商城', '商品', '购物', '订单', '库存'] },
  { label: '文旅场景', triggers: ['旅游', '景点', '文旅', '目的地'], signals: ['旅游', '景点', '目的地', '足迹'] },
  { label: '内容分析', triggers: ['b站', 'bilibili', '弹幕', '舆情'], signals: ['b站', 'bilibili', '弹幕', '舆情', '关键词'] },
]

const quickSearches = [
  'Python 推荐系统',
  '带数据可视化的项目',
  'React + Django',
  '适合做算法改进',
]

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, '')
}

function getQuerySignals(query: string) {
  const normalizedQuery = normalize(query)
  const signals = new Set<string>()
  const labels: string[] = []

  searchIntents.forEach((intent) => {
    if (intent.triggers.some((trigger) => normalizedQuery.includes(normalize(trigger)))) {
      labels.push(intent.label)
      intent.signals.forEach((signal) => signals.add(normalize(signal)))
    }
  })

  const directTokens = query.toLowerCase().match(/[a-z][a-z0-9.+#-]{1,}|[\u4e00-\u9fa5]{2,6}/g) ?? []
  directTokens.forEach((token) => {
    const cleaned = normalize(token)
    if (!['一个', '一些', '想做', '最好', '适合', '项目', '系统', '毕业设计', '毕设'].includes(cleaned)) {
      signals.add(cleaned)
    }
  })

  return { signals: [...signals], labels }
}

function getSearchableFields(item: GraduationCase) {
  return {
    primary: normalize([item.title, item.category, item.language, ...item.technologies].join(' ')),
    secondary: normalize([item.tagline, ...item.features].join(' ')),
    tertiary: normalize([item.description, ...item.highlights, ...item.environment].join(' ')),
  }
}

function scoreProject(item: GraduationCase, signals: string[]) {
  if (signals.length === 0) return 1
  const fields = getSearchableFields(item)

  return signals.reduce((score, signal) => {
    if (fields.primary.includes(signal)) return score + 12
    if (fields.secondary.includes(signal)) return score + 7
    if (fields.tertiary.includes(signal)) return score + 3
    return score
  }, 0)
}

function getMatchReasons(item: GraduationCase, signals: string[]) {
  if (signals.length === 0) return []
  const candidateLabels = [item.category, item.language, ...item.technologies, ...item.features, ...item.highlights]
  const matches: string[] = []

  signals.forEach((signal) => {
    const exact = candidateLabels.find((candidate) => normalize(candidate).includes(signal))
    if (exact) {
      const concise = exact.length > 18 ? signal : exact
      if (!matches.includes(concise)) matches.push(concise)
    }
  })

  return matches.slice(0, 3)
}

function matchesTechnology(item: GraduationCase, technology: string) {
  if (technology === '全部技术') return true
  const haystack = normalize([item.language, item.category, ...item.technologies, ...item.highlights].join(' '))
  const groups: Record<string, string[]> = {
    Python: ['python'],
    'React': ['react'],
    'Django': ['django', 'drf'],
    '推荐算法': ['推荐', 'usercf', '协同过滤'],
    '数据可视化': ['数据分析', 'echarts', '词云', '可视化'],
  }
  return (groups[technology] ?? [technology]).some((keyword) => haystack.includes(normalize(keyword)))
}

function ScrollManager() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) {
      window.requestAnimationFrame(() => document.querySelector(hash)?.scrollIntoView({ block: 'start' }))
    } else {
      window.scrollTo(0, 0)
    }
  }, [hash, pathname])

  return null
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[#deded7] bg-[#f6f6f2]/92 backdrop-blur-xl">
      <div className={`${shell} flex min-h-[68px] items-center gap-5`}>
        <Link className="group inline-flex items-center gap-2.5 text-[#151615] no-underline" to="/" aria-label="毕设集首页">
          <span className="grid size-9 place-items-center rounded-[10px] bg-[#151615] text-[#d9ff63] shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)] transition group-hover:rotate-[-4deg] group-hover:bg-[#5557e8]" aria-hidden="true">
            <GraduationCap className="size-[19px]" />
          </span>
          <span>
            <strong className="block text-[16px] leading-none tracking-[-0.04em]">毕设集</strong>
            <span className="mt-1 block font-mono text-[7px] leading-none tracking-[0.16em] text-[#8a8c85]">PROJECT ATLAS</span>
          </span>
        </Link>

        <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="主导航">
          <Link className="rounded-full px-3.5 py-2 text-[12px] font-semibold text-[#5f625d] no-underline transition hover:bg-white hover:text-[#151615]" to="/#projects">发现项目</Link>
          <Link className="rounded-full px-3.5 py-2 text-[12px] font-semibold text-[#5f625d] no-underline transition hover:bg-white hover:text-[#151615]" to="/#topics">热门方向</Link>
          <Link className="rounded-full px-3.5 py-2 text-[12px] font-semibold text-[#5f625d] no-underline transition hover:bg-white hover:text-[#151615]" to="/#guides">选题指南</Link>
        </nav>

        <Link className="ml-auto inline-flex min-h-9 items-center gap-2 rounded-full bg-[#151615] px-4 text-[11px] font-bold text-white no-underline transition hover:bg-[#5557e8] md:ml-2" to="/#smart-search">
          <Sparkles className="size-3.5 text-[#d9ff63]" aria-hidden="true" />
          智能检索
          <span className="hidden items-center gap-0.5 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[8px] text-white/60 sm:inline-flex"><Command className="size-2.5" /> K</span>
        </Link>
      </div>
    </header>
  )
}

function SearchIllustration({ cases }: { cases: GraduationCase[] }) {
  const topics = [
    { name: '智能推荐', count: cases.filter((item) => item.category === '推荐系统').length, width: '82%' },
    { name: '数据分析', count: cases.filter((item) => item.category === '数据分析').length, width: '58%' },
    { name: '前后端应用', count: cases.length, width: '94%' },
  ]

  return (
    <div className="relative mx-auto w-full max-w-[520px] lg:ml-auto">
      <div className="absolute -top-4 -right-3 size-28 rounded-full bg-[#d9ff63] blur-[1px]" aria-hidden="true" />
      <div className="relative overflow-hidden rounded-[26px] border border-[#2e302e] bg-[#171817] p-5 text-white shadow-[0_28px_70px_rgba(20,22,20,.18)] sm:p-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <p className="m-0 font-mono text-[9px] tracking-[0.14em] text-[#d9ff63]">TOPIC RADAR / 2026</p>
            <h2 className="mt-2 mb-0 text-lg tracking-[-0.035em]">本周选题雷达</h2>
          </div>
          <span className="relative flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/5">
            <span className="absolute size-2 animate-ping rounded-full bg-[#d9ff63] motion-reduce:animate-none" />
            <span className="size-2 rounded-full bg-[#d9ff63]" />
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white/[0.06] p-4">
            <span className="font-mono text-[9px] text-white/45">已收录项目</span>
            <strong className="mt-4 block text-3xl tracking-[-0.06em]">{String(cases.length).padStart(2, '0')}</strong>
          </div>
          <div className="rounded-2xl bg-[#5557e8] p-4">
            <span className="font-mono text-[9px] text-white/65">完整资料率</span>
            <strong className="mt-4 block text-3xl tracking-[-0.06em]">100%</strong>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {topics.map((topic, index) => (
            <div key={topic.name}>
              <div className="mb-2 flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-2"><span className="font-mono text-[8px] text-white/35">0{index + 1}</span>{topic.name}</span>
                <span className="font-mono text-[9px] text-white/40">{topic.count} 个</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-[#d9ff63]" style={{ width: topic.width }} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.035] px-3.5 py-3">
          <div className="flex -space-x-2" aria-hidden="true">
            {['#d9ff63', '#8ce1ff', '#ffb98d', '#b7a6ff'].map((color) => <span className="size-7 rounded-full border-2 border-[#171817]" key={color} style={{ background: color }} />)}
          </div>
          <span className="text-[10px] text-white/50">每个项目均可在线预览</span>
        </div>
      </div>
      <div className="absolute -bottom-5 -left-4 hidden rotate-[-4deg] rounded-xl border border-[#d7d8d1] bg-white px-4 py-3 shadow-lg sm:block">
        <span className="font-mono text-[8px] text-[#8a8c85]">SMART MATCH</span>
        <p className="mt-1 mb-0 text-[11px] font-bold text-[#151615]">技术栈 + 场景 + 功能</p>
      </div>
    </div>
  )
}

function HomePage({ resources, cases }: SiteContentProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [category, setCategory] = useState(searchParams.get('category') ?? '全部方向')
  const [technology, setTechnology] = useState(searchParams.get('tech') ?? '全部技术')
  const [sort, setSort] = useState<'relevance' | 'latest'>('relevance')
  const inputRef = useRef<HTMLInputElement>(null)
  const deferredQuery = useDeferredValue(query)
  const queryAnalysis = useMemo(() => getQuerySignals(deferredQuery), [deferredQuery])
  const categories = useMemo(() => ['全部方向', ...new Set(cases.map((item) => item.category))], [cases])
  const technologies = ['全部技术', 'Python', 'React', 'Django', '推荐算法', '数据可视化']

  useEffect(() => {
    document.title = '毕设集 · 毕业设计项目聚合与智能检索平台'
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      if ((event.key === '/' && !isTyping) || (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey))) {
        event.preventDefault()
        inputRef.current?.focus()
        document.getElementById('smart-search')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    const next = new URLSearchParams()
    if (query.trim()) next.set('q', query.trim())
    if (category !== '全部方向') next.set('category', category)
    if (technology !== '全部技术') next.set('tech', technology)
    setSearchParams(next, { replace: true })
  }, [category, query, setSearchParams, technology])

  const results = useMemo(() => {
    const ranked = cases
      .map((item) => ({ item, score: scoreProject(item, queryAnalysis.signals) }))
      .filter(({ item, score }) => {
        const matchesQuery = !deferredQuery.trim() || score > 0
        const matchesCategory = category === '全部方向' || item.category === category
        return matchesQuery && matchesCategory && matchesTechnology(item, technology)
      })

    return ranked.sort((a, b) => {
      if (sort === 'latest') return b.item.completedAt.localeCompare(a.item.completedAt)
      return b.score - a.score || b.item.completedAt.localeCompare(a.item.completedAt)
    })
  }, [cases, category, deferredQuery, queryAnalysis.signals, sort, technology])

  const chooseSearch = (nextQuery: string) => {
    setQuery(nextQuery)
    window.requestAnimationFrame(() => document.getElementById('projects')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const clearFilters = () => {
    setQuery('')
    setCategory('全部方向')
    setTechnology('全部技术')
    inputRef.current?.focus()
  }

  return (
    <main>
      <section className="relative overflow-hidden border-b border-[#deded7] bg-[#f6f6f2]">
        <div className="pointer-events-none absolute inset-0 grid-noise opacity-60" aria-hidden="true" />
        <div className={`${shell} relative grid gap-12 py-12 sm:py-16 lg:grid-cols-[minmax(0,1.08fr)_minmax(380px,.78fr)] lg:items-center lg:py-20`}>
          <div>
            <p className="m-0 inline-flex items-center gap-2 rounded-full border border-[#d7d8d1] bg-white/80 px-3 py-1.5 font-mono text-[9px] font-bold tracking-[0.12em] text-[#5557e8]">
              <Sparkles className="size-3" aria-hidden="true" /> GRADUATION PROJECT DISCOVERY
            </p>
            <h1 className="mt-6 mb-0 max-w-[760px] text-[46px] leading-[1.02] font-semibold tracking-[-0.072em] text-[#151615] sm:text-[72px] lg:text-[78px]">
              找到一个，<br />真正<span className="relative mx-2 inline-block text-[#5557e8]"><span className="relative z-10">做得完</span><span className="absolute right-0 bottom-1 left-0 h-3 rounded-full bg-[#d9ff63]" aria-hidden="true" /></span>的毕设。
            </h1>
            <p className="mt-6 mb-0 max-w-[650px] text-[15px] leading-[1.85] text-[#666962] sm:text-[16px]">
              聚合可运行、可拆解、可继续扩展的本科毕设项目。输入你的技术栈、选题方向或想实现的功能，快速找到匹配案例。
            </p>

            <div className="mt-8 max-w-[720px] scroll-mt-28" id="smart-search">
              <form
                className="rounded-[20px] border border-[#cfd0c9] bg-white p-2 shadow-[0_18px_50px_rgba(21,22,21,.09)] transition focus-within:border-[#5557e8] focus-within:shadow-[0_20px_60px_rgba(85,87,232,.14)]"
                onSubmit={(event) => {
                  event.preventDefault()
                  document.getElementById('projects')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
              >
                <label className="flex min-h-[58px] items-center gap-3 px-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#eef0ff] text-[#5557e8]"><Sparkles className="size-[17px]" aria-hidden="true" /></span>
                  <span className="sr-only">智能检索毕设项目</span>
                  <input
                    className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-[#151615] outline-none placeholder:text-[#999c95] sm:text-[15px]"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="例如：想做一个 Python 推荐系统，最好有数据可视化…"
                    ref={inputRef}
                    type="search"
                    value={query}
                  />
                  {query && (
                    <button className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-[#f1f1ed] text-[#777a74] transition hover:bg-[#e5e5df]" onClick={() => setQuery('')} type="button" aria-label="清空检索">
                      <X className="size-3.5" />
                    </button>
                  )}
                  <button className="hidden min-h-11 cursor-pointer items-center gap-2 rounded-[13px] border-0 bg-[#151615] px-5 text-[11px] font-bold text-white transition hover:bg-[#5557e8] sm:inline-flex" type="submit">
                    智能匹配 <ArrowRight className="size-3.5" />
                  </button>
                </label>
                {queryAnalysis.labels.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 border-t border-[#ecece7] px-3 pt-2 pb-1 text-[10px] text-[#777a74]">
                    <Check className="size-3.5 text-[#5557e8]" aria-hidden="true" />
                    已识别
                    {queryAnalysis.labels.slice(0, 4).map((label) => <span className="rounded-full bg-[#f0f1ff] px-2 py-1 font-semibold text-[#5557e8]" key={label}>{label}</span>)}
                  </div>
                )}
              </form>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[8px] tracking-[0.08em] text-[#999c95]">试试</span>
                {quickSearches.map((item) => (
                  <button className="cursor-pointer rounded-full border border-[#deded7] bg-transparent px-2.5 py-1.5 text-[10px] text-[#666962] transition hover:border-[#5557e8] hover:bg-white hover:text-[#5557e8]" key={item} onClick={() => chooseSearch(item)} type="button">{item}</button>
                ))}
              </div>
            </div>
          </div>

          <SearchIllustration cases={cases} />
        </div>
      </section>

      <section className="border-b border-[#deded7] bg-white" id="topics" aria-labelledby="topics-title">
        <div className={`${shell} py-8 sm:py-10`}>
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="m-0 font-mono text-[9px] font-bold tracking-[0.12em] text-[#5557e8]">EXPLORE BY TOPIC</p>
              <h2 className="mt-2 mb-0 text-[24px] tracking-[-0.045em]" id="topics-title">从热门方向开始</h2>
            </div>
            <p className="m-0 hidden text-[11px] text-[#858880] sm:block">每个方向都包含源码、说明与在线演示</p>
          </div>
          <div className="grid overflow-hidden rounded-[18px] border border-[#deded7] bg-[#deded7] md:grid-cols-3">
            {[
              { label: '智能推荐', query: '个性化推荐系统', note: '协同过滤 · 冷启动 · 可解释推荐', icon: <Sparkles className="size-5" />, count: cases.filter((item) => item.category === '推荐系统').length },
              { label: '数据分析', query: '数据分析与可视化', note: '情感分析 · 趋势图表 · 关键词', icon: <BarChart3 className="size-5" />, count: cases.filter((item) => item.category === '数据分析').length },
              { label: '全栈应用', query: 'React Django 前后端', note: 'React · Django · REST API', icon: <Layers3 className="size-5" />, count: cases.length },
            ].map((topic) => (
              <button className="group flex min-h-[138px] cursor-pointer flex-col items-start bg-white p-5 text-left transition hover:bg-[#f3f3ff] sm:p-6" key={topic.label} onClick={() => chooseSearch(topic.query)} type="button">
                <span className="flex w-full items-start justify-between text-[#5557e8]">
                  {topic.icon}
                  <span className="rounded-full bg-[#f0f1ed] px-2 py-1 font-mono text-[8px] text-[#777a74]">{topic.count} CASES</span>
                </span>
                <strong className="mt-5 text-[15px] tracking-[-0.025em]">{topic.label}</strong>
                <span className="mt-1.5 text-[10px] leading-relaxed text-[#858880]">{topic.note}</span>
                <ArrowRight className="mt-auto size-4 translate-x-0 text-[#151615] opacity-0 transition group-hover:translate-x-1 group-hover:opacity-100" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={`${shell} scroll-mt-24 py-11 sm:py-16`} id="projects" aria-labelledby="projects-title">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="m-0 flex items-center gap-2 font-mono text-[9px] font-bold tracking-[0.12em] text-[#5557e8]"><Compass className="size-3.5" /> PROJECT LIBRARY</p>
            <h2 className="mt-2 mb-0 text-[30px] tracking-[-0.055em] sm:text-[38px]" id="projects-title">
              {deferredQuery.trim() ? `“${deferredQuery}” 的匹配结果` : '探索全部毕设项目'}
            </h2>
            <p className="mt-2 mb-0 text-[12px] text-[#777a74]" aria-live="polite">找到 {results.length} 个项目，每个项目均经过运行与资料完整性检查。</p>
          </div>
          {(query || category !== '全部方向' || technology !== '全部技术') && (
            <button className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[#d6d7d0] bg-white px-3 py-2 text-[10px] font-semibold text-[#666962] transition hover:border-[#151615] hover:text-[#151615]" onClick={clearFilters} type="button"><X className="size-3" /> 清除全部筛选</button>
          )}
        </div>

        <div className="mt-7 flex flex-col gap-3 rounded-[16px] border border-[#deded7] bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <SlidersHorizontal className="ml-1 size-4 shrink-0 text-[#858880]" aria-hidden="true" />
            {categories.map((item) => (
              <button
                className={`shrink-0 cursor-pointer rounded-full border px-3 py-2 text-[10px] font-semibold transition ${category === item ? 'border-[#151615] bg-[#151615] text-white' : 'border-transparent bg-[#f2f2ee] text-[#666962] hover:border-[#d1d2cb]'}`}
                key={item}
                onClick={() => setCategory(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 border-t border-[#ecece7] pt-3 sm:border-t-0 sm:pt-0">
            <label className="relative flex-1 sm:flex-none">
              <span className="sr-only">按技术筛选</span>
              <select className="min-h-9 w-full cursor-pointer appearance-none rounded-full border border-[#deded7] bg-white pr-8 pl-3 text-[10px] font-semibold text-[#5f625d] outline-none hover:border-[#b8bab2] sm:w-auto" onChange={(event) => setTechnology(event.target.value)} value={technology}>
                {technologies.map((item) => <option key={item}>{item}</option>)}
              </select>
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[8px]">▾</span>
            </label>
            <div className="flex rounded-full bg-[#f2f2ee] p-1">
              <button className={`cursor-pointer rounded-full border-0 px-2.5 py-1.5 text-[9px] font-semibold ${sort === 'relevance' ? 'bg-white text-[#151615] shadow-sm' : 'bg-transparent text-[#858880]'}`} onClick={() => setSort('relevance')} type="button">相关度</button>
              <button className={`cursor-pointer rounded-full border-0 px-2.5 py-1.5 text-[9px] font-semibold ${sort === 'latest' ? 'bg-white text-[#151615] shadow-sm' : 'bg-transparent text-[#858880]'}`} onClick={() => setSort('latest')} type="button">最新</button>
            </div>
          </div>
        </div>

        {results.length > 0 ? (
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {results.map(({ item }) => (
              <CaseCard item={item} key={item.name} matchReasons={getMatchReasons(item, queryAnalysis.signals)} />
            ))}
          </div>
        ) : (
          <div className="mt-6 grid min-h-[320px] place-items-center rounded-[22px] border border-dashed border-[#cfd0c9] bg-white text-center">
            <div className="max-w-[360px] px-6">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#f0f1ff] text-[#5557e8]"><Search className="size-5" /></span>
              <h3 className="mt-5 mb-0 text-lg">暂时没有完全匹配的项目</h3>
              <p className="mt-2 mb-0 text-[12px] leading-[1.75] text-[#777a74]">试着减少一个限定条件，或者只输入技术栈、应用场景、核心功能中的一项。</p>
              <button className="mt-5 cursor-pointer rounded-full border-0 bg-[#151615] px-4 py-2.5 text-[10px] font-bold text-white" onClick={clearFilters} type="button">查看全部项目</button>
            </div>
          </div>
        )}
      </section>

      <section className="border-y border-[#deded7] bg-[#eeefff]" id="guides" aria-labelledby="guides-title">
        <div className={`${shell} py-12 sm:py-16`}>
          <div className="grid gap-7 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
            <div>
              <span className="grid size-10 place-items-center rounded-xl bg-[#5557e8] text-white"><BookOpen className="size-5" /></span>
              <p className="mt-5 mb-0 font-mono text-[9px] font-bold tracking-[0.12em] text-[#5557e8]">FROM IDEA TO DEFENSE</p>
              <h2 className="mt-2 mb-0 text-[32px] leading-tight tracking-[-0.055em]" id="guides-title">项目不止是源码，<br />还要能讲清楚。</h2>
              <p className="mt-4 mb-0 max-w-[430px] text-[12px] leading-[1.8] text-[#666962]">配套阅读选题、实现与答辩指南，把案例拆成你自己的需求、算法与工程方案。</p>
            </div>
            <div className="grid overflow-hidden rounded-[18px] border border-[#d8d9e8] bg-[#d8d9e8] sm:grid-cols-3">
              {resources.slice(0, 3).map((resource, index) => (
                <Link className="group flex min-h-[190px] flex-col bg-white p-5 text-[#151615] no-underline transition hover:bg-[#d9ff63]" key={resource.slug} to={`/resources/${resource.slug}`}>
                  <span className="font-mono text-[9px] text-[#777a74]">0{index + 1} / {resource.readTime}</span>
                  <h3 className="mt-8 mb-0 text-[15px] leading-[1.5] tracking-[-0.025em]">{resource.title}</h3>
                  <span className="mt-auto flex items-center justify-between pt-5 text-[9px] font-bold text-[#5557e8]">{resource.category}<ArrowRight className="size-4 transition group-hover:translate-x-1" /></span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#151615] text-white">
        <div className={`${shell} flex flex-col items-start gap-6 py-12 sm:flex-row sm:items-center sm:justify-between`}>
          <div>
            <p className="m-0 font-mono text-[9px] tracking-[0.13em] text-[#d9ff63]">READY TO EXPLORE?</p>
            <h2 className="mt-2 mb-0 text-[28px] tracking-[-0.05em]">从一个可运行的案例开始。</h2>
          </div>
          <button className="inline-flex cursor-pointer items-center gap-2 rounded-full border-0 bg-[#d9ff63] px-5 py-3 text-[11px] font-bold text-[#151615] transition hover:-translate-y-0.5 hover:bg-white" onClick={() => { clearFilters(); document.getElementById('projects')?.scrollIntoView({ behavior: 'smooth' }) }} type="button">浏览项目库 <ArrowRight className="size-4" /></button>
        </div>
      </section>
    </main>
  )
}

function ResourceDetail({ resources }: Pick<SiteContentProps, 'resources'>) {
  const { slug } = useParams()
  const resource = getResourceBySlug(resources, slug)

  useEffect(() => {
    document.title = resource ? `${resource.title} · 毕设集` : '内容未找到 · 毕设集'
  }, [resource])

  if (!resource) return <Navigate replace to="/" />

  return (
    <main className={`${shell} py-9 pb-20 sm:py-12`}>
      <Link className="inline-flex items-center gap-2 text-[11px] font-semibold text-[#666962] no-underline hover:text-[#5557e8]" to="/#guides"><ArrowRight className="size-4 rotate-180" /> 返回选题指南</Link>
      <article className="mx-auto mt-9 max-w-[900px]">
        <header className="border-b border-[#d5d6cf] pb-9">
          <div className="flex flex-wrap items-center gap-2 font-mono text-[9px] text-[#777a74]"><span className="rounded-full bg-[#d9ff63] px-2.5 py-1 font-bold text-[#151615]">{resource.category}</span><time>{resource.publishedAt}</time><span>·</span><span>{resource.readTime}</span></div>
          <h1 className="mt-6 mb-0 text-[38px] leading-[1.15] tracking-[-0.055em] sm:text-[58px]">{resource.title}</h1>
          <p className="mt-5 mb-0 max-w-[760px] text-[15px] leading-[1.8] text-[#666962]">{resource.excerpt}</p>
        </header>
        <div className="mt-10 space-y-10">
          {resource.sections.map((section, index) => (
            <section className="grid gap-4 border-b border-[#deded7] pb-10 sm:grid-cols-[60px_1fr]" key={section.title}>
              <span className="font-mono text-[10px] font-bold text-[#5557e8]">0{index + 1}</span>
              <div>
                <h2 className="m-0 text-[25px] tracking-[-0.035em]">{section.title}</h2>
                <div className="mt-5 space-y-4 text-[14px] leading-[1.95] text-[#555852]">{section.paragraphs.map((paragraph) => <p className="m-0" key={paragraph}>{paragraph}</p>)}</div>
                {section.points && <ul className="mt-6 grid gap-2 p-0">{section.points.map((point) => <li className="flex list-none items-start gap-3 rounded-xl bg-white p-4 text-[12px] leading-[1.7] text-[#555852]" key={point}><Check className="mt-0.5 size-4 shrink-0 text-[#5557e8]" />{point}</li>)}</ul>}
              </div>
            </section>
          ))}
        </div>
      </article>
    </main>
  )
}

function LegacyCaseRedirect() {
  const { slug } = useParams()
  return <Navigate replace to={slug ? `/cases/${slug}` : '/#projects'} />
}

function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#151615] text-white">
      <div className={`${shell} flex flex-col gap-7 py-8 sm:flex-row sm:items-end sm:justify-between`}>
        <div>
          <Link className="inline-flex items-center gap-2.5 text-white no-underline" to="/"><span className="grid size-8 place-items-center rounded-lg bg-[#d9ff63] text-[#151615]"><GraduationCap className="size-4" /></span><strong className="tracking-[-0.04em]">毕设集</strong></Link>
          <p className="mt-3 mb-0 max-w-[520px] text-[10px] leading-[1.8] text-white/45">聚合可运行、可拆解、可扩展的毕业设计项目，为选题与实现提供真实参考。</p>
        </div>
        <div className="font-mono text-[8px] leading-[1.8] text-white/35 sm:text-right"><p className="m-0">PROJECT ATLAS · SMART DISCOVERY</p><p className="m-0">© {new Date().getFullYear()} 毕设集</p></div>
      </div>
    </footer>
  )
}

function CodesApp() {
  const [content, setContent] = useState<SiteContent | null>(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let active = true
    loadSiteContent()
      .then((nextContent) => { if (active) setContent(nextContent) })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : '内容读取失败') })
    return () => { active = false }
  }, [])

  if (loadError) {
    return <main className={`${shell} py-16`}><div className="rounded-2xl border border-red-200 bg-white p-8 text-sm text-red-700">{loadError}</div></main>
  }

  if (!content) {
    return <main className={`${shell} grid min-h-screen place-items-center py-16 text-center`}><div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#151615] text-[#d9ff63]"><Code2 className="size-5 animate-pulse" /></span><p className="mt-4 font-mono text-[9px] tracking-[0.12em] text-[#777a74]">正在整理项目索引…</p></div></main>
  }

  const { resources, cases } = content

  return (
    <div className="min-h-screen bg-[#f6f6f2] text-[#151615] selection:bg-[#d9ff63] selection:text-[#151615]">
      <ScrollManager />
      <SiteHeader />
      <Routes>
        <Route index element={<HomePage cases={cases} resources={resources} />} />
        <Route path="resources/:slug" element={<ResourceDetail resources={resources} />} />
        <Route path="cases" element={<Navigate replace to="/#projects" />} />
        <Route path="cases/:slug" element={<CaseDetail cases={cases} />} />
        <Route path="projects" element={<LegacyCaseRedirect />} />
        <Route path="projects/:slug" element={<LegacyCaseRedirect />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
      <SiteFooter />
    </div>
  )
}

export default function App() {
  return <BrowserRouter><CodesApp /></BrowserRouter>
}

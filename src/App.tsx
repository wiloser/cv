import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clipboard,
  Code2,
  Command,
  Compass,
  GraduationCap,
  Mail,
  MapPin,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  UserRound,
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
import { profile } from './data/profile'
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
  { label: 'Go / 轻量后端', triggers: ['go', 'golang', 'gin', '轻量', '低资源', '单二进制'], signals: ['go', 'golang', 'gin', 'sqlite', '轻量', '单二进制'] },
  { label: '智能调度', triggers: ['调度', '派单', '冲突', '预约'], signals: ['调度', '派单', '冲突', '预约', '评分', '可解释'] },
  { label: '实验室场景', triggers: ['实验室', '设备', '仪器'], signals: ['实验室', '设备', '仪器', '预约', '冲突'] },
  { label: '校园运维', triggers: ['报修', '维修', '运维'], signals: ['报修', '维修', '运维', '派单', '负载'] },
  { label: '志愿服务', triggers: ['志愿', '公益', '服务匹配'], signals: ['志愿', '公益', '服务', '匹配', '技能'] },
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
  'Go 智能调度系统',
  'Gin + SQLite 轻量项目',
  '带可解释算法的项目',
  'React + Go 前后端',
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
    Go: ['go', 'golang'],
    Gin: ['gin'],
    Python: ['python'],
    'React': ['react'],
    'Django': ['django', 'drf'],
    SQLite: ['sqlite'],
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
          <Link className="rounded-full px-3.5 py-2 text-[12px] font-semibold text-[#5f625d] no-underline transition hover:bg-white hover:text-[#151615]" to="/#customize">定制项目</Link>
          <Link className="inline-flex items-center gap-1.5 rounded-full border border-[#d6d7d0] bg-white px-3.5 py-2 text-[12px] font-semibold text-[#151615] no-underline transition hover:border-[#5557e8] hover:text-[#5557e8]" to="/#contact"><Mail className="size-3.5" /> 我的联系方式</Link>
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-2">
          <Link className="grid size-9 place-items-center rounded-full border border-[#d6d7d0] bg-white text-[#151615] no-underline transition hover:border-[#5557e8] hover:text-[#5557e8] md:hidden" to="/#contact" aria-label="我的联系方式"><Mail className="size-4" /></Link>
          <Link className="inline-flex min-h-9 items-center gap-2 rounded-full bg-[#151615] px-4 text-[11px] font-bold text-white no-underline transition hover:bg-[#5557e8]" to="/#smart-search">
            <Sparkles className="size-3.5 text-[#d9ff63]" aria-hidden="true" />
            智能检索
            <span className="hidden items-center gap-0.5 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[8px] text-white/60 sm:inline-flex"><Command className="size-2.5" /> K</span>
          </Link>
        </div>
      </div>
    </header>
  )
}

function HomePage({ cases }: Pick<SiteContentProps, 'cases'>) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [category, setCategory] = useState(searchParams.get('category') ?? '全部方向')
  const [technology, setTechnology] = useState(searchParams.get('tech') ?? '全部技术')
  const [sort, setSort] = useState<'relevance' | 'latest'>('relevance')
  const [requestSummary, setRequestSummary] = useState('')
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const deferredQuery = useDeferredValue(query)
  const queryAnalysis = useMemo(() => getQuerySignals(deferredQuery), [deferredQuery])
  const categories = useMemo(() => ['全部方向', ...new Set(cases.map((item) => item.category))], [cases])
  const technologies = ['全部技术', 'Go', 'Gin', 'React', 'SQLite', 'Python', 'Django', '推荐算法', '数据可视化']

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
      <section className={`${shell} scroll-mt-24 py-11 sm:py-16`} id="projects" aria-labelledby="projects-title">
        <div className="sticky top-[68px] z-40 -mx-[14px] bg-[#f6f6f2] px-[14px] py-3 sm:-mx-[24px] sm:px-[24px]">
          <div className="scroll-mt-28" id="smart-search">
          <form
            className="mx-auto max-w-[860px] rounded-[20px] border border-[#cfd0c9] bg-white p-2 shadow-[0_18px_50px_rgba(21,22,21,.09)] transition focus-within:border-[#5557e8] focus-within:shadow-[0_20px_60px_rgba(85,87,232,.14)]"
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
                placeholder="例如：想做一个 Go 智能调度系统，需要可解释算法…"
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
          </div>
        </div>
        <div className="mx-auto flex max-w-[860px] flex-wrap items-center gap-2">
            <span className="font-mono text-[8px] tracking-[0.08em] text-[#999c95]">试试</span>
            {quickSearches.map((item) => (
              <button className="cursor-pointer rounded-full border border-[#deded7] bg-transparent px-2.5 py-1.5 text-[10px] text-[#666962] transition hover:border-[#5557e8] hover:bg-white hover:text-[#5557e8]" key={item} onClick={() => chooseSearch(item)} type="button">{item}</button>
            ))}
        </div>
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
          <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
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

      <section className="border-t border-[#deded7] bg-white py-14 sm:py-20" id="customize" aria-labelledby="customize-title">
        <div className={`${shell} grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,.95fr)] lg:items-start`}>
          <div>
            <p className="m-0 flex items-center gap-2 font-mono text-[9px] font-bold tracking-[0.12em] text-[#5557e8]"><Sparkles className="size-3.5" /> PROJECT CUSTOMIZER</p>
            <h2 className="mt-3 mb-0 max-w-[680px] text-[34px] leading-[1.08] tracking-[-0.06em] sm:text-[48px]" id="customize-title">从你的需求出发，定制一套真正能跑的项目。</h2>
            <p className="mt-5 mb-0 max-w-[620px] text-[14px] leading-[1.9] text-[#666962]">不确定选题、技术栈或功能边界？填写几项关键信息，先生成一份清晰的项目需求摘要，再带着它开始沟通。</p>
            <div className="mt-7 flex flex-wrap gap-2">
              {['选题拆解', '技术栈适配', '功能规划', '论文与答辩思路'].map((item) => <span className="rounded-full border border-[#deded7] bg-[#f6f6f2] px-3 py-2 text-[10px] font-semibold text-[#555852]" key={item}>{item}</span>)}
            </div>
          </div>

          <form
            className="rounded-[24px] border border-[#d9dad3] bg-[#f6f6f2] p-5 shadow-[0_20px_55px_rgba(21,22,21,.08)] sm:p-7"
            onSubmit={(event) => {
              event.preventDefault()
              const data = new FormData(event.currentTarget)
              const summary = [
                `项目方向：${String(data.get('direction') ?? '')}`,
                `期望技术：${String(data.get('technology') ?? '')}`,
                `需求描述：${String(data.get('brief') ?? '')}`,
                `联系我：${String(data.get('contact') ?? '')}`,
              ].join('\n')
              setRequestSummary(summary)
              setCopied(false)
            }}
          >
            <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#151615] text-[#d9ff63]"><Clipboard className="size-4" /></span><div><p className="m-0 font-mono text-[8px] tracking-[0.1em] text-[#858880]">START WITH A BRIEF</p><h3 className="mt-1 mb-0 text-lg tracking-[-0.035em]">项目定制需求</h3></div></div>
            <div className="mt-6 grid gap-4">
              <label className="grid gap-2 text-[10px] font-semibold text-[#555852]">项目方向
                <select className="min-h-11 rounded-xl border border-[#d6d7d0] bg-white px-3 text-[12px] font-normal text-[#151615] outline-none focus:border-[#5557e8]" defaultValue="还没想好" name="direction">
                  <option>还没想好</option><option>推荐系统</option><option>业务管理平台</option><option>数据可视化</option><option>AI 应用</option>
                </select>
              </label>
              <label className="grid gap-2 text-[10px] font-semibold text-[#555852]">期望技术
                <input className="min-h-11 rounded-xl border border-[#d6d7d0] bg-white px-3 text-[12px] font-normal text-[#151615] outline-none placeholder:text-[#a0a29c] focus:border-[#5557e8]" name="technology" placeholder="例如：React + Go + SQLite" />
              </label>
              <label className="grid gap-2 text-[10px] font-semibold text-[#555852]">你想解决什么问题？
                <textarea className="min-h-24 resize-y rounded-xl border border-[#d6d7d0] bg-white px-3 py-3 text-[12px] font-normal leading-[1.7] text-[#151615] outline-none placeholder:text-[#a0a29c] focus:border-[#5557e8]" name="brief" placeholder="描述应用场景、核心功能或学校要求…" required />
              </label>
              <label className="grid gap-2 text-[10px] font-semibold text-[#555852]">你的联系方式
                <input className="min-h-11 rounded-xl border border-[#d6d7d0] bg-white px-3 text-[12px] font-normal text-[#151615] outline-none placeholder:text-[#a0a29c] focus:border-[#5557e8]" name="contact" placeholder="邮箱 / 微信 / 手机号" required />
              </label>
            </div>
            <button className="mt-5 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full border-0 bg-[#151615] px-4 text-[11px] font-bold text-white transition hover:bg-[#5557e8]" type="submit"><Send className="size-4" /> 生成定制需求</button>
            {requestSummary && (
              <div className="mt-5 rounded-2xl border border-[#cfe2d6] bg-[#f1fff5] p-4" role="status">
                <div className="flex items-center gap-2 text-[11px] font-bold text-[#27734a]"><CheckCircle2 className="size-4" /> 需求摘要已生成</div>
                <p className="mt-3 mb-0 whitespace-pre-line text-[11px] leading-[1.8] text-[#4d6255]">{requestSummary}</p>
                <button className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#b9d9c4] bg-white px-3 py-2 text-[10px] font-semibold text-[#27734a] transition hover:border-[#27734a]" onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(requestSummary)
                    setCopied(true)
                  } catch {
                    setCopied(false)
                  }
                }} type="button"><Clipboard className="size-3.5" /> {copied ? '已复制，可发给我' : '复制需求摘要'}</button>
              </div>
            )}
          </form>
        </div>
      </section>

      <section className="border-t border-[#deded7] bg-[#f6f6f2] py-14 sm:py-20" id="contact" aria-labelledby="contact-title">
        <div className={`${shell} grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(340px,.85fr)] lg:items-end`}>
          <div>
            <p className="m-0 flex items-center gap-2 font-mono text-[9px] font-bold tracking-[0.12em] text-[#5557e8]"><UserRound className="size-3.5" /> CONTACT</p>
            <h2 className="mt-3 mb-0 text-[32px] tracking-[-0.055em] sm:text-[44px]" id="contact-title">和我聊聊你的项目。</h2>
            <p className="mt-4 mb-0 max-w-[650px] text-[14px] leading-[1.9] text-[#666962]">我会从目标、用户和交付边界开始，帮你把想法收敛成可以落地的项目方案。</p>
          </div>
          <div className="rounded-[22px] border border-[#d9dad3] bg-white p-5 shadow-[0_16px_40px_rgba(21,22,21,.06)] sm:p-6">
            <div className="flex items-start gap-4"><span className="grid size-11 place-items-center rounded-2xl bg-[#151615] text-[#d9ff63] text-lg font-semibold">陈</span><div><h3 className="m-0 text-lg tracking-[-0.04em]">{profile.name}</h3><p className="mt-1 mb-0 text-[11px] text-[#777a74]">{profile.role}</p></div></div>
            <div className="mt-5 space-y-3 border-t border-[#ecece7] pt-5 text-[11px] text-[#555852]">
              <div className="flex items-center gap-3"><MapPin className="size-4 shrink-0 text-[#5557e8]" /> {profile.location}</div>
              {profile.email ? <a className="flex items-center gap-3 text-[#555852] no-underline hover:text-[#5557e8]" href={`mailto:${profile.email}`}><Mail className="size-4 shrink-0 text-[#5557e8]" /> {profile.email}</a> : <div className="flex items-center gap-3 text-[#858880]"><Mail className="size-4 shrink-0 text-[#5557e8]" /> 邮箱联系方式待配置</div>}
            </div>
            <Link className="mt-5 flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#151615] px-4 text-[10px] font-bold text-white no-underline transition hover:bg-[#5557e8]" to="/#customize"><Sparkles className="size-4 text-[#d9ff63]" /> 填写定制需求</Link>
          </div>
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
      <Link className="inline-flex items-center gap-2 text-[11px] font-semibold text-[#666962] no-underline hover:text-[#5557e8]" to="/#projects"><ArrowRight className="size-4 rotate-180" /> 返回项目库</Link>
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
        <Route index element={<HomePage cases={cases} />} />
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

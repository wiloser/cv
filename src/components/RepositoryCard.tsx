import { ArrowUpRight, Check, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { GraduationCase } from '../data/projects'

interface CaseCardProps {
  item: GraduationCase
  matchReasons?: string[]
}

const previewThemes: Record<string, { accent: string; soft: string; dark: string; label: string; metric: string; metricLabel: string; bars: number[] }> = {
  'learning-path-recommendation': {
    accent: '#6d5dfc',
    soft: '#eeeaff',
    dark: '#27243b',
    label: 'LEARNING PATH',
    metric: '84%',
    metricLabel: '路径完成度',
    bars: [32, 58, 44, 76, 63, 88],
  },
  'product-recommendation-system': {
    accent: '#ff6f45',
    soft: '#fff0e9',
    dark: '#33251f',
    label: 'SMART COMMERCE',
    metric: '2.4k',
    metricLabel: '推荐点击',
    bars: [42, 51, 67, 49, 78, 91],
  },
  'bilibili-danmaku-sentiment': {
    accent: '#13a8c7',
    soft: '#e6f8fb',
    dark: '#183036',
    label: 'SENTIMENT LAB',
    metric: '68%',
    metricLabel: '正向情绪',
    bars: [28, 69, 48, 83, 54, 72],
  },
  'tourist-attraction-recommendation': {
    accent: '#16a36a',
    soft: '#e7f7ef',
    dark: '#173228',
    label: 'TRAVEL DISCOVERY',
    metric: '32',
    metricLabel: '推荐景点',
    bars: [38, 61, 55, 74, 68, 86],
  },
}

const defaultTheme = {
  accent: '#5557e8',
  soft: '#eeefff',
  dark: '#242540',
  label: 'PROJECT PREVIEW',
  metric: '100%',
  metricLabel: '资料完整度',
  bars: [35, 52, 47, 70, 64, 82],
}

export function ProjectPreview({ item, compact = false }: { item: GraduationCase; compact?: boolean }) {
  const theme = previewThemes[item.name] ?? defaultTheme

  return (
    <div
      className={`project-preview relative overflow-hidden rounded-[16px] border border-black/[0.07] ${compact ? 'min-h-[225px]' : 'min-h-[252px]'}`}
      style={{ background: theme.soft }}
      aria-label={`${item.title} 界面预览示意`}
    >
      <div className="flex h-9 items-center justify-between border-b border-black/[0.07] bg-white/75 px-3 backdrop-blur-sm">
        <div className="flex gap-1.5" aria-hidden="true"><span className="size-1.5 rounded-full bg-black/15" /><span className="size-1.5 rounded-full bg-black/15" /><span className="size-1.5 rounded-full bg-black/15" /></div>
        <span className="font-mono text-[7px] tracking-[0.12em] text-black/35">LIVE PROJECT PREVIEW</span>
        <span className="size-2 rounded-full" style={{ background: theme.accent }} aria-hidden="true" />
      </div>

      <div className="grid grid-cols-[52px_1fr] p-3 sm:grid-cols-[64px_1fr] sm:p-4">
        <div className="mr-3 flex flex-col rounded-xl p-2" style={{ background: theme.dark }} aria-hidden="true">
          <span className="mb-4 size-5 rounded-md" style={{ background: theme.accent }} />
          {[22, 30, 18, 26].map((width, index) => <span className="mb-2 h-1 rounded-full bg-white/20" key={index} style={{ width }} />)}
          <span className="mt-auto size-5 rounded-full bg-white/15" />
        </div>

        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="font-mono text-[7px] font-bold tracking-[0.11em]" style={{ color: theme.accent }}>{theme.label}</span>
              <p className="mt-1.5 mb-0 max-w-[205px] truncate text-[11px] font-bold tracking-[-0.025em] text-[#20221f]">{item.title}</p>
            </div>
            <span className="rounded-md bg-white/85 px-2 py-1 font-mono text-[7px] text-black/40">DASHBOARD</span>
          </div>

          <div className="mt-3 grid grid-cols-[.82fr_1.18fr] gap-2">
            <div className="rounded-xl bg-white/85 p-2.5 shadow-[0_4px_14px_rgba(20,20,20,.04)]">
              <span className="font-mono text-[7px] text-black/35">{theme.metricLabel}</span>
              <strong className="mt-2 block text-xl tracking-[-0.06em]" style={{ color: theme.dark }}>{theme.metric}</strong>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-black/[0.06]"><div className="h-full w-[72%] rounded-full" style={{ background: theme.accent }} /></div>
            </div>
            <div className="flex items-end gap-1 rounded-xl bg-white/85 px-2.5 pt-6 pb-2.5 shadow-[0_4px_14px_rgba(20,20,20,.04)]" aria-hidden="true">
              {theme.bars.map((height, index) => <span className="min-w-1 flex-1 rounded-t-sm opacity-90" key={index} style={{ background: index === theme.bars.length - 1 ? theme.accent : `${theme.accent}55`, height: `${height}%` }} />)}
            </div>
          </div>

          <div className="mt-2 grid grid-cols-3 gap-2">
            {item.technologies.slice(0, 3).map((technology, index) => (
              <div className="rounded-lg bg-white/70 px-2 py-2" key={technology}>
                <span className="block size-1.5 rounded-full" style={{ background: index === 0 ? theme.accent : `${theme.accent}88` }} />
                <span className="mt-1.5 block truncate font-mono text-[6.5px] text-black/45">{technology}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <span className="absolute right-3 bottom-3 rounded-full border border-black/[0.06] bg-white/85 px-2.5 py-1 font-mono text-[7px] font-bold text-black/45 shadow-sm">ONLINE DEMO</span>
    </div>
  )
}

export function CaseCard({ item, matchReasons = [] }: CaseCardProps) {
  return (
    <article className="group flex min-w-0 flex-col rounded-[22px] border border-[#d9dad3] bg-white p-3 transition duration-300 hover:-translate-y-1 hover:border-[#bfc0ba] hover:shadow-[0_22px_50px_rgba(27,29,27,.10)] sm:p-4">
      <Link className="block rounded-[16px] no-underline outline-offset-4" to={`/cases/${item.name}`}>
        <ProjectPreview item={item} />
      </Link>

      <div className="flex flex-1 flex-col px-1 pt-5 sm:px-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#f0f1ff] px-2.5 py-1 font-mono text-[8px] font-bold text-[#5557e8]">{item.category}</span>
            <span className="font-mono text-[8px] text-[#93968f]">{item.completedAt}</span>
          </div>
          <span className="flex items-center gap-1.5 font-mono text-[8px] text-[#777a74]"><span className="size-1.5 rounded-full bg-[#63ce8f]" /> 已验证</span>
        </div>

        <h3 className="mt-4 mb-0 text-[21px] leading-[1.35] font-semibold tracking-[-0.045em] sm:text-[23px]">
          <Link className="text-[#151615] no-underline transition group-hover:text-[#5557e8]" to={`/cases/${item.name}`}>{item.title}</Link>
        </h3>
        <p className="mt-2.5 mb-0 text-[12px] leading-[1.75] text-[#666962]">{item.tagline}</p>

        {matchReasons.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-1.5 rounded-xl bg-[#f4f4ff] px-3 py-2.5">
            <span className="mr-0.5 inline-flex items-center gap-1 font-mono text-[7px] font-bold tracking-[0.08em] text-[#5557e8]"><Check className="size-3" /> 命中</span>
            {matchReasons.map((reason) => <span className="rounded-full bg-white px-2 py-1 text-[8px] font-semibold text-[#555852]" key={reason}>{reason}</span>)}
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {[item.language, ...item.technologies].filter((value, index, array) => array.indexOf(value) === index).slice(0, 5).map((technology) => (
              <span className="rounded-full border border-[#e0e1da] bg-[#f7f7f4] px-2.5 py-1 font-mono text-[8px] text-[#656861]" key={technology}>{technology}</span>
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#ecece7] pt-4">
          <Link className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#151615] px-4 text-[10px] font-bold text-white no-underline transition hover:bg-[#5557e8]" to={`/cases/${item.name}`}>
            查看项目 <ArrowUpRight className="size-3.5" />
          </Link>
          <a className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[#d6d7d0] px-3.5 text-[10px] font-bold text-[#555852] no-underline transition hover:border-[#151615] hover:text-[#151615]" href={item.deploymentUrl} target="_blank" rel="noopener noreferrer">
            在线演示 <ExternalLink className="size-3" />
          </a>
          <span className="ml-auto hidden font-mono text-[8px] text-[#999c95] sm:inline">{item.features.length} MODULES</span>
        </div>
      </div>
    </article>
  )
}

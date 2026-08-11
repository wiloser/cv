import { ArrowUpRight, Check, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { GraduationCase } from '../data/projects'

interface CaseCardProps {
  item: GraduationCase
  matchReasons?: string[]
}

export function ProjectPreview({ item, compact = false }: { item: GraduationCase; compact?: boolean }) {
  const images = item.previewImages ?? []
  const [activeIndex, setActiveIndex] = useState(0)
  const touchStartX = useRef<number | null>(null)

  const changeSlide = (offset: number) => {
    if (images.length < 2) return
    setActiveIndex((current) => (current + offset + images.length) % images.length)
  }

  const goToSlide = (index: number) => setActiveIndex(index)

  if (images.length === 0) {
    return (
      <div className="grid aspect-[16/9] place-items-center rounded-[16px] border border-black/10 bg-[#1b1c1b] text-center text-[11px] text-white/60">
        暂无真实项目截图
      </div>
    )
  }

  const activeImage = images[activeIndex] ?? images[0]
  const hasMultipleImages = images.length > 1

  return (
    <div
      aria-label={`${item.title} 真实界面预览`}
      aria-roledescription="carousel"
      className={`project-preview group/preview relative isolate aspect-[16/9] overflow-hidden rounded-[16px] border border-black/10 bg-[#171817] shadow-[0_16px_36px_rgba(20,22,20,.12)] ${compact ? 'sm:rounded-[18px]' : ''}`}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          changeSlide(-1)
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault()
          changeSlide(1)
        }
      }}
      onTouchEnd={(event) => {
        const start = touchStartX.current
        const end = event.changedTouches[0]?.clientX
        touchStartX.current = null
        if (start === null || end === undefined || Math.abs(start - end) < 42) return
        changeSlide(start > end ? 1 : -1)
      }}
      onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX ?? null }}
      role="region"
      tabIndex={hasMultipleImages ? 0 : -1}
    >
      <div
        aria-label={`第 ${activeIndex + 1} 张，共 ${images.length} 张：${activeImage.caption}`}
        aria-roledescription="slide"
        className="absolute inset-0"
        role="group"
      >
        <img
          alt={activeImage.alt}
          className="preview-slide h-full w-full object-cover object-top"
          decoding="async"
          key={activeImage.src}
          loading={compact ? 'eager' : 'lazy'}
          src={activeImage.src}
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/55 to-transparent px-3 pt-3 pb-8 text-white">
        <span className="rounded-full border border-white/20 bg-black/35 px-2.5 py-1 font-mono text-[7px] font-bold tracking-[0.1em] backdrop-blur-md">真实项目截图</span>
        <span className="rounded-full border border-white/20 bg-black/35 px-2.5 py-1 font-mono text-[7px] backdrop-blur-md">{activeIndex + 1} / {images.length}</span>
      </div>

      {hasMultipleImages && (
        <>
          <button
            aria-label={`查看上一张：${images[(activeIndex - 1 + images.length) % images.length].caption}`}
            className="absolute top-1/2 left-3 z-20 grid size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-white/25 bg-black/45 text-white shadow-lg backdrop-blur-md transition hover:scale-105 hover:bg-black/65 focus-visible:scale-105"
            onClick={() => changeSlide(-1)}
            type="button"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            aria-label={`查看下一张：${images[(activeIndex + 1) % images.length].caption}`}
            className="absolute top-1/2 right-3 z-20 grid size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-white/25 bg-black/45 text-white shadow-lg backdrop-blur-md transition hover:scale-105 hover:bg-black/65 focus-visible:scale-105"
            onClick={() => changeSlide(1)}
            type="button"
          >
            <ChevronRight className="size-4" />
          </button>
        </>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-3 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-3 pt-12 pb-3 text-white">
        <p aria-live="polite" className="m-0 truncate text-[10px] font-semibold drop-shadow-sm">{activeImage.caption}</p>
        {hasMultipleImages && (
          <div className="pointer-events-auto flex items-center gap-1.5" role="tablist" aria-label="选择预览图">
            {images.map((image, index) => (
              <button
                aria-label={`查看第 ${index + 1} 张：${image.caption}`}
                aria-selected={index === activeIndex}
                className={`h-1.5 cursor-pointer rounded-full border-0 p-0 shadow-sm transition-all ${index === activeIndex ? 'w-5 bg-[#d9ff63]' : 'w-1.5 bg-white/65 hover:bg-white'}`}
                key={image.src}
                onClick={() => goToSlide(index)}
                role="tab"
                type="button"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function CaseCard({ item, matchReasons = [] }: CaseCardProps) {
  return (
    <article className="group flex min-w-0 flex-col rounded-[22px] border border-[#d9dad3] bg-white p-3 transition duration-300 hover:-translate-y-1 hover:border-[#bfc0ba] hover:shadow-[0_22px_50px_rgba(27,29,27,.10)] sm:p-4">
      <ProjectPreview item={item} />

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

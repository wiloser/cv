import { ArrowLeft, Check, Download, ExternalLink, FileText, PackageOpen, PlayCircle, Presentation } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getCaseBySlug, type GraduationCase } from '../data/projects'
import { ProjectPreview } from './RepositoryCard'

interface CaseDetailProps {
  cases: GraduationCase[]
}

const shell = 'mx-auto w-[calc(100%_-_28px)] max-w-[1280px] sm:w-[calc(100%_-_48px)]'

export function CaseDetail({ cases }: CaseDetailProps) {
  const { slug } = useParams()
  const item = getCaseBySlug(cases, slug)

  useEffect(() => {
    document.title = item ? `${item.title} · 毕设集` : '项目未找到 · 毕设集'
  }, [item])

  if (!item) {
    return (
      <main className={`${shell} py-16`}>
        <div className="rounded-[24px] border border-[#dadbd4] bg-white p-12 text-center">
          <p className="font-mono text-[9px] font-bold tracking-[0.12em] text-[#5557e8]">404 / PROJECT NOT FOUND</p>
          <h1 className="mt-3 text-3xl tracking-[-0.045em]">这个项目暂时找不到</h1>
          <Link className="mt-7 inline-flex rounded-full bg-[#151615] px-5 py-3 text-[11px] font-semibold text-white no-underline" to="/#projects">返回项目库</Link>
        </div>
      </main>
    )
  }

  return (
    <main>
      <section className="border-b border-[#deded7] bg-[#f6f6f2]">
        <div className={`${shell} py-8 sm:py-12`}>
          <Link className="inline-flex items-center gap-2 rounded-full border border-[#deded7] bg-white px-3 py-2 text-[10px] font-semibold text-[#666962] no-underline transition hover:border-[#151615] hover:text-[#151615]" to="/#projects">
            <ArrowLeft className="size-3.5" /> 返回项目库
          </Link>

          <div className="mt-8 grid gap-9 lg:grid-cols-[minmax(0,.9fr)_minmax(420px,1.1fr)] lg:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2 font-mono text-[8px]">
                <span className="rounded-full bg-[#d9ff63] px-2.5 py-1.5 font-bold text-[#151615]">{item.category}</span>
                <span className="rounded-full border border-[#deded7] bg-white px-2.5 py-1.5 text-[#777a74]">{item.completedAt}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#deded7] bg-white px-2.5 py-1.5 text-[#777a74]"><span className="size-1.5 rounded-full bg-[#63ce8f]" /> 已运行验证</span>
              </div>
              <h1 className="mt-6 mb-0 text-[40px] leading-[1.08] font-semibold tracking-[-0.065em] sm:text-[60px]">{item.title}</h1>
              <p className="mt-5 mb-0 max-w-[650px] text-[15px] leading-[1.8] text-[#666962]">{item.tagline}</p>

              <div className="mt-6 flex flex-wrap gap-2">
                {[item.language, ...item.technologies].filter((value, index, array) => array.indexOf(value) === index).map((technology) => (
                  <span className="rounded-full border border-[#d7d8d1] bg-white px-3 py-1.5 font-mono text-[8px] text-[#555852]" key={technology}>{technology}</span>
                ))}
              </div>

              <div className="mt-8 flex flex-wrap gap-2">
                <a className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#151615] px-5 text-[11px] font-bold text-white no-underline transition hover:bg-[#5557e8]" href={item.deploymentUrl} target="_blank" rel="noopener noreferrer"><PlayCircle className="size-4" /> 打开在线演示</a>
                <a className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#cfd0c9] bg-white px-5 text-[11px] font-bold text-[#151615] no-underline transition hover:border-[#151615]" href={item.downloadUrl} download><Download className="size-4" /> 下载项目包</a>
              </div>
            </div>

            <div className="rounded-[24px] border border-[#d9dad3] bg-white p-3 shadow-[0_26px_70px_rgba(20,22,20,.12)] sm:p-4">
              <ProjectPreview compact item={item} key={item.name} />
              <div className="grid grid-cols-3 gap-2 pt-3">
                <div className="rounded-xl bg-[#f4f4f0] px-3 py-3"><span className="font-mono text-[7px] text-[#8a8d86]">功能模块</span><strong className="mt-1 block text-lg tracking-[-0.05em]">{item.features.length}</strong></div>
                <div className="rounded-xl bg-[#f4f4f0] px-3 py-3"><span className="font-mono text-[7px] text-[#8a8d86]">技术组件</span><strong className="mt-1 block text-lg tracking-[-0.05em]">{item.technologies.length}</strong></div>
                <div className="rounded-xl bg-[#f0f1ff] px-3 py-3"><span className="font-mono text-[7px] text-[#5557e8]">资料状态</span><strong className="mt-1 block text-[11px] tracking-[-0.02em] text-[#5557e8]">完整可用</strong></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className={`${shell} grid items-start gap-10 py-11 sm:py-16 lg:grid-cols-[minmax(0,1fr)_330px]`}>
        <article className="min-w-0">
          <section className="rounded-[20px] bg-[#eeefff] p-6 sm:p-8">
            <p className="m-0 font-mono text-[9px] font-bold tracking-[0.12em] text-[#5557e8]">PROJECT OVERVIEW</p>
            <h2 className="mt-3 mb-0 text-[27px] tracking-[-0.045em]">项目概览</h2>
            <p className="mt-4 mb-0 text-[14px] leading-[1.95] text-[#555852]">{item.description}</p>
          </section>

          <section className="border-b border-[#deded7] py-10 sm:py-12">
            <div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-lg bg-[#151615] font-mono text-[8px] text-[#d9ff63]">01</span><div><p className="m-0 font-mono text-[8px] font-bold tracking-[0.1em] text-[#777a74]">FEATURE MAP</p><h2 className="mt-1 mb-0 text-[25px] tracking-[-0.04em]">功能模块</h2></div></div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {item.features.map((feature, index) => (
                <div className="rounded-[16px] border border-[#deded7] bg-white p-5" key={feature}>
                  <div className="flex items-center justify-between"><Check className="size-4 text-[#5557e8]" /><span className="font-mono text-[8px] text-[#a0a29c]">0{index + 1}</span></div>
                  <p className="mt-5 mb-0 text-[12px] leading-[1.75] text-[#555852]">{feature}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="border-b border-[#deded7] py-10 sm:py-12">
            <div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-lg bg-[#151615] font-mono text-[8px] text-[#d9ff63]">02</span><div><p className="m-0 font-mono text-[8px] font-bold tracking-[0.1em] text-[#777a74]">IMPLEMENTATION</p><h2 className="mt-1 mb-0 text-[25px] tracking-[-0.04em]">技术亮点</h2></div></div>
            <div className="mt-6 space-y-3">
              {item.highlights.map((highlight, index) => (
                <div className="flex items-start gap-4 rounded-[16px] border border-[#deded7] bg-white p-5" key={highlight}>
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#d9ff63] font-mono text-[8px] font-bold">0{index + 1}</span>
                  <p className="m-0 pt-1 text-[13px] leading-[1.75] text-[#555852]">{highlight}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="py-10 sm:py-12">
            <div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-lg bg-[#151615] font-mono text-[8px] text-[#d9ff63]">03</span><div><p className="m-0 font-mono text-[8px] font-bold tracking-[0.1em] text-[#777a74]">ENVIRONMENT</p><h2 className="mt-1 mb-0 text-[25px] tracking-[-0.04em]">运行环境</h2></div></div>
            <ul className="mt-6 grid gap-2 p-0 sm:grid-cols-2">
              {item.environment.map((environment) => (
                <li className="flex list-none items-center gap-3 rounded-xl border border-[#deded7] bg-white px-4 py-3.5 text-[11px] text-[#555852]" key={environment}><span className="size-1.5 shrink-0 rounded-full bg-[#63ce8f]" />{environment}</li>
              ))}
            </ul>
          </section>
        </article>

        <aside className="rounded-[22px] border border-[#d9dad3] bg-white p-5 shadow-[0_18px_45px_rgba(20,22,20,.08)] lg:sticky lg:top-24 sm:p-6">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#151615] text-[#d9ff63]"><PackageOpen className="size-5" /></span><div><p className="m-0 font-mono text-[8px] tracking-[0.1em] text-[#858880]">PROJECT PACKAGE</p><h2 className="mt-1 mb-0 text-lg tracking-[-0.035em]">项目资料包</h2></div></div>
          <dl className="mt-5 mb-0 border-y border-[#ecece7] py-2">
            {[
              ['文件类型', item.downloadFormat],
              ['文件大小', item.downloadSize],
              ['主要语言', item.language],
              ['在线演示', '可访问'],
            ].map(([label, value]) => (
              <div className="flex justify-between gap-4 py-2.5 text-[10px]" key={label}><dt className="text-[#858880]">{label}</dt><dd className="m-0 text-right font-semibold text-[#3f423d]">{value}</dd></div>
            ))}
          </dl>
          <a className="mt-5 flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#151615] px-4 text-[10px] font-bold text-white no-underline transition hover:bg-[#5557e8]" href={item.downloadUrl} download><Download className="size-4" /> 下载完整项目包</a>
          {item.thesisUrl && <a className="mt-2 flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#d6d7d0] px-4 text-[10px] font-bold text-[#151615] no-underline transition hover:border-[#151615]" href={item.thesisUrl} download><FileText className="size-4" /> 下载最终论文</a>}
          {item.presentationUrl && <a className="mt-2 flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#d6d7d0] px-4 text-[10px] font-bold text-[#151615] no-underline transition hover:border-[#151615]" href={item.presentationUrl} download><Presentation className="size-4" /> 下载答辩 PPT</a>}
          {item.guideUrl && <a className="mt-2 flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#d6d7d0] px-4 text-[10px] font-bold text-[#151615] no-underline transition hover:border-[#151615]" href={item.guideUrl} download><FileText className="size-4" /> 下载案例说明</a>}
          <a className="mt-2 flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#d6d7d0] px-4 text-[10px] font-bold text-[#151615] no-underline transition hover:border-[#151615]" href={item.deploymentUrl} target="_blank" rel="noopener noreferrer">在线演示 <ExternalLink className="size-4" /></a>
          <p className="mt-5 mb-0 rounded-xl bg-[#f6f6f2] p-3 text-[9px] leading-[1.75] text-[#858880]">资料仅供学习、选题与方案设计参考。请基于自己的需求独立完成，并遵守学校学术规范。</p>
        </aside>
      </div>
    </main>
  )
}

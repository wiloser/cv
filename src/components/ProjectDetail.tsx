import { ArrowLeft } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getProjectBySlug, type RepositoryProject } from '../data/projects'

const tagClass = 'rounded-[9px] border border-[#5362c9]/10 bg-[#eceefd] px-[9px] py-[5px] text-[11px] font-semibold text-[#3948ad] dark:bg-[#2d3352] dark:text-[#b7bfff]'

interface ProjectDetailProps {
  projects: RepositoryProject[]
}

export function ProjectDetail({ projects }: ProjectDetailProps) {
  const { slug } = useParams()
  const project = getProjectBySlug(projects, slug)

  useEffect(() => {
    document.title = project ? `${project.title} · 陈序` : '项目未找到 · 陈序'
    window.scrollTo(0, 0)
  }, [project])

  if (!project) {
    return (
      <main className="mx-auto w-[calc(100%_-_24px)] max-w-[1180px] py-6 sm:w-[calc(100%_-_40px)] sm:py-[34px]">
        <div className="rounded-[20px] border border-[#dcded8] bg-[#fffdfa] p-14 text-center dark:border-[#363c37] dark:bg-[#202421]"><h1 className="mt-0">项目未找到</h1><Link className="text-[#5362c9] dark:text-[#9aa5ff]" to="/">返回个人主页</Link></div>
      </main>
    )
  }

  return (
    <main className="mx-auto w-[calc(100%_-_24px)] max-w-[1180px] py-6 pb-11 sm:w-[calc(100%_-_40px)] sm:py-[34px] sm:pb-16">
      <Link className="inline-flex items-center gap-[7px] text-xs text-[#6e7570] no-underline hover:text-[#5362c9] dark:text-[#a0a7a1] dark:hover:text-[#9aa5ff]" to="/projects"><ArrowLeft className="size-[15px]" aria-hidden="true" /> 返回项目列表</Link>

      <header className="mt-7 max-w-[850px] sm:mt-9">
        <div className="flex items-center gap-[9px] text-[11px] text-[#6e7570] dark:text-[#a0a7a1]"><span className="rounded-lg bg-[#eceefd] px-[9px] py-[5px] font-semibold text-[#3948ad] dark:bg-[#2d3352] dark:text-[#b7bfff]">{project.category}</span><span>·</span><time>{project.completedAt}</time></div>
        <h1 className="mt-4 mb-0 text-[30px] leading-[1.15] tracking-[-0.045em] sm:text-[50px]">{project.title}</h1>
        <p className="mt-3 mb-0 text-[15px] text-[#6e7570] dark:text-[#a0a7a1] sm:text-[17px]">{project.tagline}</p>
      </header>

      <div className="mt-7 grid items-start gap-[34px] lg:mt-9 lg:grid-cols-[minmax(0,1fr)_276px]">
        <article className="overflow-hidden rounded-[20px] border border-[#dcded8] bg-[#fffdfa] shadow-[0_12px_36px_rgba(44,49,46,0.055)] dark:border-[#363c37] dark:bg-[#202421] dark:shadow-[0_14px_38px_rgba(0,0,0,0.16)]">
          <section className="p-[21px] sm:p-8">
            <p className="mb-[9px] text-[10px] font-bold tracking-[0.11em] text-[#5362c9] uppercase dark:text-[#9aa5ff]">Project overview</p>
            <h2 className="mt-0 mb-[13px] text-[19px] tracking-[-0.02em]">项目说明</h2>
            <p className="m-0 text-[13px] leading-[1.75] text-[#6e7570] dark:text-[#a0a7a1]">{project.description}</p>
          </section>

          <section className="border-t border-[#dcded8] p-[21px] dark:border-[#363c37] sm:p-8">
            <h2 className="mt-0 mb-[13px] text-[19px] tracking-[-0.02em]">核心功能</h2>
            <ul className="mt-3 mb-0 space-y-[7px] pl-5 text-[13px] leading-[1.75] text-[#6e7570] dark:text-[#a0a7a1]">{project.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
          </section>

          <section className="border-t border-[#dcded8] p-[21px] dark:border-[#363c37] sm:p-8">
            <h2 className="mt-0 mb-[13px] text-[19px] tracking-[-0.02em]">技术实现</h2>
            <div className="mb-3.5 flex flex-wrap gap-[7px]">{project.technologies.map((technology) => <span className={tagClass} key={technology}>{technology}</span>)}</div>
            <ul className="mt-3 mb-0 space-y-[7px] pl-5 text-[13px] leading-[1.75] text-[#6e7570] dark:text-[#a0a7a1]">{project.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul>
          </section>

          <section className="border-t border-[#dcded8] p-[21px] dark:border-[#363c37] sm:p-8">
            <h2 className="mt-0 mb-[13px] text-[19px] tracking-[-0.02em]">开发环境</h2>
            <ul className="mt-3 mb-0 space-y-[7px] pl-5 text-[13px] leading-[1.75] text-[#6e7570] dark:text-[#a0a7a1]">{project.environment.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        </article>

        <aside className="rounded-[17px] border border-[#dcded8] bg-[#fffdfa] p-[22px] dark:border-[#363c37] dark:bg-[#202421]">
          <p className="mb-[9px] text-[10px] font-bold tracking-[0.11em] text-[#5362c9] uppercase dark:text-[#9aa5ff]">Project info</p>
          <h2 className="m-0 text-lg">项目信息</h2>
          <dl className="mt-[17px] mb-0 border-t border-[#dcded8] dark:border-[#363c37]">
            {[['完成时间', project.completedAt], ['项目类型', project.category], ['主要语言', project.language]].map(([label, value]) => (
              <div className="flex justify-between gap-3.5 border-b border-[#dcded8] py-[11px] text-[11px] dark:border-[#363c37]" key={label}><dt className="text-[#6e7570] dark:text-[#a0a7a1]">{label}</dt><dd className="m-0 text-right">{value}</dd></div>
            ))}
          </dl>
          <h3 className="mt-5 mb-2.5 text-xs">技术栈</h3>
          <div className="flex flex-wrap gap-1.5">{project.technologies.map((technology) => <span className="rounded-[9px] border border-[#5362c9]/10 bg-[#eceefd] px-[9px] py-[5px] text-[9px] font-semibold text-[#3948ad] dark:bg-[#2d3352] dark:text-[#b7bfff]" key={technology}>{technology}</span>)}</div>
          <Link className="mt-[22px] flex min-h-[38px] items-center justify-center rounded-[11px] bg-[#eeede8] text-[11px] font-semibold no-underline hover:bg-[#eceefd] hover:text-[#3948ad] dark:bg-[#2a2f2b] dark:hover:bg-[#2d3352] dark:hover:text-[#b7bfff]" to="/projects">查看其他项目</Link>
        </aside>
      </div>
    </main>
  )
}

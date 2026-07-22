import { FolderKanban, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { ProjectDetail } from './components/ProjectDetail'
import { RepositoryCard } from './components/RepositoryCard'
import { loadPortfolioContent, type PortfolioContent } from './data/content'
import type { Profile } from './data/profile'
import type { RepositoryProject } from './data/projects'

const shell = 'mx-auto w-[calc(100%_-_24px)] max-w-[1180px] sm:w-[calc(100%_-_40px)]'

interface ContentProps {
  profile: Profile
  projects: RepositoryProject[]
}

function SiteHeader({ profile, projects }: ContentProps) {
  const { pathname } = useLocation()
  const navigationTitle = pathname === '/projects'
    ? '项目作品'
    : pathname.startsWith('/projects/')
      ? '项目详情'
      : '个人概览'

  return (
    <header className="border-b border-[#dcded8] bg-[#fffdfa] text-[#222825] dark:border-[#363c37] dark:bg-[#202421] dark:text-[#e9ece8]">
      <div className={`${shell} flex min-h-[68px] items-center gap-2 sm:min-h-[76px] sm:gap-4`}>
        <Link className="inline-flex items-center gap-2.5 no-underline" to="/" aria-label="返回个人主页">
          <span className="grid size-9 place-items-center rounded-xl bg-[#5362c9] text-[15px] font-bold text-white" aria-hidden="true">序</span>
          <strong className="text-[15px]">{profile.name}</strong>
          <span className="hidden border-l border-[#dcded8] pl-2.5 text-xs text-[#6e7570] dark:border-[#363c37] dark:text-[#a0a7a1] sm:inline">{navigationTitle}</span>
        </Link>
        <nav className="ml-auto flex items-center gap-1 sm:gap-2" aria-label="个人主页导航">
          <NavLink
            end
            className={({ isActive }) => `inline-flex min-h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold whitespace-nowrap no-underline sm:px-3 sm:text-[13px] ${isActive ? 'bg-[#eceefd] text-[#3948ad] dark:bg-[#2d3352] dark:text-[#b7bfff]' : 'text-[#6e7570] hover:bg-[#eeede8] hover:text-[#222825] dark:text-[#a0a7a1] dark:hover:bg-[#2a2f2b] dark:hover:text-[#e9ece8]'}`}
            to="/"
          ><UserRound className="hidden size-[15px] sm:block" aria-hidden="true" /> 个人概览</NavLink>
          <NavLink
            className={({ isActive }) => `inline-flex min-h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold whitespace-nowrap no-underline sm:px-3 sm:text-[13px] ${isActive ? 'bg-[#eceefd] text-[#3948ad] dark:bg-[#2d3352] dark:text-[#b7bfff]' : 'text-[#6e7570] hover:bg-[#eeede8] hover:text-[#222825] dark:text-[#a0a7a1] dark:hover:bg-[#2a2f2b] dark:hover:text-[#e9ece8]'}`}
            to="/projects"
          ><FolderKanban className="hidden size-[15px] sm:block" aria-hidden="true" /> 项目作品 <b className="hidden min-w-5 rounded-full bg-[#5362c9]/10 px-1.5 py-0.5 text-center text-[10px] sm:block">{projects.length}</b></NavLink>
        </nav>
      </div>
    </header>
  )
}

function ProfileHome({ profile }: Pick<ContentProps, 'profile'>) {
  useEffect(() => {
    document.title = '陈序 · 个人作品集'
    window.scrollTo(0, 0)
  }, [])

  return (
      <main className={`${shell} py-6 sm:py-[34px] sm:pb-16`}>
        <section aria-label="个人主页概览">
          <article className="overflow-hidden rounded-[20px] border border-[#dcded8] bg-[#fffdfa] shadow-[0_12px_36px_rgba(44,49,46,0.055)] dark:border-[#363c37] dark:bg-[#202421] dark:shadow-[0_14px_38px_rgba(0,0,0,0.16)]">
              <div className="p-[22px] sm:p-9">
                <p className="mb-2.5 text-[10px] font-bold tracking-[0.11em] text-[#5362c9] uppercase dark:text-[#9aa5ff]">关于我</p>
                <h1 className="m-0 max-w-[650px] text-[29px] leading-[1.2] font-[680] tracking-[-0.045em] sm:text-[44px]">把复杂需求，做成清晰可靠的产品。</h1>
                <p className="mt-[18px] max-w-[720px] text-sm leading-[1.8] text-[#6e7570] dark:text-[#a0a7a1]">{profile.intro}</p>

                <div className="mt-7 grid border-y border-[#dcded8] dark:border-[#363c37] md:grid-cols-3">
                  {profile.directions.map((direction, index) => (
                    <div className={`py-3.5 md:py-[18px] ${index > 0 ? 'border-t border-[#dcded8] dark:border-[#363c37] md:border-t-0 md:border-l md:pl-4' : 'md:pr-4'}`} key={direction.title}>
                      <strong className="block text-[13px]">{direction.title}</strong>
                      <span className="mt-1.5 block text-[11px] leading-[1.55] text-[#6e7570] dark:text-[#a0a7a1]">{direction.description}</span>
                    </div>
                  ))}
                </div>

                <h2 className="mt-[22px] mb-2.5 text-[13px] font-bold">常用技术</h2>
                <div className="flex flex-wrap gap-[7px]">{profile.skills.map((skill) => <span className="rounded-[9px] border border-[#5362c9]/10 bg-[#eceefd] px-[9px] py-[5px] text-[11px] font-semibold text-[#3948ad] dark:bg-[#2d3352] dark:text-[#b7bfff]" key={skill}>{skill}</span>)}</div>
              </div>
          </article>
        </section>
      </main>
  )
}

function ProjectsPage({ projects }: Pick<ContentProps, 'projects'>) {
  useEffect(() => {
    document.title = '项目作品 · 陈序'
    window.scrollTo(0, 0)
  }, [])

  return (
      <main className={`${shell} py-6 sm:py-[34px] sm:pb-16`}>
        <section aria-labelledby="projects-title">
            <div className="mb-[18px] flex items-end justify-between border-b border-[#dcded8] pb-[18px] dark:border-[#363c37]">
              <div><p className="mb-[3px] text-[10px] font-bold tracking-[0.11em] text-[#5362c9] uppercase dark:text-[#9aa5ff]">Selected work</p><h1 id="projects-title" className="m-0 text-[26px] tracking-[-0.03em]">项目作品</h1></div>
              <span className="text-[11px] text-[#6e7570] dark:text-[#a0a7a1]">共 {projects.length} 个项目</span>
            </div>
            <div className="grid gap-3.5 sm:grid-cols-2">{projects.map((project) => <RepositoryCard key={project.name} project={project} />)}</div>
        </section>
      </main>
  )
}

function PortfolioApp() {
  const [content, setContent] = useState<PortfolioContent | null>(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let active = true

    loadPortfolioContent()
      .then((nextContent) => {
        if (active) setContent(nextContent)
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : '内容读取失败')
      })

    return () => {
      active = false
    }
  }, [])

  if (loadError) {
    return <main className={`${shell} py-10`}><div className="rounded-[20px] border border-red-200 bg-white p-8 text-sm text-red-700">{loadError}</div></main>
  }

  if (!content) {
    return <main className={`${shell} py-10 text-sm text-[#6e7570] dark:text-[#a0a7a1]`}>正在读取作品集内容…</main>
  }

  const { profile, projects } = content

  return (
    <div className="min-h-screen bg-[#f4f3ef] text-[#222825] selection:bg-[#5362c9] selection:text-white dark:bg-[#171a18] dark:text-[#e9ece8]">
      <SiteHeader profile={profile} projects={projects} />
      <Routes>
        <Route index element={<ProfileHome profile={profile} />} />
        <Route path="projects" element={<ProjectsPage projects={projects} />} />
        <Route path="projects/:slug" element={<ProjectDetail projects={projects} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <footer className={`${shell} border-t border-[#dcded8] py-7 text-center text-[11px] text-[#6e7570] dark:border-[#363c37] dark:text-[#a0a7a1]`}>© {new Date().getFullYear()} {profile.name} · React / TypeScript</footer>
    </div>
  )
}

export default function App() {
  return <BrowserRouter><PortfolioApp /></BrowserRouter>
}

import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { RepositoryProject } from '../data/projects'

interface RepositoryCardProps { project: RepositoryProject }

export function RepositoryCard({ project }: RepositoryCardProps) {
  return (
    <article className="flex min-h-[205px] flex-col rounded-[17px] border border-[#dcded8] bg-[#fffdfa] p-5 transition hover:-translate-y-0.5 hover:border-[#5362c9]/40 hover:shadow-[0_12px_36px_rgba(44,49,46,0.055)] dark:border-[#363c37] dark:bg-[#202421] dark:hover:border-[#9aa5ff]/40 sm:min-h-[220px]">
      <div className="flex items-center justify-between text-[10px] text-[#6e7570] dark:text-[#a0a7a1]"><span className="font-bold text-[#5362c9] dark:text-[#9aa5ff]">{project.category}</span><time>{project.completedAt}</time></div>
      <h3 className="mt-[13px] mb-0 text-base leading-[1.35]"><Link className="no-underline hover:text-[#3948ad] dark:hover:text-[#b7bfff]" to={`/projects/${project.name}`}>{project.title}</Link></h3>
      <p className="mt-2 mb-0 text-xs leading-[1.65] text-[#6e7570] dark:text-[#a0a7a1]">{project.description}</p>
      <div className="mt-[13px] flex flex-wrap gap-[5px]">{project.technologies.map((technology) => <span className="rounded-[7px] bg-[#eeede8] px-[7px] py-[3px] text-[9px] text-[#6e7570] dark:bg-[#2a2f2b] dark:text-[#a0a7a1]" key={technology}>{technology}</span>)}</div>
      <footer className="mt-auto flex items-end gap-3.5 border-t border-[#dcded8] pt-[18px] text-[10px] leading-[1.45] text-[#6e7570] dark:border-[#363c37] dark:text-[#a0a7a1]">
        <span className="max-w-[85%]">{project.tagline}</span>
        <Link className="ml-auto grid size-[31px] shrink-0 place-items-center rounded-[10px] bg-[#eceefd] text-[#5362c9] dark:bg-[#2d3352] dark:text-[#9aa5ff]" to={`/projects/${project.name}`} aria-label={`查看${project.title}`}><ArrowUpRight className="size-[15px]" aria-hidden="true" /></Link>
      </footer>
    </article>
  )
}

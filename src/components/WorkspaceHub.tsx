import { Activity, ArrowRight, GraduationCap } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'

interface WorkspaceHubProps {
  projectCount: number
  resourceCount: number
}

const shell = 'mx-auto w-[calc(100%_-_28px)] max-w-[1280px] sm:w-[calc(100%_-_48px)]'

export function WorkspaceHub({ projectCount, resourceCount }: WorkspaceHubProps) {
  useEffect(() => {
    document.title = '项目工作台 · 毕设与量化监测'
  }, [])

  return (
    <main>
      <section className="relative overflow-hidden border-b border-[#deded7] py-14 sm:py-24" id="modules">
        <div className="pointer-events-none absolute inset-0 grid-noise opacity-70" aria-hidden="true" />
        <div className={`${shell} relative`}>
          <div className="mt-12 grid gap-5 lg:grid-cols-2">
            <Link className="group relative overflow-hidden rounded-[28px] border border-[#d9dad3] bg-white p-6 text-[#151615] no-underline shadow-[0_24px_70px_rgba(21,22,21,.08)] transition duration-300 hover:-translate-y-1 hover:border-[#bfc0ba] hover:shadow-[0_28px_80px_rgba(21,22,21,.13)] sm:p-8" to="/graduation">
              <div className="absolute -right-16 -top-16 size-48 rounded-full bg-[#eef0ff] transition duration-500 group-hover:scale-125" aria-hidden="true" />
              <div className="relative">
                <div className="flex items-start justify-between gap-4">
                  <span className="grid size-12 place-items-center rounded-2xl bg-[#151615] text-[#d9ff63]"><GraduationCap className="size-6" /></span>
                </div>
                <h2 className="mt-2 mb-0 text-[30px] tracking-[-0.055em] sm:text-[38px]">毕设集</h2>
                <div className="mt-7 flex flex-wrap gap-2">
                  <span className="rounded-full bg-[#f0f1ff] px-3 py-2 text-[10px] font-semibold text-[#5557e8]">{projectCount} 个项目</span>
                  <span className="rounded-full border border-[#deded7] px-3 py-2 text-[10px] font-semibold text-[#666962]">{resourceCount} 篇方法资料</span>
                  <span className="rounded-full border border-[#deded7] px-3 py-2 text-[10px] font-semibold text-[#666962]">可下载交付包</span>
                </div>
                <span className="mt-9 inline-flex items-center gap-2 rounded-full bg-[#151615] px-4 py-3 text-[10px] font-bold text-white transition group-hover:bg-[#5557e8]">进入毕设项目库 <ArrowRight className="size-3.5" /></span>
              </div>
            </Link>

            <Link className="group relative overflow-hidden rounded-[28px] border border-[#d9dad3] bg-[#151615] p-6 text-white no-underline shadow-[0_24px_70px_rgba(21,22,21,.16)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_28px_80px_rgba(21,22,21,.24)] sm:p-8" to="/quant">
              <div className="absolute -right-20 -top-20 size-64 rounded-full border border-[#d9ff63]/20 transition duration-500 group-hover:scale-110" aria-hidden="true" />
              <div className="absolute right-10 top-20 size-28 rounded-full border border-[#5557e8]/40" aria-hidden="true" />
              <div className="relative">
                <div className="flex items-start justify-between gap-4">
                  <span className="grid size-12 place-items-center rounded-2xl bg-[#d9ff63] text-[#151615]"><Activity className="size-6" /></span>
                </div>
                <h2 className="mt-2 mb-0 text-[30px] tracking-[-0.055em] sm:text-[38px]">量化监测平台</h2>
                <div className="mt-7 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white/10 px-3 py-2 text-[10px] font-semibold text-white/80">每日自动同步</span>
                  <span className="rounded-full border border-white/15 px-3 py-2 text-[10px] font-semibold text-white/60">指标趋势</span>
                  <span className="rounded-full border border-white/15 px-3 py-2 text-[10px] font-semibold text-white/60">异常监测</span>
                </div>
                <span className="mt-9 inline-flex items-center gap-2 rounded-full bg-[#d9ff63] px-4 py-3 text-[10px] font-bold text-[#151615] transition group-hover:bg-white">查看监测看板 <ArrowRight className="size-3.5" /></span>
              </div>
            </Link>
          </div>

        </div>
      </section>
    </main>
  )
}

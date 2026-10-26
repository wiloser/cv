import {
  ArrowLeft,
  Bell,
  CalendarClock,
  Check,
  CircleAlert,
  Mail,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthPanel } from './QuantAccountPage'
import {
  getQuantServiceConfig,
  getQuantUser,
  logoutQuantUser,
  sendQuantTestNotification,
  updateQuantNotifications,
} from '../data/quantAccount'
import type { QuantNotificationRule, QuantNotificationSettings, QuantServiceConfig, QuantUser } from '../data/quant'

const shell = 'mx-auto w-[calc(100%_-_28px)] max-w-[1180px] sm:w-[calc(100%_-_48px)]'
const blankSettings: QuantNotificationSettings = { enabled: false, email: '', onBuy: true, onSell: true, rules: [] }
const scheduleFallback: QuantServiceConfig = {
  defaultFastPeriod: 12,
  defaultSlowPeriod: 26,
  syncAt: '00:00',
  syncTimezone: 'Asia/Shanghai',
  syncSchedule: '每天 00:00 (Asia/Shanghai)',
}

function settingsFor(user: QuantUser): QuantNotificationSettings {
  return { ...blankSettings, ...user.notifications, rules: user.notifications?.rules ?? [] }
}

function PreviewCard({ buy = true }: { buy?: boolean }) {
  const color = buy ? '#237549' : '#a44247'
  const tint = buy ? '#eaf6ed' : '#fff0ed'
  return (
    <div className="overflow-hidden rounded-[16px] border border-[#e3e5de] bg-white">
      <div className="flex items-start justify-between gap-3 p-4">
        <div>
          <p className="m-0 text-[9px] font-bold tracking-[.1em] text-[#999d94]">中周期 · 趋势确认</p>
          <h3 className="mt-1.5 mb-0 font-mono text-[17px] font-extrabold tracking-[-.04em]">{buy ? 'BTC-USDT' : 'ETH-USDT'}</h3>
        </div>
        <span className="rounded-full px-2.5 py-1.5 text-[9px] font-extrabold" style={{ color, backgroundColor: tint }}>{buy ? '金叉 · 买入观察' : '死叉 · 卖出观察'}</span>
      </div>
      <div className="grid grid-cols-3 border-t border-[#eff0eb] px-4 py-3">
        {[['周期', '1D'], ['EMA 快 / 慢', buy ? '12 / 26' : '8 / 21'], ['收盘价', buy ? '68,421.35' : '3,521.68']].map(([label, value]) => (
          <div key={label}><span className="block text-[8px] text-[#999d94]">{label}</span><strong className="mt-1 block text-[9px] text-[#30332d]">{value}</strong></div>
        ))}
      </div>
    </div>
  )
}

function StrategyCard({
  index,
  rule,
  onChange,
  onRemove,
}: {
  index: number
  rule: QuantNotificationRule
  onChange: (patch: Partial<QuantNotificationRule>) => void
  onRemove: () => void
}) {
  return (
    <article className={`rounded-[18px] border p-4 transition sm:p-5 ${rule.enabled ? 'border-[#d9dbd3] bg-white' : 'border-[#e8e9e4] bg-[#fafaf7]'}`}>
      <div className="flex items-start gap-3">
        <span className={`grid size-9 shrink-0 place-items-center rounded-xl font-mono text-[11px] font-bold ${rule.enabled ? 'bg-[#eff0ff] text-[#5557e8]' : 'bg-[#eeeeea] text-[#92968d]'}`}>{String(index + 1).padStart(2, '0')}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="m-0 text-[13px] font-bold tracking-[-.02em]">策略分段 {String(index + 1).padStart(2, '0')}</h3><p className="mt-1 mb-0 text-[9px] text-[#8b8f86]">同一标的可添加多组 EMA 周期</p></div>
            <div className="flex items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#e3e5de] bg-[#fbfbf8] px-3 py-2 text-[9px] font-semibold text-[#555852]"><input checked={rule.enabled} className="size-3.5 accent-[#5557e8]" onChange={(event) => onChange({ enabled: event.target.checked })} type="checkbox" />启用</label>
              <button aria-label={`删除策略分段 ${index + 1}`} className="grid size-8 cursor-pointer place-items-center rounded-full border border-transparent bg-transparent text-[#a0a29c] transition hover:border-[#f0d5d0] hover:bg-[#fff5f2] hover:text-[#a04444]" onClick={onRemove} type="button"><Trash2 className="size-3.5" /></button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_100px_100px]">
            <label className="text-[9px] font-semibold text-[#676b63]">标的代码<input autoCapitalize="characters" className="mt-1.5 block h-10 w-full rounded-xl border border-[#d8dad3] bg-[#fbfbf8] px-3 font-mono text-[11px] font-semibold text-[#171916] outline-none focus:border-[#5557e8]" maxLength={25} onChange={(event) => onChange({ instrumentId: event.target.value.toUpperCase() })} placeholder="BTC-USDT" value={rule.instrumentId} /></label>
            <label className="text-[9px] font-semibold text-[#676b63]">分段名称<input className="mt-1.5 block h-10 w-full rounded-xl border border-[#d8dad3] bg-[#fbfbf8] px-3 text-[11px] text-[#171916] outline-none focus:border-[#5557e8]" maxLength={32} onChange={(event) => onChange({ label: event.target.value })} placeholder="例如：中周期趋势" value={rule.label} /></label>
            <label className="text-[9px] font-semibold text-[#676b63]">快 EMA<input className="mt-1.5 block h-10 w-full rounded-xl border border-[#d8dad3] bg-[#fbfbf8] px-3 font-mono text-[12px] text-[#171916] outline-none focus:border-[#5557e8]" max={299} min={2} onChange={(event) => onChange({ fastPeriod: Number(event.target.value) })} type="number" value={rule.fastPeriod} /></label>
            <label className="text-[9px] font-semibold text-[#676b63]">慢 EMA<input className="mt-1.5 block h-10 w-full rounded-xl border border-[#d8dad3] bg-[#fbfbf8] px-3 font-mono text-[12px] text-[#171916] outline-none focus:border-[#5557e8]" max={300} min={3} onChange={(event) => onChange({ slowPeriod: Number(event.target.value) })} type="number" value={rule.slowPeriod} /></label>
          </div>
          <p className="mt-3 mb-0 text-[9px] text-[#999d94]">要求：2 ≤ 快 EMA &lt; 慢 EMA ≤ 300。金叉和死叉由全局信号开关控制。</p>
        </div>
      </div>
    </article>
  )
}

export function QuantNotificationPage() {
  const [user, setUser] = useState<QuantUser | null>(null)
  const [settings, setSettings] = useState<QuantNotificationSettings>(blankSettings)
  const [schedule, setSchedule] = useState<QuantServiceConfig>(scheduleFallback)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([
      getQuantUser(),
      getQuantServiceConfig().catch(() => scheduleFallback),
    ])
      .then(([currentUser, currentSchedule]) => {
        if (!active) return
        setUser(currentUser)
        setSchedule(currentSchedule)
        if (currentUser) setSettings(settingsFor(currentUser))
      })
      .catch((requestError: unknown) => { if (active) setError(requestError instanceof Error ? requestError.message : '通知设置读取失败') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const updateRule = (index: number, patch: Partial<QuantNotificationRule>) => {
    setSettings((current) => ({ ...current, rules: current.rules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...patch } : rule) }))
  }

  const addRule = () => {
    setSettings((current) => ({
      ...current,
      rules: [...current.rules, {
        label: '',
        instrumentId: user?.watchlist[0] ?? 'BTC-USDT',
        fastPeriod: 12,
        slowPeriod: 26,
        enabled: true,
      }],
    }))
    setError('')
    setStatus('')
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (settings.enabled && !settings.onBuy && !settings.onSell) {
      setError('开启通知时至少选择一种信号方向。')
      setStatus('')
      return
    }
    if (settings.enabled && !settings.rules.some((rule) => rule.enabled)) {
      setError('开启通知时至少添加并启用一组策略分段。')
      setStatus('')
      return
    }
    setSaving(true)
    setError('')
    setStatus('')
    try {
      const updated = await updateQuantNotifications(settings)
      setUser(updated)
      setSettings(settingsFor(updated))
      setStatus('通知设置已保存。符合条件的新信号会在下一次定时同步后汇总发送。')
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : '保存通知设置失败')
    } finally {
      setSaving(false)
    }
  }

  const sendTest = async () => {
    setTesting(true)
    setError('')
    setStatus('')
    try {
      await sendQuantTestNotification()
      setStatus('样式预览邮件已发送，请检查收件箱。')
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : '邮件发送失败')
    } finally {
      setTesting(false)
    }
  }

  const logout = async () => {
    try {
      await logoutQuantUser()
      setUser(null)
      setSettings(blankSettings)
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : '退出登录失败')
    }
  }

  const testReady = Boolean(settings.email && settings.email === user?.notifications?.email)

  return (
    <main>
      <section className="border-b border-[#e1e2db] bg-[#f6f6f2] py-7 sm:py-10">
        <div className={`${shell} flex flex-wrap items-center justify-between gap-4`}>
          <Link className="inline-flex items-center gap-2 rounded-full border border-[#d6d7d0] bg-white px-3.5 py-2 text-[10px] font-bold text-[#555852] no-underline transition hover:border-[#151615] hover:text-[#151615]" to="/quant/account"><ArrowLeft className="size-3.5" />账户</Link>
          <span className="font-mono text-[9px] font-semibold tracking-[.15em] text-[#a0a29c]">SIGNAL DELIVERY SETTINGS</span>
        </div>
      </section>
      <div className={`${shell} py-8 sm:py-12`}>
        {loading && <div className="grid min-h-[320px] place-items-center rounded-[26px] border border-[#deded7] bg-white text-[11px] text-[#858880]">正在读取通知设置…</div>}
        {!loading && error && !user && <div className="mx-auto max-w-[620px] rounded-2xl border border-[#f1d4cd] bg-[#fff5f2] p-5 text-[11px] leading-[1.7] text-[#a04444]" role="alert">{error}</div>}
        {!loading && !error && !user && (
          <div className="mx-auto max-w-[900px]">
            <div className="mb-6 rounded-2xl border border-[#deded7] bg-white p-5 text-[11px] leading-[1.7] text-[#686c64]">登录或注册后，你可以为同一标的设置多组 EMA 策略，并将每日新信号合并成一封邮件。</div>
            <AuthPanel onAuthenticated={(authenticatedUser) => { setUser(authenticatedUser); setSettings(settingsFor(authenticatedUser)) }} />
          </div>
        )}
        {!loading && user && (
          <div className="space-y-6">
            <section className="overflow-hidden rounded-[26px] bg-[#171916] p-6 text-white sm:p-9">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="max-w-[700px]">
                  <div className="flex items-center gap-2 font-mono text-[9px] font-bold tracking-[.18em] text-[#d9ff63]"><Bell className="size-3.5" /> EMA SIGNAL ROUTING</div>
                  <h1 className="mt-4 mb-0 text-[30px] font-semibold leading-[1.08] tracking-[-.06em] sm:text-[40px]">把策略信号，<br className="sm:hidden" />整理成一封清晰的邮件。</h1>
                  <p className="mt-4 mb-0 max-w-[620px] text-[11px] leading-[1.8] text-white/60">每组策略独立配置标的与快慢 EMA。每天的定时同步会检查所有已启用组合，并把本轮新发现的信号按账户汇总发送。</p>
                </div>
                <button className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 text-[10px] font-semibold text-white/75 transition hover:border-white/40 hover:text-white" onClick={() => { void logout() }} type="button"><ShieldCheck className="size-3.5" />{user.email} · 退出</button>
              </div>
              <div className="mt-7 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-3">
                <div className="flex items-center gap-3"><CalendarClock className="size-4 text-[#d9ff63]" /><div><span className="block text-[8px] uppercase tracking-[.12em] text-white/40">每日任务</span><strong className="mt-1 block text-[11px]">{schedule.syncSchedule}</strong></div></div>
                <div className="flex items-center gap-3"><Mail className="size-4 text-[#d9ff63]" /><div><span className="block text-[8px] uppercase tracking-[.12em] text-white/40">发送规则</span><strong className="mt-1 block text-[11px]">一账号一封 · 仅有新信号时发送</strong></div></div>
                <div className="flex items-center gap-3"><Check className="size-4 text-[#d9ff63]" /><div><span className="block text-[8px] uppercase tracking-[.12em] text-white/40">已配置策略</span><strong className="mt-1 block text-[11px]">{settings.rules.filter((rule) => rule.enabled).length} 组启用</strong></div></div>
              </div>
            </section>

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,.7fr)]">
              <form className="space-y-6" onSubmit={(event) => { void save(event) }}>
                <section className="rounded-[24px] border border-[#deded7] bg-white p-5 sm:p-7">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><p className="m-0 font-mono text-[9px] font-bold tracking-[.15em] text-[#5557e8]">01 · DELIVERY</p><h2 className="mt-2 mb-1 text-[19px] tracking-[-.04em]">邮件接收方式</h2><p className="m-0 text-[10px] leading-[1.7] text-[#858880]">收件地址和方向开关对下面所有策略生效。</p></div>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#dfe1da] bg-[#f8f8f5] px-3.5 py-2 text-[10px] font-bold text-[#454941]"><input checked={settings.enabled} className="size-3.5 accent-[#5557e8]" onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))} type="checkbox" />开启邮件通知</label>
                  </div>
                  <label className="mt-5 block text-[9px] font-semibold text-[#676b63]">接收邮箱<input className="mt-1.5 block h-11 w-full rounded-xl border border-[#d8dad3] bg-[#fbfbf8] px-3 text-[12px] text-[#171916] outline-none focus:border-[#5557e8]" onChange={(event) => setSettings((current) => ({ ...current, email: event.target.value }))} required={settings.enabled} type="email" value={settings.email} /></label>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#e2e4dd] bg-[#fbfbf8] p-3.5"><input checked={settings.onBuy} className="size-4 accent-[#237549]" onChange={(event) => setSettings((current) => ({ ...current, onBuy: event.target.checked }))} type="checkbox" /><span className="grid size-8 place-items-center rounded-lg bg-[#eaf6ed] text-[#237549]"><TrendingUp className="size-4" /></span><span><strong className="block text-[10px] text-[#272a24]">金叉 · 买入观察</strong><span className="mt-0.5 block text-[9px] text-[#92968d]">快 EMA 向上穿越慢 EMA</span></span></label>
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#e2e4dd] bg-[#fbfbf8] p-3.5"><input checked={settings.onSell} className="size-4 accent-[#a44247]" onChange={(event) => setSettings((current) => ({ ...current, onSell: event.target.checked }))} type="checkbox" /><span className="grid size-8 place-items-center rounded-lg bg-[#fff0ed] text-[#a44247]"><TrendingDown className="size-4" /></span><span><strong className="block text-[10px] text-[#272a24]">死叉 · 卖出观察</strong><span className="mt-0.5 block text-[9px] text-[#92968d]">快 EMA 向下穿越慢 EMA</span></span></label>
                  </div>
                </section>

                <section className="rounded-[24px] border border-[#deded7] bg-white p-5 sm:p-7">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div><p className="m-0 font-mono text-[9px] font-bold tracking-[.15em] text-[#5557e8]">02 · STRATEGY SEGMENTS</p><h2 className="mt-2 mb-1 text-[19px] tracking-[-.04em]">策略分段</h2><p className="m-0 text-[10px] leading-[1.7] text-[#858880]">可重复添加相同标的，每组使用独立的 EMA 快慢周期。</p></div>
                    <button className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-[#d9dbd3] bg-white px-3.5 text-[10px] font-bold text-[#5557e8] transition hover:border-[#5557e8]" onClick={addRule} type="button"><Plus className="size-3.5" />添加策略分段</button>
                  </div>
                  <div className="mt-5 space-y-3">
                    {settings.rules.map((rule, index) => <StrategyCard index={index} key={`${rule.instrumentId}-${rule.fastPeriod}-${rule.slowPeriod}-${index}`} onChange={(patch) => updateRule(index, patch)} onRemove={() => setSettings((current) => ({ ...current, rules: current.rules.filter((_, ruleIndex) => ruleIndex !== index) }))} rule={rule} />)}
                    {settings.rules.length === 0 && <div className="rounded-2xl border border-dashed border-[#d5d8cf] bg-[#fbfbf8] px-5 py-9 text-center"><span className="mx-auto grid size-10 place-items-center rounded-xl bg-[#eff0ff] text-[#5557e8]"><Bell className="size-4" /></span><h3 className="mt-3 mb-1 text-[12px] font-bold">还没有策略分段</h3><p className="mx-auto mt-0 mb-4 max-w-[340px] text-[9px] leading-[1.7] text-[#92968d]">添加标的与快慢 EMA 周期。每组都会在定时同步中独立计算信号。</p><button className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl bg-[#151615] px-3.5 text-[9px] font-bold text-white transition hover:bg-[#5557e8]" onClick={addRule} type="button"><Plus className="size-3.5" />添加第一组</button></div>}
                  </div>
                </section>

                {error && <div className="flex items-start gap-2 rounded-xl bg-[#fff5f2] px-4 py-3 text-[10px] leading-[1.7] text-[#a04444]" role="alert"><CircleAlert className="mt-0.5 size-3.5 shrink-0" />{error}</div>}
                {status && <div className="rounded-xl bg-[#eef9f1] px-4 py-3 text-[10px] leading-[1.7] text-[#27734a]" role="status">{status}</div>}
                <div className="flex flex-wrap gap-2">
                  <button className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-[#151615] px-5 text-[10px] font-bold text-white transition hover:bg-[#5557e8] disabled:cursor-not-allowed disabled:opacity-60" disabled={saving} type="submit"><Save className="size-3.5 text-[#d9ff63]" />{saving ? '正在保存…' : '保存通知设置'}</button>
                  <button className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-[#d6d7d0] bg-white px-4 text-[10px] font-bold text-[#555852] transition hover:border-[#151615] disabled:cursor-not-allowed disabled:opacity-60" disabled={testing || !testReady} onClick={() => { void sendTest() }} type="button"><Send className="size-3.5" />{testing ? '正在发送…' : '发送邮件预览'}</button>
                  {!testReady && settings.email && <p className="m-0 self-center text-[9px] text-[#92968d]">保存邮箱后可发送预览。</p>}
                </div>
              </form>

              <aside className="space-y-5 lg:sticky lg:top-[92px]">
                <section className="rounded-[24px] border border-[#deded7] bg-white p-5 sm:p-6">
                  <p className="m-0 font-mono text-[9px] font-bold tracking-[.15em] text-[#5557e8]">EMAIL LAYOUT</p><h2 className="mt-2 mb-1 text-[17px] tracking-[-.04em]">收件箱中的信号卡片</h2><p className="m-0 text-[9px] leading-[1.7] text-[#858880]">每轮把所有新信号合成一封，按金叉/死叉、策略名称和 EMA 参数标注。</p>
                  <div className="mt-4 space-y-3"><PreviewCard /><PreviewCard buy={false} /></div>
                  <div className="mt-4 rounded-xl bg-[#f6f7f3] p-3.5 text-[9px] leading-[1.8] text-[#73776f]"><strong className="text-[#30332d]">邮件包含</strong><br />策略分段 · 标的 · 信号方向<br />K 线周期 · EMA 快慢值 · 收盘价<br />信号发生时间 · 风险提示</div>
                </section>
                <section className="rounded-[20px] border border-[#dfe1d9] bg-[#f8f8f4] p-5">
                  <div className="flex items-center gap-2 text-[#5557e8]"><CalendarClock className="size-4" /><h2 className="m-0 text-[12px] font-bold text-[#252822]">发送时机</h2></div>
                  <p className="mt-3 mb-0 text-[10px] leading-[1.8] text-[#686c64]">服务每天在 <strong className="text-[#252822]">{schedule.syncSchedule}</strong> 执行同步。只有发现新的、已启用的信号时才发送；没有新信号就不发空邮件。</p>
                  <p className="mt-2 mb-0 text-[9px] leading-[1.7] text-[#999d94]">服务重启后会先按启动配置同步一次；邮件汇总只在每日定时任务中发送。</p>
                </section>
              </aside>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

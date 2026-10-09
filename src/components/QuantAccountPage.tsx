import {
  ArrowLeft,
  Bell,
  Check,
  CircleAlert,
  LogIn,
  LogOut,
  Mail,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  getQuantUser,
  loginQuantUser,
  logoutQuantUser,
  registerQuantUser,
  sendQuantRegistrationCode,
  sendQuantTestNotification,
  updateQuantNotifications,
  type AccountMode,
} from '../data/quantAccount'
import type { QuantNotificationSettings, QuantUser } from '../data/quant'

const shell = 'mx-auto w-[calc(100%_-_28px)] max-w-[1080px] sm:w-[calc(100%_-_48px)]'
const defaultNotificationSettings: QuantNotificationSettings = { enabled: false, email: '', onBuy: true, onSell: true }

function AuthPanel({ onAuthenticated }: { onAuthenticated: (user: QuantUser) => void }) {
  const [mode, setMode] = useState<AccountMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (countdown <= 0) return
    const timer = window.setInterval(() => setCountdown((current) => Math.max(current - 1, 0)), 1000)
    return () => window.clearInterval(timer)
  }, [countdown])

  const sendCode = async () => {
    const normalizedEmail = email.trim()
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setError('请先输入有效的邮箱地址')
      return
    }
    setSendingCode(true)
    setError('')
    setNotice('')
    try {
      const result = await sendQuantRegistrationCode(normalizedEmail)
      setCountdown(result.retryAfter || 60)
      setNotice(`验证码已发送至 ${normalizedEmail}，10 分钟内有效`)
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : '验证码发送失败')
    } finally {
      setSendingCode(false)
    }
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setNotice('')
    if (mode === 'register' && password !== confirmPassword) {
      setError('两次输入的密码不一致')
      setLoading(false)
      return
    }
    try {
      const user = mode === 'login'
        ? await loginQuantUser(email.trim(), password)
        : await registerQuantUser(email.trim(), password, confirmPassword, code.trim())
      onAuthenticated(user)
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : '账户操作失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="mx-auto grid max-w-[880px] overflow-hidden rounded-[26px] border border-[#deded7] bg-white shadow-[0_20px_60px_rgba(21,22,21,.08)] lg:grid-cols-[.92fr_1.08fr]">
      <div className="bg-[#151615] p-7 text-white sm:p-10">
        <span className="grid size-11 place-items-center rounded-2xl bg-[#d9ff63] text-[#151615]"><ShieldCheck className="size-5" /></span>
        <p className="mt-8 mb-0 font-mono text-[9px] font-semibold tracking-[.18em] text-[#d9ff63]">QUANT ACCOUNT</p>
        <h1 className="mt-3 mb-0 text-[34px] leading-[1.08] tracking-[-.06em]">把关注和信号，<br />交给你的账户。</h1>
        <p className="mt-5 mb-0 max-w-[320px] text-[11px] leading-[1.8] text-white/55">注册时验证邮箱，登录使用邮箱和密码；关注标的会保存在服务端，并可按设置接收 EMA 信号邮件。</p>
        <div className="mt-8 space-y-3 text-[10px] text-white/65">
          <div className="flex items-center gap-2"><Check className="size-3.5 text-[#d9ff63]" /> 关注列表跨浏览器同步</div>
          <div className="flex items-center gap-2"><Check className="size-3.5 text-[#d9ff63]" /> 买入 / 卖出信号独立开关</div>
          <div className="flex items-center gap-2"><Check className="size-3.5 text-[#d9ff63]" /> 不会自动替你下单</div>
        </div>
      </div>

      <div className="p-7 sm:p-10">
        <div className="flex items-center justify-between gap-3">
          <div><p className="m-0 font-mono text-[9px] font-semibold tracking-[.16em] text-[#5557e8]">{mode === 'login' ? 'WELCOME BACK' : 'CREATE ACCOUNT'}</p><h2 className="mt-2 mb-0 text-[24px] tracking-[-.05em]">{mode === 'login' ? '登录量化账户' : '创建量化账户'}</h2></div>
          <UserRound className="size-5 text-[#b2b4ae]" />
        </div>
        <form className="mt-8 space-y-4" onSubmit={submit}>
          <label className="block text-[10px] font-semibold text-[#555852]">邮箱地址<input autoComplete="email" className="mt-2 block h-11 w-full rounded-xl border border-[#d6d7d0] bg-[#fbfbf8] px-3 text-[12px] text-[#151615] outline-none transition focus:border-[#5557e8]" onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required type="email" value={email} /></label>
          <label className="block text-[10px] font-semibold text-[#555852]">密码<input autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className="mt-2 block h-11 w-full rounded-xl border border-[#d6d7d0] bg-[#fbfbf8] px-3 text-[12px] text-[#151615] outline-none transition focus:border-[#5557e8]" minLength={8} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 位字符" required type="password" value={password} /></label>
          {mode === 'register' && <label className="block text-[10px] font-semibold text-[#555852]">确认密码<input autoComplete="new-password" className="mt-2 block h-11 w-full rounded-xl border border-[#d6d7d0] bg-[#fbfbf8] px-3 text-[12px] text-[#151615] outline-none transition focus:border-[#5557e8]" minLength={8} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="再次输入密码" required type="password" value={confirmPassword} /></label>}
          {mode === 'register' && <label className="block text-[10px] font-semibold text-[#555852]">邮箱验证码<div className="mt-2 flex gap-2"><input autoComplete="one-time-code" className="block h-11 min-w-0 flex-1 rounded-xl border border-[#d6d7d0] bg-[#fbfbf8] px-3 font-mono text-[14px] tracking-[.18em] text-[#151615] outline-none transition focus:border-[#5557e8]" inputMode="numeric" maxLength={6} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} pattern="[0-9]{6}" placeholder="6 位验证码" required value={code} /><button className="h-11 shrink-0 cursor-pointer rounded-xl border border-[#d6d7d0] bg-[#fbfbf8] px-3 text-[10px] font-bold text-[#5557e8] transition hover:border-[#5557e8] disabled:cursor-not-allowed disabled:opacity-50" disabled={sendingCode || countdown > 0} onClick={() => { void sendCode() }} type="button">{sendingCode ? '发送中…' : countdown > 0 ? `${countdown}s 后重发` : '发送验证码'}</button></div><span className="mt-1.5 block text-[9px] font-normal text-[#a0a29c]">注册需要邮箱验证码，验证码 10 分钟内有效。</span></label>}
          {error && <div className="flex items-start gap-2 rounded-xl bg-[#fff5f2] px-3 py-2.5 text-[10px] leading-[1.6] text-[#a04444]" role="alert"><CircleAlert className="mt-0.5 size-3.5 shrink-0" />{error}</div>}
          {notice && <div className="rounded-xl bg-[#eef9f1] px-3 py-2.5 text-[10px] leading-[1.6] text-[#27734a]" role="status">{notice}</div>}
          <button className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#151615] text-[11px] font-bold text-white transition hover:bg-[#5557e8] disabled:cursor-not-allowed disabled:opacity-60" disabled={loading} type="submit"><LogIn className="size-4" />{loading ? '处理中…' : mode === 'login' ? '登录' : '创建并登录'}</button>
        </form>
        <button className="mt-5 w-full cursor-pointer border-0 bg-transparent text-[10px] text-[#777a74] transition hover:text-[#5557e8]" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setConfirmPassword(''); setCode(''); setCountdown(0); setError(''); setNotice('') }} type="button">{mode === 'login' ? '还没有账户？创建一个' : '已有账户？返回登录'}</button>
      </div>
    </section>
  )
}

function SettingsPanel({ user, onUserChange, onLogout }: { user: QuantUser; onUserChange: (user: QuantUser) => void; onLogout: () => void }) {
  const [settings, setSettings] = useState<QuantNotificationSettings>(user.notifications ?? defaultNotificationSettings)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setStatus('')
    setError('')
    try {
      const updated = await updateQuantNotifications(settings)
      onUserChange(updated)
      setSettings(updated.notifications)
      setStatus('通知设置已保存')
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const sendTest = async () => {
    setTesting(true)
    setStatus('')
    setError('')
    try {
      await sendQuantTestNotification()
      setStatus('测试邮件已提交')
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : '测试邮件发送失败')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[24px] border border-[#deded7] bg-white p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-[#eff0ff] text-[#5557e8]"><UserRound className="size-5" /></span><div><p className="m-0 font-mono text-[9px] tracking-[.14em] text-[#a0a29c]">SIGNED IN</p><h1 className="mt-1 mb-0 text-[23px] tracking-[-.05em]">{user.email}</h1></div></div>
          <button className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-[#d6d7d0] bg-white px-3.5 text-[10px] font-bold text-[#555852] transition hover:border-[#a04444] hover:text-[#a04444]" onClick={onLogout} type="button"><LogOut className="size-3.5" />退出登录</button>
        </div>
        <div className="mt-7 grid gap-3 border-t border-[#efefe9] pt-5 sm:grid-cols-3"><div className="rounded-xl bg-[#f8f8f5] p-3"><span className="block text-[9px] text-[#a0a29c]">邮箱状态</span><strong className="mt-1 block text-[12px] text-[#27734a]">已验证</strong></div><div className="rounded-xl bg-[#f8f8f5] p-3"><span className="block text-[9px] text-[#a0a29c]">服务端关注</span><strong className="mt-1 block text-[12px] text-[#151615]">{user.watchlist.length} 个标的</strong></div><div className="rounded-xl bg-[#f8f8f5] p-3"><span className="block text-[9px] text-[#a0a29c]">通知渠道</span><strong className="mt-1 block text-[12px] text-[#151615]">{settings.enabled ? '邮件已开启' : '未开启'}</strong></div></div>
      </section>

      <section className="rounded-[24px] border border-[#deded7] bg-white p-6 sm:p-8">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#f4f4df] text-[#a57816]"><Bell className="size-4" /></span><div><h2 className="m-0 text-[18px] tracking-[-.04em]">信号邮件通知</h2><p className="mt-1 mb-0 text-[10px] text-[#858880]">当关注标的出现 EMA 金叉或死叉时发送邮件。</p></div></div>
        <form className="mt-6" onSubmit={save}>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#efefe9] bg-[#fbfbf8] p-3.5 text-[11px] font-semibold text-[#555852]"><input checked={settings.enabled} className="size-4 accent-[#5557e8]" onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))} type="checkbox" />开启信号邮件通知</label>
          <label className="mt-4 block text-[10px] font-semibold text-[#555852]"><span className="flex items-center gap-2"><Mail className="size-3.5 text-[#a0a29c]" />接收邮箱</span><input className="mt-2 block h-10 w-full rounded-xl border border-[#d6d7d0] bg-[#fbfbf8] px-3 text-[11px] text-[#151615] outline-none transition focus:border-[#5557e8]" onChange={(event) => setSettings((current) => ({ ...current, email: event.target.value }))} required={settings.enabled} type="email" value={settings.email} /></label>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#efefe9] p-3 text-[10px] text-[#555852]"><input checked={settings.onBuy} className="size-4 accent-[#27734a]" onChange={(event) => setSettings((current) => ({ ...current, onBuy: event.target.checked }))} type="checkbox" /><span><strong className="block text-[#151615]">买入信号</strong><span className="mt-0.5 block text-[#a0a29c]">EMA 金叉</span></span></label><label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#efefe9] p-3 text-[10px] text-[#555852]"><input checked={settings.onSell} className="size-4 accent-[#a04444]" onChange={(event) => setSettings((current) => ({ ...current, onSell: event.target.checked }))} type="checkbox" /><span><strong className="block text-[#151615]">卖出信号</strong><span className="mt-0.5 block text-[#a0a29c]">EMA 死叉</span></span></label></div>
          {error && <p className="mt-4 mb-0 rounded-xl bg-[#fff5f2] px-3 py-2.5 text-[10px] leading-[1.6] text-[#a04444]" role="alert">{error}</p>}
          {status && <p className="mt-4 mb-0 rounded-xl bg-[#eef9f1] px-3 py-2.5 text-[10px] leading-[1.6] text-[#27734a]" role="status">{status}</p>}
          <div className="mt-5 flex flex-wrap gap-2"><button className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-[#151615] px-4 text-[10px] font-bold text-white transition hover:bg-[#5557e8] disabled:cursor-not-allowed disabled:opacity-60" disabled={saving} type="submit"><Sparkles className="size-3.5 text-[#d9ff63]" />{saving ? '保存中…' : '保存通知设置'}</button><button className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-[#d6d7d0] bg-white px-4 text-[10px] font-bold text-[#555852] transition hover:border-[#151615] hover:text-[#151615] disabled:cursor-not-allowed disabled:opacity-60" disabled={testing || !settings.email} onClick={() => { void sendTest() }} type="button"><Mail className="size-3.5" />{testing ? '发送中…' : '发送测试邮件'}</button></div>
        </form>
      </section>

      <section className="rounded-[24px] border border-[#deded7] bg-white p-6 sm:p-8"><div className="flex items-center justify-between gap-3"><div><h2 className="m-0 text-[18px] tracking-[-.04em]">我的关注</h2><p className="mt-1 mb-0 text-[10px] text-[#858880]">关注列表由服务端账户统一管理，不依赖浏览器缓存。</p></div><Link className="text-[10px] font-bold text-[#5557e8] no-underline hover:underline" to="/quant">管理列表 →</Link></div><div className="mt-5 flex flex-wrap gap-2">{user.watchlist.map((symbol) => <Link className="rounded-full border border-[#deded7] bg-[#fbfbf8] px-3 py-2 font-mono text-[10px] font-semibold text-[#555852] no-underline transition hover:border-[#5557e8] hover:text-[#5557e8]" key={symbol} to={`/quant/${encodeURIComponent(symbol)}`}>{symbol}</Link>)}</div></section>
    </div>
  )
}

export function QuantAccountPage() {
  const [user, setUser] = useState<QuantUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    getQuantUser()
      .then((currentUser) => { if (active) setUser(currentUser) })
      .catch((requestError: unknown) => { if (active) setError(requestError instanceof Error ? requestError.message : '账户读取失败') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const logout = async () => {
    try {
      await logoutQuantUser()
      setUser(null)
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : '退出登录失败')
    }
  }

  return (
    <main>
      <section className="bg-[#f6f6f2] py-7 sm:py-10"><div className={`${shell} flex flex-wrap items-center justify-between gap-4`}><Link className="inline-flex items-center gap-2 rounded-full border border-[#d6d7d0] bg-white px-3.5 py-2 text-[10px] font-bold text-[#555852] no-underline transition hover:border-[#151615] hover:text-[#151615]" to="/quant"><ArrowLeft className="size-3.5" />返回标的列表</Link><span className="font-mono text-[9px] font-semibold tracking-[.14em] text-[#a0a29c]">USER &amp; NOTIFICATION CONTROL</span></div></section>
      <div className={`${shell} py-8 sm:py-12`}>
        {loading && <div className="grid min-h-[360px] place-items-center rounded-[26px] border border-[#deded7] bg-white text-[11px] text-[#858880]">正在读取账户状态…</div>}
        {!loading && error && <div className="mx-auto max-w-[620px] rounded-2xl border border-[#f1d4cd] bg-[#fff5f2] p-5 text-[11px] leading-[1.7] text-[#a04444]" role="alert">{error}</div>}
        {!loading && !error && !user && <AuthPanel onAuthenticated={setUser} />}
        {!loading && !error && user && <SettingsPanel onLogout={() => { void logout() }} onUserChange={setUser} user={user} />}
      </div>
    </main>
  )
}

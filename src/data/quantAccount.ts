import { quantApiUrl, type QuantNotificationSettings, type QuantUser } from './quant'

export type AccountMode = 'login' | 'register'

export interface EmailCodeResult {
  sent: boolean
  expiresIn: number
  retryAfter: number
}

async function request<T>(path: string, init: RequestInit = {}) {
  const url = quantApiUrl(path)
  if (!url) throw new Error('量化服务地址未配置')
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(url, { ...init, credentials: 'include', headers, cache: 'no-store' })
  const payload = await response.json().catch(() => null) as T | { error?: string } | null
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string' ? payload.error : `请求失败：${response.status}`
    throw new Error(message)
  }
  return payload as T
}

export async function getQuantUser() {
  const url = quantApiUrl('/auth/me')
  if (!url) return null
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' })
  if (response.status === 401) return null
  const payload = await response.json().catch(() => null) as QuantUser | { error?: string } | null
  if (!response.ok) {
    throw new Error(payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string' ? payload.error : `账户读取失败：${response.status}`)
  }
  return payload as QuantUser
}

export async function sendQuantRegistrationCode(email: string) {
  return request<EmailCodeResult>('/auth/email-code', { method: 'POST', body: JSON.stringify({ email }) })
}

export async function loginQuantUser(email: string, password: string) {
  return request<QuantUser>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
}

export async function registerQuantUser(email: string, password: string, confirmPassword: string, code: string) {
  return request<QuantUser>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, confirmPassword, code }) })
}

export async function logoutQuantUser() {
  await request('/auth/logout', { method: 'POST' })
}

export async function updateQuantWatchlist(symbols: string[]) {
  return request<QuantUser>('/watchlist', { method: 'PUT', body: JSON.stringify({ symbols }) })
}

export async function updateQuantNotifications(settings: QuantNotificationSettings) {
  return request<QuantUser>('/notifications', { method: 'PUT', body: JSON.stringify(settings) })
}

export async function sendQuantTestNotification() {
  return request<{ sent: boolean }>('/notifications/test', { method: 'POST' })
}

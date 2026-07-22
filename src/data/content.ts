import type { Profile } from './profile'
import type { RepositoryProject } from './projects'

export interface PortfolioContent {
  profile: Profile
  projects: RepositoryProject[]
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error(`读取 ${url} 失败：${response.status}`)
  }

  return response.json() as Promise<T>
}

export async function loadPortfolioContent(): Promise<PortfolioContent> {
  const [profile, projects] = await Promise.all([
    fetchJson<Profile>('/data/profile.json'),
    fetchJson<RepositoryProject[]>('/data/projects.json'),
  ])

  return { profile, projects }
}

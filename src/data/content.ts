import type { GraduationCase } from './projects'
import type { ResourcePost } from './resources'

export interface SiteContent {
  resources: ResourcePost[]
  cases: GraduationCase[]
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error(`读取 ${url} 失败：${response.status}`)
  }

  return response.json() as Promise<T>
}

export async function loadSiteContent(): Promise<SiteContent> {
  const [resources, cases] = await Promise.all([
    fetchJson<ResourcePost[]>('/data/resources.json'),
    fetchJson<GraduationCase[]>('/data/projects.json'),
  ])

  return { resources, cases }
}

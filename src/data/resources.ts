export interface ResourceSection {
  title: string
  paragraphs: string[]
  points?: string[]
}

export interface ResourcePost {
  slug: string
  title: string
  excerpt: string
  category: string
  publishedAt: string
  readTime: string
  tags: string[]
  featured: boolean
  issue: string
  sections: ResourceSection[]
}

export function getResourceBySlug(resources: ResourcePost[], slug?: string) {
  return resources.find((resource) => resource.slug === slug)
}

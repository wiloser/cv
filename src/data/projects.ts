export interface RepositoryProject {
  owner: string
  name: string
  title: string
  tagline: string
  description: string
  category: string
  completedAt: string
  language: string
  languageColor: string
  technologies: string[]
  features: string[]
  highlights: string[]
  environment: string[]
  deploymentUrl: string
}

export function getProjectBySlug(projects: RepositoryProject[], slug?: string) {
  return projects.find((project) => project.name === slug)
}

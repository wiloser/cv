export interface GraduationCase {
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
  downloadUrl: string
  guideUrl: string
  downloadFormat: string
  downloadSize: string
}

export function getCaseBySlug(cases: GraduationCase[], slug?: string) {
  return cases.find((item) => item.name === slug)
}

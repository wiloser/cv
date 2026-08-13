export interface ProfileDirection {
  title: string
  description: string
}

export interface Profile {
  name: string
  handle: string
  role: string
  location: string
  intro: string
  email: string
  resumeUrl: string
  skills: string[]
  directions: ProfileDirection[]
}

export const profile: Profile = {
  name: '陈序',
  handle: 'chenxu',
  role: '前端与全栈开发者',
  location: '杭州 · 可远程协作',
  intro: '关注 Web 全栈、数据可视化与 AI 应用工程，喜欢把真实需求打磨成可运行、可扩展的产品。',
  email: '',
  resumeUrl: '',
  skills: ['React', 'TypeScript', 'Vue', 'Go', 'Python', 'SQLite', 'ECharts'],
  directions: [
    { title: 'Web 全栈开发', description: '从界面、接口到数据建模完成应用闭环。' },
    { title: '数据产品与可视化', description: '把复杂数据整理成清晰、可解释的分析视图。' },
    { title: 'AI 应用工程', description: '探索知识检索与模型服务的可靠落地。' },
  ],
}

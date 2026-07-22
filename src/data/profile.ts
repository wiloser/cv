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

export interface Project {
  id: string
  name: string
  description: string
  created_at: string
  last_edited_at: string | null
  role: "admin" | "member" | "viewer"
  zotero_configured: boolean
  zotero_last_sync: string | null
}

export interface Paper {
  id: string
  title: string
  authors: string[]
  year: number | null
  venue: string
  item_type: string
  arxiv_id: string
  zotero_key: string
  doi: string
  tags: string[]
  links: { zotero_web: string; zotero_local: string; arxiv: string; url: string; google_drive_pdf: string }
  preview_image: string
  abstract: string
  bibtex: string
  source: string
  _body?: string
  _path?: string
}

export interface Meeting {
  id: string
  date: string
  title: string
  start_time?: string
  end_time?: string
  location?: string
  attendees: string[]
  links: { google_drive: string; outlook?: string; outlook_calendar?: string; transcript: string }
  tabs?: DocumentTab[]
  _body?: string
  _path?: string
}

export interface Contact {
  handle: string
  name: string
  email: string
  role: string
  source: string
}

export interface ProjectMember {
  id: string
  user_id: string | null
  invite_id?: string
  name: string
  email: string
  role: "admin" | "member" | "viewer"
  status: "active" | "pending"
  is_creator: boolean
  registered: boolean
  joined_at?: string
  invited_at?: string
}

export interface Document {
  id: string
  title: string
  tags: string[]
  papers: string[]
  updated: string
  tabs?: DocumentTab[]
  _body?: string
}

export interface DocumentTab {
  id: string
  title: string
  content: string
}

export interface ProjectSkill {
  id: string
  title: string
  description: string
  tags: string[]
  path: string
  readonly: boolean
  content?: string
  metadata?: Record<string, unknown>
}

export interface SectionResourceDoc {
  id: string
  title: string
  tags: string[]
  path: string
  content: string
  metadata?: Record<string, unknown>
}

export interface SectionResourceDocRef {
  type: "doc" | "folder"
  path: string
}

export interface SectionResourceLink {
  id: string
  kind: string
  title: string
  url: string
}

export interface SectionResourceTreeNode {
  type: "dir" | "file"
  name: string
  path: string
  children?: SectionResourceTreeNode[]
}

export interface SectionResources {
  section: string
  scope?: string
  docs: SectionResourceDoc[]
  attached_docs: SectionResourceDoc[]
  doc_refs: SectionResourceDocRef[]
  skills: ProjectSkill[]
  skill_ids: string[]
  links: SectionResourceLink[]
  tree: SectionResourceTreeNode[]
  files: string[]
  local_root: string
}

export interface GanttItem {
  id: string; title: string; start: string; end: string
  doc_id?: string; mentions?: string[]; note?: string
}
export interface GanttTrack { id: string; name: string; color: string; items: GanttItem[] }
export interface GanttMilestone { id: string; title: string; date: string; color: string }
export interface GanttData { tracks: GanttTrack[]; milestones: GanttMilestone[] }

export interface WritingProject {
  id: string; title: string; description: string
  github_url: string; overleaf_url: string; files?: string[]
}

export interface MeetingSettings {
  default_location: string
  recurring_weekday: number | null
  recurring_time: string
  recurring_duration_minutes: number
}

export interface CodebookCriterion {
  id: string
  text: string
  order: number
}

export interface CodebookCode {
  id: string
  label: string
  parent_id: string | null
  description: string
  color: string
  fields: Record<string, string>
  order: number
}

export interface CodebookExcerpt {
  id: string
  paper_id: string
  code_id: string
  text: string
  note: string
  coder: string
  image: string        // legacy single image (backward compat)
  images: string[]     // multi-image (new)
  created_at: string
}

export interface ScreeningEntry {
  overall: "included" | "excluded" | "pending"
  [criterionId: string]: string
}

export interface CriterionOption {
  label: string
}

export interface StageCriterion {
  id: string
  text: string
  type: "boolean" | "select" | "multiselect"
  options: string[]
  order: number
}

export interface CodebookStage {
  id: string
  name: string
  order: number
  criteria: StageCriterion[]
  pass_logic: "all_pass" | "any_pass"
}

export interface PaperScreeningEntry {
  current_stage: string  // stage id | "coding" | "excluded"
  manual: boolean
  stages: Record<string, Record<string, string | string[]> & { overall?: string }>
}

export interface TranscriptSegment {
  id: string
  code_id: string
  start: number
  end: number
  text: string
  note: string
  coder: string
  created_at: string
}

export interface Transcript {
  id: string
  title: string
  source: string
  content: string
  segments: TranscriptSegment[]
  created_at: string
}

export interface Codebook {
  id: string
  title: string
  description: string
  papers: string[]
  criteria: CodebookCriterion[]
  stages?: CodebookStage[]
  assignments: Record<string, string>
  screening: Record<string, any>
  codes: CodebookCode[]
  excerpts: CodebookExcerpt[]
  created_at: string
}

"use client"
import type { CSSProperties, ReactNode } from "react"
import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  AtSign, CalendarClock, Check, CheckSquare, ChevronDown, ChevronLeft, ChevronRight, Crown,
  Database, ExternalLink, FileText, Folder, GripVertical, HelpCircle, Mail, Pencil, Plus,
  RefreshCw, Settings, Shield, Square, Trash2, UserPlus, X,
} from "lucide-react"
import { api } from "@/lib/api"
import type { Contact, Document, Meeting, Project, ProjectMember } from "@/lib/types"

// ── Types ──────────────────────────────────────────────────────────────────────
interface GanttItem { id: string; title: string; start: string; end: string; doc_id?: string; doc_ids?: string[]; mentions?: string[]; note?: string }
interface GanttTrack { id: string; name: string; color: string; items: GanttItem[] }
interface GanttMilestone { id: string; title: string; date: string; color: string }
interface GanttData { tracks: GanttTrack[]; milestones: GanttMilestone[] }
interface TimelineEditor { mode: "create" | "edit"; trackId: string; itemId?: string; title: string; start: string; end: string; doc_ids: string[]; mentions: string[]; note: string; x: number; y: number }
interface HoveredTimelineItem { item: GanttItem; track: GanttTrack; x: number; y: number }
interface ResizeDrag { trackId: string; itemId: string; edge: "start" | "end"; clientX: number; originalStart: string; originalEnd: string; currentStart: string; currentEnd: string }
interface DocOption { id: string; title: string; path: string; search: string; folder?: string; source?: "docs" | "meeting"; meetingId?: string }
interface DocTreeNode { type: "dir" | "doc"; name: string; path: string; doc?: DocOption; children?: DocTreeNode[] }
interface PersonOption { value: string; label: string; search: string }
interface DriveRootResponse { configured: boolean; settings_path: string; root_folder_id: string; root_folder_name: string; root_folder_link: string; source: string }
interface BatchDriveSyncResponse { ok: boolean; root: { root_folder_name: string; root_folder_link: string }; docs?: { synced: number; failed?: number } | null; meetings?: { synced: number; failed?: number } | null }
interface ZoteroConfig { api_key: string; library_id: string; library_type: "user" | "group"; api_key_set?: boolean }
interface HomeSettings { countdown_title: string; countdown_target: string }
interface TodoItem { id: string; text: string; mentions: string[]; doc_ids: string[]; completed: boolean; order: number; is_mine?: boolean; due_at?: string }
interface TodoList { id: string; title: string; week_start: string; meeting_id?: string; doc_ids?: string[]; due_at?: string; order: number; items: TodoItem[]; is_mine?: boolean; created_at?: string }
interface TodoItemForm { text: string; mentions: string[]; doc_ids: string[] }

// ── Zotero Help Popover ────────────────────────────────────────────────────────

function ZoteroHelpPopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="p-0.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100"
        title="How to configure Zotero"
      >
        <HelpCircle size={14} />
      </button>

      {open && (
        <div className="absolute left-0 top-6 z-50 w-80 rounded-xl border bg-white shadow-xl text-xs text-gray-700 p-4 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-sm">Zotero Setup Guide</p>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-black shrink-0"><X size={13} /></button>
          </div>

          {/* Library type decision */}
          <div className="space-y-2">
            <p className="font-medium text-gray-800">Which Library Type?</p>
            <div className="rounded-lg border border-gray-100 bg-gray-50 divide-y divide-gray-100">
              <div className="px-3 py-2">
                <p className="font-medium text-gray-800">User (Personal)</p>
                <p className="text-gray-500 mt-0.5">Use when the library belongs to you alone. Syncs your personal Zotero account.</p>
                <p className="mt-1 text-gray-500">
                  Library ID = your <span className="font-medium">User ID</span>.{" "}
                  Find it at{" "}
                  <a href="https://www.zotero.org/settings/keys" target="_blank" rel="noreferrer"
                    className="text-blue-600 underline">zotero.org/settings/keys</a>
                  {" "}→ scroll to <em>"Your userID for use in API calls"</em>.
                </p>
              </div>
              <div className="px-3 py-2">
                <p className="font-medium text-gray-800">Group (Shared)</p>
                <p className="text-gray-500 mt-0.5">Use for team or lab shared Zotero Group libraries. Recommended for multi-person projects.</p>
                <p className="mt-1 text-gray-500">
                  Library ID = <span className="font-medium">Group ID</span>.{" "}
                  Open your group at{" "}
                  <a href="https://www.zotero.org/groups/" target="_blank" rel="noreferrer"
                    className="text-blue-600 underline">zotero.org/groups</a>
                  {" "}— the number in the URL is the Group ID:{" "}
                  <code className="bg-gray-100 px-1 rounded">zotero.org/groups/&#x3C;GROUP_ID&#x3E;</code>
                </p>
              </div>
            </div>
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <p className="font-medium text-gray-800">API Key</p>
            <ol className="list-decimal pl-4 space-y-1 text-gray-500">
              <li>Go to <a href="https://www.zotero.org/settings/keys/new" target="_blank" rel="noreferrer" className="text-blue-600 underline">zotero.org/settings/keys/new</a></li>
              <li>Check <strong>Allow library access</strong> (read-only is enough)</li>
              <li>For Group libraries: also check <strong>All Groups — Read Only</strong></li>
              <li>Click Save and copy the key</li>
            </ol>
            <p className="text-gray-400">The key is stored encrypted server-side and never shown again.</p>
          </div>

          {/* Storage note */}
          <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-amber-800">
            <p className="font-medium">Storage note</p>
            <p className="mt-0.5">Only metadata and abstracts are synced — not PDF files. Zotero storage quota does not apply here.</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const DAY_MS = 24 * 60 * 60 * 1000
function toMs(iso: string) { return new Date(`${iso}T00:00:00`).getTime() }
function formatDate(ms: number) { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}` }
function addDays(iso: string, days: number) { return formatDate(toMs(iso) + days * DAY_MS) }
function addMonths(date: Date, months: number) { return new Date(date.getFullYear(), date.getMonth() + months, date.getDate()) }
function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)) }
function normalizeDocIds(item: GanttItem) { return Array.from(new Set([...(item.doc_ids ?? []), item.doc_id ?? ""].filter(Boolean))) }
function monthsBetween(start: Date, end: Date) {
  const months: { label: string; year: number; month: number }[] = []
  const d = new Date(start.getFullYear(), start.getMonth(), 1)
  while (d <= end) { months.push({ label: d.toLocaleString("default", { month: "short", year: "2-digit" }), year: d.getFullYear(), month: d.getMonth() }); d.setMonth(d.getMonth() + 1) }
  return months
}
function docPath(doc: Document) { return doc._path || `document/docs/${doc.id}.md` }
function docTitleFromPath(path: string) { return path.split("/").pop()?.replace(/\.md$/, "") || path }
function docDisplay(option: DocOption) { return option.title }
function buildDocOptions(docs: Document[], meetings: Meeting[] = []): DocOption[] {
  const regular = docs.map(doc => {
    const path = docPath(doc)
    const title = doc.title || docTitleFromPath(path)
    return { id: doc.id, title, path, search: `${doc.folder || ""} ${title}`.toLowerCase(), folder: doc.folder, source: "docs" as const }
  })
  const meetingDocs = meetings.flatMap(m => (m.tabs || []).map(tab => ({
    id: `meeting:${m.id}:${tab.id}`,
    title: `${m.title} / ${tab.title}`,
    path: `meeting:${m.id}/${tab.id}`,
    search: `${m.title} ${tab.title} ${m.date}`.toLowerCase(),
    folder: "Meetings",
    source: "meeting" as const,
    meetingId: m.id,
  })))
  return [...regular, ...meetingDocs].sort((a,b)=>a.title.localeCompare(b.title))
}
function buildDocTree(options: DocOption[]) {
  // Group by the `folder` metadata field, not by filesystem path
  const dirs: Record<string, DocTreeNode> = {}
  const result: DocTreeNode[] = []
  const ungrouped: DocTreeNode[] = []
  for (const opt of options) {
    const leaf: DocTreeNode = { type:"doc", name: opt.title, path: opt.path, doc: opt }
    if (opt.folder) {
      if (!dirs[opt.folder]) {
        dirs[opt.folder] = { type:"dir", name: opt.folder, path: `folder:${opt.folder}`, children:[] }
        result.push(dirs[opt.folder])
      }
      dirs[opt.folder].children!.push(leaf)
    } else {
      ungrouped.push(leaf)
    }
  }
  result.sort((a,b)=>a.name.localeCompare(b.name))
  return [...ungrouped, ...result]
}
const TRACK_COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#06b6d4"]
const ROLE_LABELS: Record<ProjectMember["role"],string> = { admin:"Admin", member:"Can edit", viewer:"Read only" }
function roleDescription(r: ProjectMember["role"]) { return r==="admin"?"Manage members and edit everything":r==="member"?"Edit project content":"View project content" }
function currentWeekStart() { const d=new Date(); const day=(d.getDay()+6)%7; d.setDate(d.getDate()-day); return d.toISOString().split("T")[0] }
function daysUntil(value?: string) {
  if (!value) return ""
  const target = new Date(value).getTime()
  if (Number.isNaN(target)) return ""
  const days = Math.ceil((target - Date.now()) / DAY_MS)
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return "due today"
  return `${days}d left`
}

// ── Flip-clock digit (white card, black text) ────────────────────────────────────
function FlipUnit({ value, label }: { value: number; label: string }) {
  const str = String(value).padStart(2, "0")
  const [curr, setCurr] = useState(str)
  const [prev, setPrev] = useState(str)
  const [phase, setPhase] = useState<"idle"|"out"|"in">("idle")
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    if (str === curr) return
    timers.current.forEach(clearTimeout); timers.current = []
    setPrev(curr); setPhase("out")
    timers.current.push(setTimeout(() => {
      setCurr(str); setPhase("in")
      timers.current.push(setTimeout(() => setPhase("idle"), 240))
    }, 210))
    return () => { timers.current.forEach(clearTimeout) }
  }, [str])

  const CARD_W = 76, CARD_H = 96
  const cardBase: CSSProperties = {
    position: "absolute", inset: 0, width: CARD_W, height: CARD_H,
    background: "#fff",
    borderRadius: 14,
    border: "1px solid #e5e7eb",
    boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.05)",
    display: "flex", alignItems: "center", justifyContent: "center",
    transformOrigin: "center center",
  }
  const numStyle: CSSProperties = {
    fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Mono', monospace",
    fontSize: 46, fontWeight: 800, lineHeight: 1,
    color: "#0f172a", letterSpacing: "-0.03em",
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div style={{ width: CARD_W, height: CARD_H, position: "relative" }}>
        {/* Static card — always shows curr */}
        <div style={cardBase}><span style={numStyle}>{curr}</span></div>
        {/* Out: prev folds away 0° → -90° */}
        {phase === "out" && (
          <div style={{ ...cardBase, animation: "rbFlipOut 210ms ease-in forwards" }}>
            <span style={numStyle}>{prev}</span>
          </div>
        )}
        {/* In: curr unfolds 90° → 0° */}
        {phase === "in" && (
          <div style={{ ...cardBase, animation: "rbFlipIn 240ms ease-out forwards" }}>
            <span style={numStyle}>{curr}</span>
          </div>
        )}
        {/* Centre crease line */}
        <div style={{ position:"absolute", left:0, right:0, top:"50%", height:1, background:"#f1f5f9", zIndex:10, pointerEvents:"none" }} />
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{label}</span>
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const { id: projectId } = useParams<{ id: string }>()
  const router = useRouter()

  // Core data
  const [gantt, setGantt] = useState<GanttData>({ tracks: [], milestones: [] })
  const [project, setProject] = useState<Project | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [docs, setDocs] = useState<Document[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)

  // Project name editing
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState("")
  const [nameBusy, setNameBusy] = useState(false)

  // Countdown editing
  const [homeSettings, setHomeSettings] = useState<HomeSettings>({ countdown_title: "", countdown_target: "" })
  const [editingCountdown, setEditingCountdown] = useState(false)
  const [countdownForm, setCountdownForm] = useState<HomeSettings>({ countdown_title: "", countdown_target: "" })
  const [countdownBusy, setCountdownBusy] = useState(false)
  const [nowTick, setNowTick] = useState(() => Date.now())

  // Project settings (collapsible)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsMsg, setSettingsMsg] = useState("")
  const [settingsError, setSettingsError] = useState("")
  const [driveConnected, setDriveConnected] = useState<boolean | null>(null)
  const [driveRoot, setDriveRoot] = useState<DriveRootResponse | null>(null)
  const [driveMode, setDriveMode] = useState<"default"|"existing"|"new">("default")
  const [folderUrl, setFolderUrl] = useState("")
  const [folderName, setFolderName] = useState("")
  const [parentFolderUrl, setParentFolderUrl] = useState("")
  const [syncScope, setSyncScope] = useState<"all"|"docs"|"meetings">("all")
  const [syncMode, setSyncMode] = useState<"mapped"|"new">("mapped")
  const [syncResult, setSyncResult] = useState<BatchDriveSyncResponse | null>(null)
  const [zoteroConfig, setZoteroConfig] = useState<ZoteroConfig>({ api_key: "", library_id: "", library_type: "user" })
  const [settingsBusy, setSettingsBusy] = useState<""|"drive"|"sync"|"zotero">("")

  // Timeline state
  const [addTrack, setAddTrack] = useState(false)
  const [trackName, setTrackName] = useState("")
  const [trackColor, setTrackColor] = useState(TRACK_COLORS[0])
  const [monthWidth, setMonthWidth] = useState(112)
  const [timelineEditor, setTimelineEditor] = useState<TimelineEditor | null>(null)
  const [hoveredItem, setHoveredItem] = useState<HoveredTimelineItem | null>(null)
  const [draggingItem, setDraggingItem] = useState<string | null>(null)
  const [docQuery, setDocQuery] = useState("")
  const [showTimelineDocPicker, setShowTimelineDocPicker] = useState(false)
  const [personQuery, setPersonQuery] = useState("")
  const [expandedDocDirs, setExpandedDocDirs] = useState<Set<string>>(new Set())

  // TODO state
  const [todoLists, setTodoLists] = useState<TodoList[]>([])
  const [todoWeek, setTodoWeek] = useState(currentWeekStart())
  const [todoHistoryOpen, setTodoHistoryOpen] = useState(false)
  const [listFormOpen, setListFormOpen] = useState(false)
  const [newListTitle, setNewListTitle] = useState("")
  const [newListMeetingId, setNewListMeetingId] = useState("")
  const [newListDueAt, setNewListDueAt] = useState("")
  const [activeListIdx, setActiveListIdx] = useState(0)
  const [dragListId, setDragListId] = useState<string | null>(null)
  const [dragItem, setDragItem] = useState<{ listId: string; itemId: string } | null>(null)
  const [itemForms, setItemForms] = useState<Record<string, TodoItemForm>>({})
  const [newItemDueForms, setNewItemDueForms] = useState<Record<string, string>>({})
  const [editingTodoListId, setEditingTodoListId] = useState<string | null>(null)
  const [todoListTitleDraft, setTodoListTitleDraft] = useState("")
  const [editingTodoItem, setEditingTodoItem] = useState<{ listId: string; itemId: string } | null>(null)
  const [todoItemTextDraft, setTodoItemTextDraft] = useState("")
  const [peoplePickerListId, setPeoplePickerListId] = useState<string | null>(null)
  const [docPickerListId, setDocPickerListId] = useState<string | null>(null)
  const [todoDocQuery, setTodoDocQuery] = useState("")

  // Team state
  const [addingMember, setAddingMember] = useState(false)
  const [memberForm, setMemberForm] = useState<{ email: string; role: ProjectMember["role"] }>({ email: "", role: "member" })
  const [teamMsg, setTeamMsg] = useState("")

  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<ResizeDrag | null>(null)
  const initializedTimelineRef = useRef(false)
  const skipTodoEditBlurRef = useRef(false)

  // ── Load ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    initializedTimelineRef.current = false
    Promise.all([
      api.get<Project>(`/api/projects/${projectId}`),
      api.get<GanttData>(`/api/projects/${projectId}/gantt`),
      api.get<Contact[]>(`/api/projects/${projectId}/contacts`).catch(() => [] as Contact[]),
      api.get<ProjectMember[]>(`/api/projects/${projectId}/members`).catch(() => [] as ProjectMember[]),
      api.get<Document[]>(`/api/projects/${projectId}/docs`).catch(() => [] as Document[]),
      api.get<{ meetings: Meeting[] }>(`/api/projects/${projectId}/meetings`).catch(() => ({ meetings: [] })),
      api.get<{ week_start: string; lists: TodoList[] }>(`/api/projects/${projectId}/todos`).catch(() => ({ week_start: currentWeekStart(), lists: [] })),
      api.get<{ connected: boolean }>("/api/auth/google-drive/status").catch(() => ({ connected: false })),
      api.get<DriveRootResponse>(`/api/projects/${projectId}/drive-root`).catch(() => null),
      api.get<ZoteroConfig>(`/api/projects/${projectId}/zotero`).catch(() => null),
      api.get<HomeSettings>(`/api/projects/${projectId}/home-settings`).catch(() => ({ countdown_title: "", countdown_target: "" })),
    ]).then(([p, g, c, m, d, mtg, td, drive, root, zotero, home]) => {
      setProject(p); setNameInput(p.name); setGantt(g); setContacts(c); setMembers(m); setDocs(d); setMeetings(mtg.meetings); setTodoLists(td.lists); setTodoWeek(td.week_start)
      setDriveConnected(drive.connected); setDriveRoot(root)
      if (root?.root_folder_name) setFolderName(root.root_folder_name)
      if (zotero) setZoteroConfig({ api_key: "", library_id: zotero.library_id || "", library_type: zotero.library_type || "user", api_key_set: zotero.api_key_set })
      setHomeSettings(home); setCountdownForm(home)
    }).finally(() => setLoading(false))
  }, [projectId])

  // Tick every second for countdown
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  // ── Derived countdown values ───────────────────────────────────────────────────
  const countdownMs = homeSettings.countdown_target ? new Date(homeSettings.countdown_target).getTime() - nowTick : 0
  const countdownPast = !!homeSettings.countdown_target && countdownMs <= 0
  const cdDays    = Math.max(0, Math.floor(countdownMs / DAY_MS))
  const cdHours   = Math.max(0, Math.floor((countdownMs % DAY_MS) / 3_600_000))
  const cdMinutes = Math.max(0, Math.floor((countdownMs % 3_600_000) / 60_000))
  const cdSeconds = Math.max(0, Math.floor((countdownMs % 60_000) / 1000))

  // ── Permissions ────────────────────────────────────────────────────────────────
  const isAdmin   = project?.role === "admin"
  const canEdit   = isAdmin || project?.role === "member"

  // ── Project name ──────────────────────────────────────────────────────────────
  async function saveName(e: React.FormEvent) {
    e.preventDefault(); setNameBusy(true)
    try {
      const updated = await api.patch<Project>(`/api/projects/${projectId}`, { name: nameInput })
      setProject(updated); setNameInput(updated.name); setEditingName(false)
    } finally { setNameBusy(false) }
  }

  // ── Countdown ─────────────────────────────────────────────────────────────────
  async function saveCountdown(e: React.FormEvent) {
    e.preventDefault(); setCountdownBusy(true)
    try {
      const saved = await api.put<HomeSettings>(`/api/projects/${projectId}/home-settings`, countdownForm)
      setHomeSettings(saved); setCountdownForm(saved); setEditingCountdown(false)
    } finally { setCountdownBusy(false) }
  }

  // ── Project integrations ──────────────────────────────────────────────────────
  function showMsg(text: string) { setSettingsError(""); setSettingsMsg(text) }
  function showErr(err: unknown, fb: string) { setSettingsMsg(""); setSettingsError(err instanceof Error ? err.message : fb) }

  async function saveDriveRoot() {
    setSettingsBusy("drive")
    try {
      const root = await api.put<DriveRootResponse>(`/api/projects/${projectId}/drive-root`, { mode: driveMode, folder_url: folderUrl, folder_name: folderName, parent_folder_url: parentFolderUrl })
      setDriveRoot({ ...root, configured: !!root.root_folder_id }); setFolderUrl(""); setParentFolderUrl(""); setSyncResult(null)
      showMsg("Google Drive folder saved.")
    } catch (err) { showErr(err, "Could not save Drive folder") } finally { setSettingsBusy("") }
  }

  async function syncProjectDrive() {
    setSettingsBusy("sync")
    try {
      const result = await api.post<BatchDriveSyncResponse>(`/api/projects/${projectId}/drive/sync`, { scope: syncScope, mode: syncMode })
      setSyncResult(result); showMsg("Sync finished.")
    } catch (err) { showErr(err, "Sync failed") } finally { setSettingsBusy("") }
  }

  async function saveZotero(e: React.FormEvent) {
    e.preventDefault(); setSettingsBusy("zotero")
    try {
      await api.put(`/api/projects/${projectId}/zotero`, { api_key: zoteroConfig.api_key || undefined, library_id: zoteroConfig.library_id, library_type: zoteroConfig.library_type })
      setZoteroConfig(c => ({ ...c, api_key: "", api_key_set: true })); showMsg("Zotero settings saved.")
    } catch (err) { showErr(err, "Could not save Zotero") } finally { setSettingsBusy("") }
  }

  // ── Timeline helpers ──────────────────────────────────────────────────────────
  const allDates = [...gantt.tracks.flatMap(t => t.items.flatMap(i => [i.start, i.end])), ...gantt.milestones.map(m => m.date)].filter(Boolean)
  const now = new Date()
  const projectStart = project?.created_at ? new Date(project.created_at) : now
  const baseStart = new Date(projectStart.getFullYear() - 1, projectStart.getMonth(), 1)
  const baseEnd   = new Date(projectStart.getFullYear() + 1, projectStart.getMonth() + 1, 1)
  const itemMin   = allDates.length ? new Date(Math.min(...allDates.map(toMs))) : baseStart
  const itemMax   = allDates.length ? new Date(Math.max(...allDates.map(toMs))) : baseEnd
  const viewStart = new Date(Math.min(baseStart.getTime(), addMonths(itemMin, -1).getTime()))
  const viewEnd   = new Date(Math.max(baseEnd.getTime(), addMonths(itemMax, 1).getTime()))
  const totalMs   = viewEnd.getTime() - viewStart.getTime()
  const months    = monthsBetween(viewStart, viewEnd)
  const totalWidth = months.length * monthWidth
  function xForDate(iso: string) { return ((toMs(iso) - viewStart.getTime()) / totalMs) * totalWidth }
  function dateForX(x: number) { return formatDate(viewStart.getTime() + clamp(x/Math.max(1,totalWidth),0,1)*totalMs) }

  useEffect(() => {
    if (loading || initializedTimelineRef.current || !scrollRef.current || months.length === 0) return
    const viewport = scrollRef.current
    const targetMonthWidth = clamp(viewport.clientWidth / 6, 82, 220)
    const nextTotalWidth = months.length * targetMonthWidth
    const targetDate = new Date(clamp(addMonths(now,-5).getTime(), viewStart.getTime(), viewEnd.getTime()))
    const targetX = ((targetDate.getTime() - viewStart.getTime()) / Math.max(1, totalMs)) * nextTotalWidth
    initializedTimelineRef.current = true; setMonthWidth(targetMonthWidth)
    window.requestAnimationFrame(() => { viewport.scrollLeft = clamp(targetX, 0, Math.max(0, nextTotalWidth - viewport.clientWidth)) })
  }, [loading, months.length, projectId])

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const drag = dragRef.current; if (!drag) return
      const dayWidth = Math.max(1, totalWidth / Math.max(1, Math.round(totalMs / DAY_MS)))
      const deltaDays = Math.round((e.clientX - drag.clientX) / dayWidth)
      let start = drag.originalStart, end = drag.originalEnd
      if (drag.edge === "start") { start = addDays(drag.originalStart, deltaDays); if (toMs(start) > toMs(end) - DAY_MS) start = addDays(end, -1) }
      else { end = addDays(drag.originalEnd, deltaDays); if (toMs(end) < toMs(start) + DAY_MS) end = addDays(start, 1) }
      drag.currentStart = start; drag.currentEnd = end
      if (drag.itemId === "__draft__") { setTimelineEditor(ed => ed ? { ...ed, start, end } : ed); return }
      setGantt(g => ({ ...g, tracks: g.tracks.map(t => t.id===drag.trackId ? { ...t, items: t.items.map(i => i.id===drag.itemId ? { ...i, start, end } : i) } : t) }))
    }
    async function onUp() {
      const drag = dragRef.current; if (!drag) return
      dragRef.current = null; setDraggingItem(null)
      if (drag.itemId === "__draft__" || (drag.currentStart===drag.originalStart && drag.currentEnd===drag.originalEnd)) return
      try { await api.patch(`/api/projects/${projectId}/gantt/tracks/${drag.trackId}/items/${drag.itemId}`, { start: drag.currentStart, end: drag.currentEnd }) }
      catch { setGantt(g => ({ ...g, tracks: g.tracks.map(t => t.id===drag.trackId ? { ...t, items: t.items.map(i => i.id===drag.itemId ? { ...i, start:drag.originalStart, end:drag.originalEnd } : i) } : t) })) }
    }
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp)
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp) }
  }, [projectId, totalMs, totalWidth])

  async function createTrack(e: React.FormEvent) {
    e.preventDefault()
    const track = await api.post<GanttTrack>(`/api/projects/${projectId}/gantt/tracks`, { name: trackName, color: trackColor, items: [] })
    setGantt(g => ({ ...g, tracks: [...g.tracks, track] })); setTrackName(""); setAddTrack(false)
  }
  async function deleteTrack(trackId: string) {
    if (!confirm("Delete this track and all its items?")) return
    await api.delete(`/api/projects/${projectId}/gantt/tracks/${trackId}`)
    setGantt(g => ({ ...g, tracks: g.tracks.filter(t => t.id !== trackId) }))
  }
  function openCreateItem(trackId: string, date: string, x: number, y: number) { setHoveredItem(null); setDocQuery(""); setShowTimelineDocPicker(false); setPersonQuery(""); setTimelineEditor({ mode:"create", trackId, title:"", start:date, end:addDays(date,7), doc_ids:[], mentions:[], note:"", x, y }) }
  function openEditItem(track: GanttTrack, item: GanttItem, x: number, y: number) { setHoveredItem(null); setDocQuery(""); setShowTimelineDocPicker(false); setPersonQuery(""); setTimelineEditor({ mode:"edit", trackId:track.id, itemId:item.id, title:item.title, start:item.start, end:item.end, doc_ids:normalizeDocIds(item), mentions:item.mentions??[], note:item.note??"", x, y }) }
  function addEditorDoc(docId: string) { setTimelineEditor(ed => ed && !ed.doc_ids.includes(docId) ? { ...ed, doc_ids:[...ed.doc_ids, docId] } : ed); setDocQuery(""); setShowTimelineDocPicker(false) }
  function removeEditorDoc(docId: string) { setTimelineEditor(ed => ed ? { ...ed, doc_ids: ed.doc_ids.filter(id => id!==docId) } : ed) }
  function addEditorPerson(value: string) { setTimelineEditor(ed => ed && !ed.mentions.includes(value) ? { ...ed, mentions:[...ed.mentions, value] } : ed); setPersonQuery("") }
  function removeEditorPerson(value: string) { setTimelineEditor(ed => ed ? { ...ed, mentions: ed.mentions.filter(m => m!==value) } : ed) }
  const docOptions = buildDocOptions(docs, meetings)
  const docTree = buildDocTree(docOptions)
  const docById = new Map(docOptions.map(d => [d.id, d]))
  const addFirstMatchingDoc = () => { const q=docQuery.trim().toLowerCase(); if(!q) return; const m=docOptions.find(d=>d.search.includes(q)); if(m) addEditorDoc(m.id) }
  const addFirstMatchingPerson = () => { const q=personQuery.trim().toLowerCase(); if(!q) return; const m=peopleOptions.find(p=>p.search.includes(q)); if(m) addEditorPerson(m.value) }

  async function saveTimelineItem(e: React.FormEvent) {
    e.preventDefault(); if (!timelineEditor) return
    const start = timelineEditor.start<=timelineEditor.end ? timelineEditor.start : timelineEditor.end
    const end   = timelineEditor.end  >=timelineEditor.start ? timelineEditor.end   : timelineEditor.start
    const payload = { title: timelineEditor.title.trim()||"Untitled", start, end, doc_id: timelineEditor.doc_ids[0]??"", doc_ids: timelineEditor.doc_ids, mentions: timelineEditor.mentions.map(s=>s.trim().replace(/^@/,"")).filter(Boolean), note: timelineEditor.note }
    if (timelineEditor.mode==="edit" && timelineEditor.itemId) {
      const updated = await api.patch<GanttItem>(`/api/projects/${projectId}/gantt/tracks/${timelineEditor.trackId}/items/${timelineEditor.itemId}`, payload)
      setGantt(g => ({ ...g, tracks: g.tracks.map(t => t.id===timelineEditor.trackId ? { ...t, items: t.items.map(i => i.id===timelineEditor.itemId ? updated : i) } : t) }))
    } else {
      const item = await api.post<GanttItem>(`/api/projects/${projectId}/gantt/tracks/${timelineEditor.trackId}/items`, payload)
      setGantt(g => ({ ...g, tracks: g.tracks.map(t => t.id===timelineEditor.trackId ? { ...t, items:[...t.items, item] } : t) }))
    }
    setTimelineEditor(null)
  }
  async function deleteItem(trackId: string, itemId: string) {
    await api.delete(`/api/projects/${projectId}/gantt/tracks/${trackId}/items/${itemId}`)
    setGantt(g => ({ ...g, tracks: g.tracks.map(t => t.id===trackId ? { ...t, items: t.items.filter(i=>i.id!==itemId) } : t) }))
    if (timelineEditor?.itemId===itemId) setTimelineEditor(null)
  }

  const blankItemForm: TodoItemForm = { text:"", mentions:[], doc_ids:[] }

  function updateItemForm(listId: string, patch: Partial<TodoItemForm>) {
    setItemForms(prev => ({ ...prev, [listId]: { ...(prev[listId] ?? blankItemForm), ...patch } }))
  }

  async function loadTodos(week = todoWeek, includeHistory = todoHistoryOpen) {
    const res = await api.get<{ week_start: string; lists: TodoList[] }>(`/api/projects/${projectId}/todos?week_start=${encodeURIComponent(week)}&include_history=${includeHistory}`)
    setTodoWeek(res.week_start)
    setTodoLists(res.lists)
  }

  async function createTodoList(e: React.FormEvent) {
    e.preventDefault()
    const list = await api.post<TodoList>(`/api/projects/${projectId}/todos`, {
      title: newListTitle,
      week_start: todoWeek,
      meeting_id: newListMeetingId,
      due_at: newListDueAt,
    })
    setTodoLists(prev => [...prev, list])
    setNewListTitle("")
    setNewListMeetingId("")
    setNewListDueAt("")
    setListFormOpen(false)
    setActiveListIdx(0)
  }

  async function createTodoItem(listId: string, e: React.FormEvent) {
    e.preventDefault()
    const form = itemForms[listId] ?? blankItemForm
    // Auto-extract @mentions embedded in text
    const textMentions = (form.text.match(/@([\w.-]+)/g) || []).map(m => m.slice(1))
    const allMentions = [...new Set([...form.mentions, ...textMentions])]
    const item = await api.post<TodoItem>(`/api/projects/${projectId}/todos/${listId}/items`, {
      text: form.text,
      mentions: allMentions,
      doc_ids: form.doc_ids,
      due_at: newItemDueForms[listId] || "",
    })
    setTodoLists(prev => prev.map(list => list.id === listId ? { ...list, items: [...list.items, item], is_mine: list.is_mine || item.is_mine } : list))
    setItemForms(prev => ({ ...prev, [listId]: blankItemForm }))
    setNewItemDueForms(prev => ({ ...prev, [listId]: "" }))
  }

  async function patchTodoList(listId: string, patch: Partial<TodoList>) {
    const updated = await api.patch<TodoList>(`/api/projects/${projectId}/todos/${listId}`, patch)
    setTodoLists(prev => prev.map(list => list.id === listId ? updated : list))
  }

  function openTodoListTitleEditor(list: TodoList) {
    if (!canEdit) return
    setEditingTodoItem(null)
    setEditingTodoListId(list.id)
    setTodoListTitleDraft(list.title)
  }

  function cancelTodoListTitleEditor() {
    skipTodoEditBlurRef.current = true
    setEditingTodoListId(null)
    setTodoListTitleDraft("")
  }

  async function saveTodoListTitle(listId: string) {
    if (editingTodoListId !== listId) return
    const title = todoListTitleDraft.trim() || "Untitled TODO"
    setEditingTodoListId(null)
    setTodoListTitleDraft("")
    await patchTodoList(listId, { title })
  }

  function toggleTodoPerson(listId: string, value: string) {
    const form = itemForms[listId] ?? blankItemForm
    const next = form.mentions.includes(value) ? form.mentions.filter(v => v !== value) : [...form.mentions, value]
    updateItemForm(listId, { mentions: next })
  }

  function insertTodoDoc(listId: string, doc: DocOption) {
    const form = itemForms[listId] ?? blankItemForm
    const text = form.text.replace(/\{\{[^{}]*$/, "") + `{{${doc.title}}}`
    const doc_ids = form.doc_ids.includes(doc.id) ? form.doc_ids : [...form.doc_ids, doc.id]
    updateItemForm(listId, { text, doc_ids })
    setTodoDocQuery("")
    setDocPickerListId(null)
  }

  async function patchTodoItem(listId: string, itemId: string, patch: Partial<TodoItem>) {
    const updated = await api.patch<TodoItem>(`/api/projects/${projectId}/todos/${listId}/items/${itemId}`, patch)
    setTodoLists(prev => prev.map(list => list.id === listId
      ? { ...list, items: list.items.map(item => item.id === itemId ? updated : item), is_mine: list.items.some(item => item.id === itemId ? updated.is_mine : item.is_mine) }
      : list))
  }

  function openTodoItemTextEditor(listId: string, item: TodoItem) {
    if (!canEdit) return
    setEditingTodoListId(null)
    setEditingTodoItem({ listId, itemId: item.id })
    setTodoItemTextDraft(item.text)
  }

  function cancelTodoItemTextEditor() {
    skipTodoEditBlurRef.current = true
    setEditingTodoItem(null)
    setTodoItemTextDraft("")
  }

  async function saveTodoItemText(listId: string, item: TodoItem) {
    if (editingTodoItem?.listId !== listId || editingTodoItem.itemId !== item.id) return
    const text = todoItemTextDraft.trim() || "Untitled TODO"
    const textMentions = (text.match(/@([\w.-]+)/g) || []).map(m => m.slice(1))
    const textDocIds = (text.match(/\{\{([^{}]+)\}\}/g) || [])
      .map(m => m.slice(2, -2))
      .map(title => [...docById.values()].find(d => d.title === title)?.id)
      .filter(Boolean) as string[]
    setEditingTodoItem(null)
    setTodoItemTextDraft("")
    await patchTodoItem(listId, item.id, {
      text,
      mentions: [...new Set([...item.mentions, ...textMentions])],
      doc_ids: [...new Set([...item.doc_ids, ...textDocIds])],
    })
  }

  async function deleteTodoItem(listId: string, itemId: string) {
    await api.delete(`/api/projects/${projectId}/todos/${listId}/items/${itemId}`)
    setTodoLists(prev => prev.map(list => list.id === listId ? { ...list, items: list.items.filter(item => item.id !== itemId) } : list))
  }

  async function deleteTodoList(listId: string) {
    await api.delete(`/api/projects/${projectId}/todos/${listId}`)
    setTodoLists(prev => prev.filter(list => list.id !== listId))
  }

  async function reorderTodoList(targetId: string) {
    if (!dragListId || dragListId === targetId) return
    const next = [...todoLists]
    const from = next.findIndex(t => t.id === dragListId)
    const to = next.findIndex(t => t.id === targetId)
    if (from < 0 || to < 0) return
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    const ordered = next.map((t, i) => ({ ...t, order: i }))
    setTodoLists(ordered)
    setDragListId(null)
    await api.post(`/api/projects/${projectId}/todos/reorder`, { ids: ordered.map(t => t.id) })
  }

  async function reorderTodoItem(listId: string, targetId: string) {
    if (!dragItem || dragItem.listId !== listId || dragItem.itemId === targetId) return
    const list = todoLists.find(t => t.id === listId)
    if (!list) return
    const next = [...list.items]
    const from = next.findIndex(t => t.id === dragItem.itemId)
    const to = next.findIndex(t => t.id === targetId)
    if (from < 0 || to < 0) return
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    const ordered = next.map((t, i) => ({ ...t, order: i }))
    setTodoLists(prev => prev.map(t => t.id === listId ? { ...t, items: ordered } : t))
    setDragItem(null)
    await api.post(`/api/projects/${projectId}/todos/${listId}/items/reorder`, { ids: ordered.map(t => t.id) })
  }
  function handleTimelineWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (!scrollRef.current) return; e.preventDefault()
    const vp = scrollRef.current; const rect = vp.getBoundingClientRect()
    const px = e.clientX-rect.left+vp.scrollLeft; const ratio = px/Math.max(1,totalWidth)
    const next = clamp(monthWidth*(e.deltaY>0?0.88:1.12),58,260); const nextTotal = months.length*next
    setMonthWidth(next); window.requestAnimationFrame(() => { vp.scrollLeft = clamp(ratio*nextTotal-(e.clientX-rect.left),0,Math.max(0,nextTotal-rect.width)) })
  }
  function startResize(e: React.MouseEvent, trackId: string, item: GanttItem, edge: "start"|"end") {
    e.preventDefault(); e.stopPropagation()
    dragRef.current = { trackId, itemId:item.id, edge, clientX:e.clientX, originalStart:item.start, originalEnd:item.end, currentStart:item.start, currentEnd:item.end }
    setDraggingItem(item.id)
  }
  function startDraftResize(e: React.MouseEvent, edge: "start"|"end") {
    if (!timelineEditor) return; e.preventDefault(); e.stopPropagation()
    dragRef.current = { trackId:timelineEditor.trackId, itemId:"__draft__", edge, clientX:e.clientX, originalStart:timelineEditor.start, originalEnd:timelineEditor.end, currentStart:timelineEditor.start, currentEnd:timelineEditor.end }
    setDraggingItem("__draft__")
  }

  // ── Team ──────────────────────────────────────────────────────────────────────
  const peopleOptions: PersonOption[] = []; const personLookupEntries: [string,PersonOption][] = []; const seenPeopleKeys = new Set<string>()
  function pushPerson(value: string, label: string, search: string, aliases: string[]) {
    const keys = Array.from(new Set([value,label,...aliases].map(x=>x.trim().toLowerCase()).filter(Boolean)))
    if (!value.trim() || keys.some(k=>seenPeopleKeys.has(k))) { const ex=keys.map(k=>personLookupEntries.find(([a])=>a===k)?.[1]).find(Boolean); if(ex) keys.forEach(k=>personLookupEntries.push([k,ex])); return }
    const opt={value,label,search:search.toLowerCase()}; keys.forEach(k=>{seenPeopleKeys.add(k);personLookupEntries.push([k,opt])}); peopleOptions.push(opt)
  }
  contacts.forEach(c=>pushPerson(c.handle, c.name||c.handle, `${c.name} ${c.handle} ${c.email}`, [c.email,c.handle,c.name]))
  members.filter(m=>m.status==="active").forEach(m=>{ const lbl=m.name||m.email.split("@",1)[0]; pushPerson(m.email,lbl,`${m.name} ${m.email}`,[m.email,lbl]) })
  const personByValue = new Map(personLookupEntries)
  function personLabel(v: string) { const p=personByValue.get(v)||personByValue.get(v.trim().toLowerCase()); return p?.label||v.replace(/^@/,"").split("@",1)[0] }

  async function inviteMember(e: React.FormEvent) {
    e.preventDefault(); setTeamMsg("")
    try {
      const member = await api.post<ProjectMember>(`/api/projects/${projectId}/members`, memberForm)
      setMembers(prev => [...prev.filter(m=>m.id!==member.id&&m.email!==member.email), member])
      setMemberForm({ email:"", role:"member" }); setAddingMember(false)
      setTeamMsg(member.status==="pending"
        ? (member.email_sent ? "Invitation emailed. If they are not registered, the email includes the registration link." : "Invitation saved, but the email could not be sent. They will get access automatically after registering with this email.")
        : (member.email_sent ? "Member added and notified by email." : "Member added, but the email notification could not be sent."))
      api.get<Contact[]>(`/api/projects/${projectId}/contacts`).then(setContacts).catch(()=>{})
    } catch (err: unknown) { setTeamMsg(err instanceof Error ? err.message : "Could not invite member") }
  }
  async function updateMemberRole(member: ProjectMember, role: ProjectMember["role"]) {
    setTeamMsg("")
    try {
      const updated = member.status==="pending"&&member.invite_id
        ? await api.put<ProjectMember>(`/api/projects/${projectId}/invites/${member.invite_id}/role`,{role})
        : await api.put<ProjectMember>(`/api/projects/${projectId}/members/${member.user_id}/role`,{role})
      setMembers(prev=>prev.map(m=>m.id===member.id?updated:m))
      api.get<Contact[]>(`/api/projects/${projectId}/contacts`).then(setContacts).catch(()=>{})
    } catch (err: unknown) { setTeamMsg(err instanceof Error ? err.message : "Could not update member") }
  }
  async function removeProjectMember(member: ProjectMember) {
    if (!confirm(member.status==="pending"?"Cancel this invitation?":`Remove ${member.email}?`)) return
    setTeamMsg("")
    try {
      if (member.status==="pending"&&member.invite_id) await api.delete(`/api/projects/${projectId}/invites/${member.invite_id}`)
      else await api.delete(`/api/projects/${projectId}/members/${member.user_id}`)
      setMembers(prev=>prev.filter(m=>m.id!==member.id))
      api.get<Contact[]>(`/api/projects/${projectId}/contacts`).then(setContacts).catch(()=>{})
    } catch (err: unknown) { setTeamMsg(err instanceof Error ? err.message : "Could not remove member") }
  }

  // ── Floating editor helpers ────────────────────────────────────────────────────
  function floatingStyle(x: number, y: number, w: number, h: number): CSSProperties {
    if (typeof window==="undefined") return { left:x+12, top:y+12 }
    return { left: clamp(x+12,12,window.innerWidth-w-12), top: clamp(y+12,12,window.innerHeight-h-12) }
  }
  function toggleDocDir(path: string) { setExpandedDocDirs(prev=>{ const n=new Set(prev); n.has(path)?n.delete(path):n.add(path); return n }) }
  function renderDocNode(node: DocTreeNode, depth=0): ReactNode {
    if (node.type==="dir") { const open=expandedDocDirs.has(node.path); return (
      <div key={node.path}><button type="button" onClick={()=>toggleDocDir(node.path)} className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-xs text-gray-600 hover:bg-gray-50" style={{paddingLeft:6+depth*14}}><span className="w-3 text-gray-400">{open?"−":"+"}</span><span className="truncate">{node.name}</span></button>{open&&node.children?.map(c=>renderDocNode(c,depth+1))}</div>
    ) }
    const sel=!!timelineEditor?.doc_ids.includes(node.doc!.id)
    return <button key={node.path} type="button" onClick={()=>addEditorDoc(node.doc!.id)} disabled={sel} className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-gray-50 disabled:opacity-45" style={{paddingLeft:6+depth*14}}><span className="min-w-0 truncate text-gray-700">{node.name}</span><span className="shrink-0 text-[10px] text-gray-400">{sel?"Added":"Add"}</span></button>
  }

  // ── Inline text renderer (parses @handle and {{doc title}} tokens) ───────────
  function renderItemText(text: string): React.ReactNode {
    if (!text) return null
    const parts: React.ReactNode[] = []
    const regex = /(@[\w.-]+|\{\{[^{}]+\}\})/g
    let lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
      const token = match[0]
      const key = match.index
      if (token.startsWith("@")) {
        const handle = token.slice(1)
        const p = personByValue.get(handle) || personByValue.get(handle.toLowerCase())
        parts.push(<span key={key} className="inline-flex items-center rounded-full bg-gray-100 px-1.5 text-[10px] font-medium text-gray-600 mx-0.5 align-middle">@{p?.label || handle}</span>)
      } else {
        const title = token.slice(2, -2)
        const doc = [...docById.values()].find(d => d.title === title)
        parts.push(doc
          ? <button key={key} type="button" onClick={() => doc.meetingId ? router.push(`/projects/${projectId}/meetings/${doc.meetingId}`) : router.push(`/projects/${projectId}/docs/${doc.id}`)} className="inline-flex items-center rounded-full bg-emerald-50 px-1.5 text-[10px] font-medium text-emerald-700 mx-0.5 align-middle hover:bg-emerald-100">{title}</button>
          : <span key={key} className="inline-flex items-center rounded-full bg-gray-100 px-1.5 text-[10px] font-medium text-gray-400 mx-0.5 align-middle">{title}</span>
        )
      }
      lastIndex = match.index + token.length
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex))
    return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>
  }

  // ── Derived TODO lists ────────────────────────────────────────────────────────
  const weekLists = todoLists
    .filter(l => l.week_start === todoWeek)
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "") || b.order - a.order)
  const pastLists = todoLists
    .filter(l => l.week_start !== todoWeek)
    .sort((a, b) => (b.week_start || "").localeCompare(a.week_start || ""))
  const safeIdx = weekLists.length > 0 ? Math.min(activeListIdx, weekLists.length - 1) : 0

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading…</div>

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Flip animation keyframes */}
      <style>{`
        @keyframes rbFlipOut {
          0%   { transform: perspective(600px) rotateX(0deg);   }
          100% { transform: perspective(600px) rotateX(-90deg); }
        }
        @keyframes rbFlipIn {
          0%   { transform: perspective(600px) rotateX(90deg);  }
          100% { transform: perspective(600px) rotateX(0deg);   }
        }
      `}</style>

      <div className="h-full overflow-y-auto bg-gray-50">

        {/* ── 1. Project name banner ── */}
        <div className="px-6 pt-10 pb-6">
          <div className="max-w-5xl mx-auto flex flex-col items-center">
            {editingName ? (
              <form onSubmit={saveName} className="flex items-center gap-3 w-full max-w-xl">
                <input autoFocus value={nameInput} onChange={e => setNameInput(e.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-gray-300 px-4 py-2 text-4xl font-bold text-center focus:outline-none focus:ring-2 focus:ring-black sm:text-5xl"
                />
                <button type="submit" disabled={nameBusy}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black text-white shadow hover:bg-gray-800 disabled:opacity-50">
                  <Check size={18} />
                </button>
                <button type="button" onClick={() => { setEditingName(false); setNameInput(project?.name || "") }}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-gray-500 hover:bg-gray-50">
                  <X size={18} />
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-3 group">
                <h1 className="text-4xl font-bold text-gray-900 sm:text-5xl leading-tight text-center">
                  {project?.name}
                </h1>
                {isAdmin && (
                  <button onClick={() => setEditingName(true)}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-100 hover:text-gray-600"
                    title="Rename project">
                    <Pencil size={16} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── 2. Countdown ── */}
        <div
          className="relative"
          onClick={() => { if (canEdit && !editingCountdown) { setEditingCountdown(true); setCountdownForm(homeSettings) } }}
          style={{ cursor: canEdit && !editingCountdown ? "pointer" : "default" }}
        >
          {editingCountdown ? (
            <form onSubmit={saveCountdown} onClick={e => e.stopPropagation()}
              className="max-w-md mx-auto px-6 py-10 space-y-3">
              <p className="text-gray-500 text-sm font-medium mb-4">Set countdown target</p>
              <input
                autoFocus
                value={countdownForm.countdown_title}
                onChange={e => setCountdownForm({ ...countdownForm, countdown_title: e.target.value })}
                placeholder="Deadline title (e.g. CHI 2027)"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 placeholder-gray-400 text-base focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
              <input
                type="datetime-local"
                value={countdownForm.countdown_target}
                onChange={e => setCountdownForm({ ...countdownForm, countdown_target: e.target.value })}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={countdownBusy}
                  className="rounded-xl bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:opacity-50">
                  {countdownBusy ? "Saving…" : "Save"}
                </button>
                <button type="button" onClick={() => setEditingCountdown(false)}
                  className="rounded-xl border border-gray-200 px-6 py-2.5 text-sm text-gray-500 hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </form>
          ) : !homeSettings.countdown_target ? (
            <div className="py-14 text-center">
              <CalendarClock size={28} className="mx-auto mb-3 text-gray-200" />
              <p className="text-gray-300 text-sm">{canEdit ? "Click to set a deadline countdown" : "No countdown set"}</p>
            </div>
          ) : (
            <div className="py-10 px-6 text-center select-none">
              {homeSettings.countdown_title && (
                <p className="mb-8 text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
                  {homeSettings.countdown_title}
                </p>
              )}
              {countdownPast ? (
                <p className="text-5xl font-bold text-gray-900">Time&apos;s up!</p>
              ) : (
                <div className="flex items-center justify-center gap-3 sm:gap-6">
                  <FlipUnit value={cdDays}    label="Days" />
                  <span className="mb-8 text-2xl font-light text-gray-200">:</span>
                  <FlipUnit value={cdHours}   label="Hours" />
                  <span className="mb-8 text-2xl font-light text-gray-200">:</span>
                  <FlipUnit value={cdMinutes} label="Minutes" />
                  <span className="mb-8 text-2xl font-light text-gray-200">:</span>
                  <FlipUnit value={cdSeconds} label="Seconds" />
                </div>
              )}
              {canEdit && (
                <p className="mt-6 text-[10px] text-gray-300 tracking-wide">Click to edit</p>
              )}
            </div>
          )}
        </div>

        {/* ── Content area ── */}
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

          {/* ── 3. Timeline ── */}
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="border-b px-5 py-3 flex items-center justify-between">
              <h3 className="font-semibold text-sm">Project Timeline</h3>
              {canEdit && (
                <button onClick={() => setAddTrack(v=>!v)}
                  className="inline-flex items-center gap-1 text-xs bg-black text-white px-3 py-1.5 rounded-lg">
                  <Plus size={12} /> Add track
                </button>
              )}
            </div>
            {addTrack && canEdit && (
              <form onSubmit={createTrack} className="flex items-center gap-2 px-5 py-2 bg-gray-50 border-b">
                <input autoFocus value={trackName} onChange={e=>setTrackName(e.target.value)} placeholder="Track name" required
                  className="flex-1 border rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-black" />
                <div className="flex gap-1">
                  {TRACK_COLORS.map(c=><button key={c} type="button" onClick={()=>setTrackColor(c)} style={{background:c}} className={`w-5 h-5 rounded-full border-2 ${trackColor===c?"border-black":"border-transparent"}`} />)}
                </div>
                <button type="submit" className="text-xs bg-black text-white px-3 py-1.5 rounded-lg">Create</button>
                <button type="button" onClick={()=>setAddTrack(false)} className="text-gray-400 hover:text-black"><X size={14}/></button>
              </form>
            )}
            {gantt.tracks.length===0 ? (
              <div className="px-5 py-10 text-center text-sm text-gray-400">No tracks yet. Add a track to start planning.</div>
            ) : (
              <div className="flex overflow-hidden">
                <div className="w-40 flex-shrink-0 border-r">
                  <div className="h-9 border-b bg-gray-50 px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-gray-400">Tracks</div>
                  {gantt.tracks.map(track=>(
                    <div key={track.id} className="group h-16 border-b px-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background:track.color}} />
                        <span className="text-xs font-medium truncate">{track.name}</span>
                      </div>
                      {canEdit && <div className="hidden group-hover:flex items-center gap-1"><button onClick={()=>deleteTrack(track.id)} className="p-0.5 text-gray-400 hover:text-red-500"><Trash2 size={11}/></button></div>}
                    </div>
                  ))}
                </div>
                <div className="flex-1 overflow-x-auto" ref={scrollRef} onWheel={handleTimelineWheel}>
                  <div style={{width:totalWidth+"px",minWidth:"100%"}}>
                    <div className="h-9 border-b bg-gray-50 flex items-end">
                      {months.map((m,i)=><div key={i} style={{width:monthWidth+"px"}} className="flex-shrink-0 px-2 pb-1 text-[10px] text-gray-500 font-medium border-r">{m.label}</div>)}
                    </div>
                    {gantt.tracks.map(track=>(
                      <div key={track.id} className={`h-16 border-b relative flex items-center ${canEdit?"cursor-crosshair":""}`}
                        onClick={e=>{if(!canEdit||!scrollRef.current)return;const rect=scrollRef.current.getBoundingClientRect();const x=e.clientX-rect.left+scrollRef.current.scrollLeft;openCreateItem(track.id,dateForX(x),e.clientX,e.clientY)}}>
                        {months.map((_,i)=><div key={i} style={{left:i*monthWidth,width:monthWidth}} className="absolute top-0 bottom-0 border-r border-gray-100"/>)}
                        <div className="absolute top-0 bottom-0 w-px bg-red-300 z-10" style={{left:xForDate(formatDate(now.getTime()))}}/>
                        {track.items.map(item=>{
                          const left=xForDate(item.start); const width=Math.max(xForDate(item.end)-left,36); const docIds=normalizeDocIds(item)
                          return (
                            <div key={item.id} className={`absolute h-8 rounded-md flex items-center px-2 text-white text-[11px] font-medium cursor-pointer group z-20 shadow-sm transition-opacity ${draggingItem===item.id?"opacity-80":"hover:opacity-90"}`}
                              style={{left,width,background:track.color}}
                              onMouseEnter={e=>setHoveredItem({item,track,x:e.clientX,y:e.clientY})}
                              onMouseMove={e=>setHoveredItem(prev=>prev?.item.id===item.id?{...prev,x:e.clientX,y:e.clientY}:prev)}
                              onMouseLeave={()=>setHoveredItem(prev=>prev?.item.id===item.id?null:prev)}
                              onClick={e=>{e.stopPropagation();if(canEdit)openEditItem(track,item,e.clientX,e.clientY)}}>
                              {canEdit&&<span onMouseDown={e=>startResize(e,track.id,item,"start")} className="absolute left-0 top-0 h-full w-2 cursor-ew-resize rounded-l-md bg-white/0 hover:bg-white/30"/>}
                              <span className="truncate">{item.title}</span>
                              {docIds.length?<span className="ml-1 opacity-75 text-[10px]">docs {docIds.length}</span>:null}
                              {item.mentions?.length?<span className="ml-1 opacity-75 text-[10px]">{personLabel(item.mentions[0])}{item.mentions.length>1?` +${item.mentions.length-1}`:""}</span>:null}
                              {canEdit&&<span onMouseDown={e=>startResize(e,track.id,item,"end")} className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r-md bg-white/0 hover:bg-white/30"/>}
                            </div>
                          )
                        })}
                        {timelineEditor?.mode==="create"&&timelineEditor.trackId===track.id&&(()=>{
                          const left=xForDate(timelineEditor.start); const width=Math.max(xForDate(timelineEditor.end)-left,36)
                          return <div className="absolute z-30 flex h-8 items-center rounded-md border border-white/70 px-2 text-[11px] font-medium text-white shadow-sm ring-2 ring-black/10" style={{left,width,background:track.color,opacity:0.78}} onClick={e=>e.stopPropagation()}>
                            <span onMouseDown={e=>startDraftResize(e,"start")} className="absolute left-0 top-0 h-full w-2 cursor-ew-resize rounded-l-md bg-white/0 hover:bg-white/30"/>
                            <span className="truncate">{timelineEditor.title.trim()||"New item"}</span>
                            <span onMouseDown={e=>startDraftResize(e,"end")} className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r-md bg-white/0 hover:bg-white/30"/>
                          </div>
                        })()}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Hovered timeline item tooltip */}
          {hoveredItem && !timelineEditor && (
            <div className="fixed z-50 w-72 rounded-lg border bg-white p-3 text-xs shadow-xl pointer-events-none" style={floatingStyle(hoveredItem.x,hoveredItem.y,288,170)}>
              <p className="font-medium text-gray-900">{hoveredItem.item.title}</p>
              <p className="mt-1 text-gray-400">{hoveredItem.track.name} · {hoveredItem.item.start} to {hoveredItem.item.end}</p>
              {normalizeDocIds(hoveredItem.item).length>0&&<div className="mt-2 space-y-1 text-gray-500">{normalizeDocIds(hoveredItem.item).map(id=>{const d=docById.get(id);return<p key={id} className="truncate">{d?docDisplay(d):id}</p>})}</div>}
              {hoveredItem.item.mentions?.length?<p className="mt-1 text-gray-500">{hoveredItem.item.mentions.map(personLabel).join(", ")}</p>:null}
              {hoveredItem.item.note&&<p className="mt-2 line-clamp-3 text-gray-500">{hoveredItem.item.note}</p>}
            </div>
          )}

          {/* Timeline item editor popup */}
          {timelineEditor && (
            <form onSubmit={saveTimelineItem} className="fixed z-50 max-h-[calc(100vh-24px)] w-[380px] overflow-y-auto rounded-xl border bg-white p-4 shadow-2xl" style={floatingStyle(timelineEditor.x,timelineEditor.y,380,660)}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div><p className="text-sm font-semibold">{timelineEditor.mode==="create"?"New timeline item":"Edit timeline item"}</p><p className="text-xs text-gray-400">{gantt.tracks.find(t=>t.id===timelineEditor.trackId)?.name}</p></div>
                <button type="button" onClick={()=>setTimelineEditor(null)} className="rounded-md p-1 text-gray-400 hover:bg-gray-50 hover:text-black"><X size={14}/></button>
              </div>
              <div className="space-y-3">
                <label className="block"><span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Title</span><input autoFocus required value={timelineEditor.title} onChange={e=>setTimelineEditor({...timelineEditor,title:e.target.value})} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-black"/></label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block"><span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Start</span><input type="date" required value={timelineEditor.start} onChange={e=>setTimelineEditor({...timelineEditor,start:e.target.value})} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-black"/></label>
                  <label className="block"><span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">End</span><input type="date" required value={timelineEditor.end} onChange={e=>setTimelineEditor({...timelineEditor,end:e.target.value})} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-black"/></label>
                </div>
                <div>
                  <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Linked docs</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">{timelineEditor.doc_ids.map(id=>{const d=docById.get(id);return<span key={id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[11px] text-blue-700"><span className="truncate">{d?docDisplay(d):id}</span><button type="button" onClick={()=>removeEditorDoc(id)} className="text-blue-400 hover:text-blue-700"><X size={10}/></button></span>})}</div>
                  {!showTimelineDocPicker ? (
                    <button type="button" onClick={()=>setShowTimelineDocPicker(true)} className="mt-2 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50"><Plus size={11}/> Add doc</button>
                  ) : <div className="mt-2 rounded-lg border">
                    <div className="flex items-center gap-1 border-b px-2 py-1.5"><input value={docQuery} onChange={e=>setDocQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addFirstMatchingDoc()}}} placeholder="Search docs" className="min-w-0 flex-1 text-xs outline-none"/><button type="button" onClick={addFirstMatchingDoc} className="rounded-md border px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50">Add</button></div>
                    <div className="max-h-28 overflow-auto p-1">{docQuery.trim()?docOptions.filter(d=>d.search.includes(docQuery.trim().toLowerCase())).slice(0,8).map(d=><button key={d.id} type="button" onClick={()=>addEditorDoc(d.id)} disabled={timelineEditor.doc_ids.includes(d.id)} className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-gray-50 disabled:opacity-45"><span className="min-w-0 truncate text-gray-700">{docDisplay(d)}</span><span className="shrink-0 text-[10px] text-gray-400">{timelineEditor.doc_ids.includes(d.id)?"Added":"Add"}</span></button>):docTree.length?docTree.map(n=>renderDocNode(n)):<p className="px-2 py-2 text-xs text-gray-400">No docs</p>}</div>
                  </div>}
                </div>
                <div>
                  <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">People</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">{timelineEditor.mentions.map(v=>{const p=personByValue.get(v)||personByValue.get(v.trim().toLowerCase());return<span key={v} className="inline-flex max-w-full items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-[11px] text-gray-700"><span className="truncate">{p?.label||v.replace(/^@/,"")}</span><button type="button" onClick={()=>removeEditorPerson(v)} className="text-gray-400 hover:text-gray-700"><X size={10}/></button></span>})}</div>
                  <div className="mt-2 rounded-lg border">
                    <div className="flex items-center gap-1 border-b px-2 py-1.5"><input value={personQuery} onChange={e=>setPersonQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addFirstMatchingPerson()}}} placeholder="Search people" className="min-w-0 flex-1 text-xs outline-none"/><button type="button" onClick={addFirstMatchingPerson} className="rounded-md border px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50">Add</button></div>
                    <div className="max-h-24 overflow-auto p-1">{(personQuery.trim()?peopleOptions.filter(p=>p.search.includes(personQuery.trim().toLowerCase())):peopleOptions).slice(0,8).map(p=><button key={p.value} type="button" onClick={()=>addEditorPerson(p.value)} disabled={timelineEditor.mentions.includes(p.value)} className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-gray-50 disabled:opacity-45"><span className="min-w-0 truncate text-gray-700">{p.label}</span><span className="shrink-0 text-[10px] text-gray-400">{timelineEditor.mentions.includes(p.value)?"Added":"Add"}</span></button>)}{peopleOptions.length===0&&<p className="px-2 py-2 text-xs text-gray-400">No people</p>}</div>
                  </div>
                </div>
                <label className="block"><span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Note</span><textarea value={timelineEditor.note} onChange={e=>setTimelineEditor({...timelineEditor,note:e.target.value})} className="mt-1 h-16 w-full resize-none rounded-lg border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-black"/></label>
              </div>
              <div className="mt-4 flex items-center justify-between">
                {timelineEditor.mode==="edit"&&timelineEditor.itemId?<button type="button" onClick={()=>deleteItem(timelineEditor.trackId,timelineEditor.itemId!)} className="text-xs text-red-500 hover:text-red-600">Delete</button>:<span/>}
                <div className="flex items-center gap-2">
                  <button type="button" onClick={()=>setTimelineEditor(null)} className="rounded-lg border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">Cancel</button>
                  <button type="submit" className="rounded-lg bg-black px-3 py-1.5 text-xs text-white">Save</button>
                </div>
              </div>
            </form>
          )}

          {/* ── 4. TODO ── */}
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            {/* Header */}
            <div className="border-b px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold text-sm">TODO</h3>
                {weekLists.length > 1 && (
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => setActiveListIdx(i => Math.min(i + 1, weekLists.length - 1))} disabled={activeListIdx >= weekLists.length - 1} className="rounded p-0.5 text-gray-400 hover:text-black disabled:opacity-25"><ChevronLeft size={14}/></button>
                    <span className="text-[11px] text-gray-400 tabular-nums w-8 text-center">{weekLists.length - safeIdx}/{weekLists.length}</span>
                    <button onClick={() => setActiveListIdx(i => Math.max(i - 1, 0))} disabled={activeListIdx <= 0} className="rounded p-0.5 text-gray-400 hover:text-black disabled:opacity-25"><ChevronRight size={14}/></button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={async () => { const next = !todoHistoryOpen; setTodoHistoryOpen(next); await loadTodos(todoWeek, next) }} className="rounded-lg border px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-50">
                  {todoHistoryOpen ? "Current week" : "History"}
                </button>
                {canEdit && <button onClick={() => setListFormOpen(v => !v)} className="inline-flex items-center gap-1 rounded-lg bg-black px-3 py-1.5 text-xs text-white"><Plus size={12}/> New</button>}
              </div>
            </div>

            {/* New list form */}
            {listFormOpen && canEdit && (
              <form onSubmit={createTodoList} className="flex flex-wrap gap-2 border-b bg-gray-50 px-4 py-3">
                <input autoFocus required value={newListTitle} onChange={e => setNewListTitle(e.target.value)} placeholder="List title" className="min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-black"/>
                <select value={newListMeetingId} onChange={e => setNewListMeetingId(e.target.value)} className="rounded-lg border px-2 py-1.5 text-xs text-gray-600 outline-none">
                  <option value="">No meeting</option>
                  {meetings.map(m => <option key={m.id} value={m.id}>{m.date} · {m.title}</option>)}
                </select>
                <button type="submit" className="rounded-lg bg-black px-3 py-1.5 text-xs text-white">Create</button>
                <button type="button" onClick={() => setListFormOpen(false)} className="rounded-lg border px-3 py-1.5 text-xs text-gray-500">Cancel</button>
              </form>
            )}

            {/* Stacked card */}
            {weekLists.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-gray-400">
                {canEdit ? "No lists for this week." : "No TODO lists for this week."}
              </p>
            ) : (() => {
              const list = weekLists[safeIdx]
              const boundMeeting = list.meeting_id ? meetings.find(m => m.id === list.meeting_id) : null
              const form = itemForms[list.id] ?? blankItemForm
              const filteredTodoDocs = (todoDocQuery.trim() ? docOptions.filter(d => d.search.includes(todoDocQuery.trim().toLowerCase()) || d.title.toLowerCase().includes(todoDocQuery.trim().toLowerCase())) : docOptions).slice(0, 12)
              return (
                <div className="relative px-4 pt-4 pb-8">
                  {/* Ghost cards for stack depth */}
                  {safeIdx + 2 < weekLists.length && <div className="pointer-events-none absolute inset-x-8 top-8 bottom-1 rounded-xl border border-gray-100 bg-gray-100"/>}
                  {safeIdx + 1 < weekLists.length && <div className="pointer-events-none absolute inset-x-4 top-6 bottom-0 rounded-xl border border-gray-100 bg-white shadow-sm"/>}
                  {/* Active card */}
                  <div className="relative z-10 rounded-xl border bg-white shadow-sm">
                    {/* Card header */}
                    <div className="flex items-start justify-between gap-2 border-b px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        {editingTodoListId === list.id ? (
                          <input
                            autoFocus
                            value={todoListTitleDraft}
                            onChange={e => setTodoListTitleDraft(e.target.value)}
                            onBlur={() => {
                              if (skipTodoEditBlurRef.current) { skipTodoEditBlurRef.current = false; return }
                              void saveTodoListTitle(list.id)
                            }}
                            onKeyDown={e => {
                              if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur() }
                              if (e.key === "Escape") { e.preventDefault(); cancelTodoListTitleEditor() }
                            }}
                            className="w-full rounded border px-1.5 py-0.5 text-sm font-semibold text-gray-900 outline-none focus:ring-1 focus:ring-black"
                          />
                        ) : canEdit ? (
                          <button
                            type="button"
                            onClick={() => openTodoListTitleEditor(list)}
                            className="block max-w-full truncate rounded px-1 py-0.5 text-left text-sm font-semibold text-gray-900 hover:bg-gray-50"
                          >
                            {list.title}
                          </button>
                        ) : (
                          <p className="truncate text-sm font-semibold text-gray-900">{list.title}</p>
                        )}
                        <div className="mt-1 flex flex-wrap gap-1">
                          {boundMeeting && <button onClick={() => router.push(`/projects/${projectId}/meetings/${boundMeeting.id}`)} className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">{boundMeeting.title}</button>}
                          {list.due_at && <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">{daysUntil(list.due_at)}</span>}
                        </div>
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-1 text-gray-300 shrink-0">
                          <select value={list.meeting_id || ""} onChange={e => patchTodoList(list.id, { meeting_id: e.target.value })} className="max-w-28 rounded border px-1 py-0.5 text-[10px] text-gray-500 outline-none">
                            <option value="">Meeting</option>
                            {meetings.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                          </select>
                          <input type="datetime-local" value={list.due_at || ""} onChange={e => patchTodoList(list.id, { due_at: e.target.value })} className="w-28 rounded border px-1 py-0.5 text-[10px] text-gray-500 outline-none"/>
                          <button onClick={() => { deleteTodoList(list.id); setActiveListIdx(i => Math.max(0, i - 1)) }} className="hover:text-red-500"><Trash2 size={13}/></button>
                        </div>
                      )}
                    </div>
                    {/* Items */}
                    <div className="divide-y">
                      {list.items.length === 0 && <p className="px-4 py-3 text-xs text-gray-400">No items. Add one below.</p>}
                      {list.items.map(item => {
                        const embeddedMentions = new Set((item.text.match(/@([\w.-]+)/g) || []).map(m => m.slice(1).toLowerCase()))
                        const embeddedTitles = new Set((item.text.match(/\{\{([^{}]+)\}\}/g) || []).map(m => m.slice(2, -2)))
                        const extraMentions = item.mentions.filter(m => !embeddedMentions.has(m.replace(/^@/, "").toLowerCase()))
                        const extraDocs = item.doc_ids.filter(id => { const d = docById.get(id); return d && !embeddedTitles.has(d.title) })
                        const isEditingItemText = editingTodoItem?.listId === list.id && editingTodoItem.itemId === item.id
                        return (
                          <div key={item.id} draggable={canEdit && !isEditingItemText} onDragStart={() => setDragItem({ listId: list.id, itemId: item.id })} onDragOver={e => e.preventDefault()} onDrop={() => reorderTodoItem(list.id, item.id)}
                            className={`group flex items-start gap-2 px-4 py-2.5 ${item.is_mine ? "bg-red-50" : ""}`}>
                            <button onClick={() => patchTodoItem(list.id, item.id, { completed: !item.completed })} className="mt-0.5 shrink-0 text-gray-400 hover:text-black">
                              {item.completed ? <CheckSquare size={14}/> : <Square size={14}/>}
                            </button>
                            <div className="min-w-0 flex-1">
                              {isEditingItemText ? (
                                <input
                                  autoFocus
                                  value={todoItemTextDraft}
                                  onChange={e => setTodoItemTextDraft(e.target.value)}
                                  onBlur={() => {
                                    if (skipTodoEditBlurRef.current) { skipTodoEditBlurRef.current = false; return }
                                    void saveTodoItemText(list.id, item)
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur() }
                                    if (e.key === "Escape") { e.preventDefault(); cancelTodoItemTextEditor() }
                                  }}
                                  className="w-full rounded border px-1.5 py-0.5 text-sm text-gray-800 outline-none focus:ring-1 focus:ring-black"
                                />
                              ) : (
                                <div
                                  role={canEdit ? "button" : undefined}
                                  tabIndex={canEdit ? 0 : undefined}
                                  onClick={e => {
                                    const target = e.target as HTMLElement
                                    if (target.closest("button,a,input,select,textarea")) return
                                    openTodoItemTextEditor(list.id, item)
                                  }}
                                  onKeyDown={e => {
                                    if (!canEdit || (e.key !== "Enter" && e.key !== " ")) return
                                    e.preventDefault()
                                    openTodoItemTextEditor(list.id, item)
                                  }}
                                  className={`rounded px-1 py-0.5 text-sm leading-snug ${canEdit ? "cursor-text hover:bg-gray-50" : ""} ${item.completed ? "line-through text-gray-400" : "text-gray-800"}`}
                                >
                                  {renderItemText(item.text)}
                                </div>
                              )}
                              {(extraMentions.length > 0 || extraDocs.length > 0) && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {extraMentions.map(m => <span key={m} className="rounded-full bg-gray-100 px-1.5 py-0 text-[10px] text-gray-600">@{m}</span>)}
                                  {extraDocs.map(id => { const d = docById.get(id); return d ? <button key={id} onClick={() => d.meetingId ? router.push(`/projects/${projectId}/meetings/${d.meetingId}`) : router.push(`/projects/${projectId}/docs/${d.id}`)} className="rounded-full bg-emerald-50 px-1.5 py-0 text-[10px] text-emerald-700">{docDisplay(d)}</button> : null })}
                                </div>
                              )}
                              {item.due_at && <p className="mt-0.5 text-[10px] text-amber-600">{daysUntil(item.due_at)}</p>}
                            </div>
                            {canEdit && (
                              <div className="flex shrink-0 items-center gap-1 text-gray-300">
                                <input type="date" value={(item.due_at || "").split("T")[0]} onChange={e => patchTodoItem(list.id, item.id, { due_at: e.target.value })}
                                  title="Due date" className="w-0 overflow-hidden rounded border px-1 py-0.5 text-[10px] text-gray-400 outline-none opacity-0 transition-all group-hover:w-24 group-hover:opacity-100"/>
                                <GripVertical size={13}/>
                                <button onClick={() => deleteTodoItem(list.id, item.id)} className="hover:text-red-500"><Trash2 size={12}/></button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {/* Add item */}
                    {canEdit && (
                      <form onSubmit={e => createTodoItem(list.id, e)} className="border-t bg-gray-50 px-3 py-2.5">
                        <div className="flex items-center gap-1 rounded-lg border bg-white px-1.5 py-1">
                          <button type="button"
                            onClick={() => { updateItemForm(list.id, { text: form.text + "@" }); setPeoplePickerListId(list.id) }}
                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-black" title="Mention (@)"><AtSign size={13}/></button>
                          <button type="button"
                            onClick={() => { updateItemForm(list.id, { text: form.text + "{{" }); setDocPickerListId(list.id) }}
                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-black" title="Reference doc ({{}})"><FileText size={13}/></button>
                          <input required value={form.text}
                            onChange={e => {
                              const val = e.target.value
                              updateItemForm(list.id, { text: val })
                              if (/@[\w.-]*$/.test(val)) setPeoplePickerListId(list.id)
                              else if (val.endsWith("{{")) setDocPickerListId(list.id)
                              else if (peoplePickerListId === list.id && !/@/.test(val)) setPeoplePickerListId(null)
                            }}
                            placeholder="Add item… type @ or {{ to insert refs"
                            className="min-w-0 flex-1 px-1 py-1 text-xs outline-none"
                          />
                          <input type="date" value={newItemDueForms[list.id] || ""} onChange={e => setNewItemDueForms(prev => ({ ...prev, [list.id]: e.target.value }))}
                            title="Item due date" className="w-24 rounded border px-1 py-0.5 text-[10px] text-gray-400 outline-none"/>
                          <button type="submit" className="rounded-md bg-black px-2.5 py-1 text-xs text-white">Add</button>
                        </div>
                        {peoplePickerListId === list.id && (
                          <div className="mt-2 max-h-32 overflow-auto rounded-lg border bg-white shadow-sm">
                            {peopleOptions.length === 0
                              ? <p className="px-3 py-2 text-xs text-gray-400">No contacts yet.</p>
                              : peopleOptions.map(p => (
                                <button key={p.value} type="button"
                                  onClick={() => {
                                    const cur = (itemForms[list.id] ?? blankItemForm).text
                                    const curMentions = (itemForms[list.id] ?? blankItemForm).mentions
                                    updateItemForm(list.id, {
                                      text: cur.replace(/@[\w.-]*$/, "") + `@${p.value.replace(/^@/, "")} `,
                                      mentions: curMentions.includes(p.value) ? curMentions : [...curMentions, p.value],
                                    })
                                    setPeoplePickerListId(null)
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-gray-50">
                                  <span className="truncate">{p.label}</span>
                                </button>
                              ))
                            }
                          </div>
                        )}
                        {docPickerListId === list.id && (
                          <div className="mt-2 rounded-lg border bg-white shadow-sm">
                            <div className="border-b px-2 py-1.5">
                              <input value={todoDocQuery} onChange={e => setTodoDocQuery(e.target.value)} placeholder="Search docs…" className="w-full text-xs outline-none"/>
                            </div>
                            <div className="max-h-36 overflow-auto p-1">
                              {filteredTodoDocs.length === 0 && <p className="px-2 py-2 text-xs text-gray-400">No docs found.</p>}
                              {filteredTodoDocs.map(d => (
                                <button key={d.id} type="button" onClick={() => insertTodoDoc(list.id, d)}
                                  className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-gray-50">
                                  <span className="min-w-0 truncate">{docDisplay(d)}</span>
                                  <span className="shrink-0 text-[10px] text-gray-400">{d.source === "meeting" ? "Meeting" : "Doc"}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </form>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* History — past weeks, read-only */}
            {todoHistoryOpen && pastLists.length > 0 && (
              <div className="border-t">
                <p className="px-5 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">Previous weeks</p>
                <div className="space-y-2 px-4 pb-4">
                  {pastLists.map(list => (
                    <div key={list.id} className="rounded-lg border bg-white px-4 py-3">
                      <div className="flex items-center gap-2 mb-2">
                        <p className="text-xs font-semibold text-gray-700 truncate flex-1">{list.title}</p>
                        <span className="shrink-0 text-[10px] text-gray-400">{list.week_start}</span>
                        {list.due_at && <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">{daysUntil(list.due_at)}</span>}
                      </div>
                      {list.items.length === 0 && <p className="text-xs text-gray-400">No items.</p>}
                      <div className="space-y-1.5">
                        {list.items.map(item => (
                          <div key={item.id} className="flex items-start gap-2">
                            <span className="shrink-0 mt-0.5 text-gray-400">{item.completed ? <CheckSquare size={12}/> : <Square size={12}/>}</span>
                            <div className={`text-xs leading-snug ${item.completed ? "line-through text-gray-400" : "text-gray-600"}`}>
                              {renderItemText(item.text)}
                              {item.due_at && <span className="ml-1 text-[10px] text-amber-600">{daysUntil(item.due_at)}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── 4. Team access ── */}
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="border-b px-5 py-3 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm">Team access</h3>
                <p className="mt-0.5 text-xs text-gray-400">Invite people by email and control project permissions.</p>
              </div>
              {isAdmin && (
                <button onClick={() => setAddingMember(v => !v)}
                  className="inline-flex items-center gap-1.5 text-xs border rounded-lg px-2.5 py-1.5 text-gray-600 hover:bg-gray-50">
                  <UserPlus size={13}/> Invite
                </button>
              )}
            </div>
            {addingMember && isAdmin && (
              <form onSubmit={inviteMember} className="grid gap-2 border-b bg-gray-50 px-4 py-3 sm:grid-cols-[1fr_160px_auto]">
                <input value={memberForm.email} onChange={e=>setMemberForm({...memberForm,email:e.target.value})} type="email" placeholder="teammate@lab.edu" required className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none"/>
                <select value={memberForm.role} onChange={e=>setMemberForm({...memberForm,role:e.target.value as ProjectMember["role"]})} className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none"><option value="member">Can edit</option><option value="viewer">Read only</option><option value="admin">Admin</option></select>
                <button type="submit" className="rounded-lg bg-black px-3 py-1.5 text-xs text-white">Invite</button>
              </form>
            )}
            {teamMsg && <p className="border-b px-5 py-2 text-xs text-gray-500 whitespace-pre-line">{teamMsg}</p>}
            <div className="divide-y">
              {members.length===0 ? <p className="px-5 py-8 text-sm text-gray-400">No project members yet.</p>
                : members.map(member=>(
                <div key={member.id} className="flex items-center gap-3 px-5 py-3">
                  <div className={`w-8 h-8 rounded-full text-xs font-medium flex items-center justify-center flex-shrink-0 ${member.status==="pending"?"bg-blue-50 text-blue-600":"bg-black text-white"}`}>
                    {member.status==="pending"?<Mail size={14}/>:(member.name||member.email)[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium truncate">{member.name||member.email}</p>
                      {member.is_creator&&<span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700"><Crown size={10}/>Creator</span>}
                      {member.status==="pending"&&<span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">Not registered</span>}
                    </div>
                    <p className="text-xs text-gray-400 truncate">{member.email}</p>
                    <p className="mt-0.5 text-[11px] text-gray-400">{roleDescription(member.role)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdmin&&!member.is_creator
                      ? <select value={member.role} onChange={e=>updateMemberRole(member,e.target.value as ProjectMember["role"])} className="rounded-lg border px-2 py-1.5 text-xs text-gray-600"><option value="member">Can edit</option><option value="viewer">Read only</option><option value="admin">Admin</option></select>
                      : <span className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs text-gray-600"><Shield size={12}/>{ROLE_LABELS[member.role]}</span>
                    }
                    {isAdmin&&!member.is_creator&&<button onClick={()=>removeProjectMember(member)} className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50" title={member.status==="pending"?"Cancel invitation":"Remove member"}><Trash2 size={14}/></button>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── 5. Project Settings (collapsible, admin only) ── */}
          {isAdmin && (
            <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <button
                onClick={() => setSettingsOpen(v => !v)}
                className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold hover:bg-gray-50 transition-colors"
              >
                <span>Project Settings</span>
                {settingsOpen ? <ChevronDown size={16} className="text-gray-400"/> : <ChevronRight size={16} className="text-gray-400"/>}
              </button>

              {settingsOpen && (
                <div className="border-t px-5 pb-6 pt-5 space-y-6">
                  {(settingsMsg || settingsError) && (
                    <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${settingsError?"bg-red-50 text-red-700":"bg-green-50 text-green-700"}`}>
                      <p className="whitespace-pre-line">{settingsError || settingsMsg}</p>
                    </div>
                  )}

                  {/* Google Drive */}
                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Folder size={15} className="text-gray-500"/>
                        <div>
                          <p className="text-sm font-medium">Google Drive</p>
                          <p className="text-xs text-gray-400">Choose this project&apos;s Drive folder for syncing docs and meetings.</p>
                        </div>
                      </div>
                      <Link
                        href="/settings"
                        className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-50 shrink-0"
                        title="Manage Google Drive connection in Global Settings"
                      >
                        <Settings size={11} />
                        Global Settings
                      </Link>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
                      {driveRoot?.configured ? (
                        <div className="flex items-center gap-2">
                          <div className="min-w-0 flex-1"><p>Bound: <b className="text-gray-800">{driveRoot.root_folder_name}</b></p><p className="mt-0.5 truncate font-mono text-[11px]">{driveRoot.root_folder_id}</p></div>
                          {driveRoot.root_folder_link && <a href={driveRoot.root_folder_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-blue-600 hover:bg-blue-50">Open<ExternalLink size={11}/></a>}
                        </div>
                      ) : driveConnected ? (
                        <span>No Drive folder selected.</span>
                      ) : (
                        <div className="flex items-center justify-between gap-3">
                          <span>Google Drive not connected.</span>
                          <Link href="/settings"
                            className="inline-flex items-center gap-1 rounded-md border bg-white px-2.5 py-1 text-blue-600 hover:bg-blue-50 shrink-0 font-medium">
                            Connect in Settings <ExternalLink size={10}/>
                          </Link>
                        </div>
                      )}
                    </div>
                    <div className="grid gap-2">
                      <select value={driveMode} onChange={e=>setDriveMode(e.target.value as "default"|"existing"|"new")} disabled={!driveConnected} className="rounded-lg border px-3 py-2 text-sm text-gray-700 disabled:bg-gray-50">
                        <option value="default">Use ResearchBuddy / project name</option>
                        <option value="existing">Use an existing Drive folder</option>
                        <option value="new">Create a new Drive folder</option>
                      </select>
                      {driveMode==="existing"&&<input value={folderUrl} onChange={e=>setFolderUrl(e.target.value)} placeholder="Drive folder URL or id" disabled={!driveConnected} className="rounded-lg border px-3 py-2 text-sm disabled:bg-gray-50"/>}
                      {driveMode==="new"&&<div className="grid gap-2 sm:grid-cols-2"><input value={folderName} onChange={e=>setFolderName(e.target.value)} placeholder="Folder name" disabled={!driveConnected} className="rounded-lg border px-3 py-2 text-sm disabled:bg-gray-50"/><input value={parentFolderUrl} onChange={e=>setParentFolderUrl(e.target.value)} placeholder="Optional parent folder URL" disabled={!driveConnected} className="rounded-lg border px-3 py-2 text-sm disabled:bg-gray-50"/></div>}
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={saveDriveRoot} disabled={!driveConnected||settingsBusy==="drive"} className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50">{settingsBusy==="drive"?"Saving…":"Save Drive folder"}</button>
                        <select value={syncScope} onChange={e=>setSyncScope(e.target.value as "all"|"docs"|"meetings")} className="rounded-lg border px-2 py-2 text-xs text-gray-600"><option value="all">Docs and meetings</option><option value="docs">Docs only</option><option value="meetings">Meetings only</option></select>
                        <select value={syncMode} onChange={e=>setSyncMode(e.target.value as "mapped"|"new")} className="rounded-lg border px-2 py-2 text-xs text-gray-600"><option value="mapped">Update mapped</option><option value="new">Create new</option></select>
                        <button type="button" onClick={syncProjectDrive} disabled={!driveConnected||settingsBusy==="sync"} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"><RefreshCw size={13}/>{settingsBusy==="sync"?"Syncing…":"Sync"}</button>
                      </div>
                      {syncResult&&<p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">Synced to {syncResult.root.root_folder_name}. Docs: {syncResult.docs?.synced??0}; Meetings: {syncResult.meetings?.synced??0}.</p>}
                    </div>
                  </section>

                  <div className="border-t" />

                  {/* Zotero */}
                  <form onSubmit={saveZotero} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Database size={15} className="text-gray-500"/>
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium">Zotero</p>
                          <ZoteroHelpPopover />
                        </div>
                        <p className="text-xs text-gray-400">Project library used by Papers for syncing citations.</p>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      {/* API Key */}
                      <div className="space-y-1">
                        <input
                          value={zoteroConfig.api_key}
                          onChange={e=>setZoteroConfig({...zoteroConfig,api_key:e.target.value})}
                          placeholder={zoteroConfig.api_key_set?"API key already saved — leave blank to keep it.":"Zotero API key"}
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                        />
                        <p className="text-[11px] text-gray-400">
                          Get your key at{" "}
                          <a href="https://www.zotero.org/settings/keys/new" target="_blank" rel="noreferrer"
                            className="text-blue-500 underline underline-offset-2">zotero.org/settings/keys/new</a>
                          {" "}— enable <em>Allow library access</em>.
                        </p>
                      </div>

                      {/* Library ID + Type */}
                      <div className="space-y-1">
                        <div className="grid gap-2 sm:grid-cols-[1fr_140px]">
                          <input
                            value={zoteroConfig.library_id}
                            onChange={e=>setZoteroConfig({...zoteroConfig,library_id:e.target.value})}
                            placeholder={zoteroConfig.library_type === "group" ? "Group ID (e.g. 4567890)" : "User ID (e.g. 1234567)"}
                            className="rounded-lg border px-3 py-2 text-sm"
                          />
                          <select
                            value={zoteroConfig.library_type}
                            onChange={e=>setZoteroConfig({...zoteroConfig,library_type:e.target.value as "user"|"group"})}
                            className="rounded-lg border px-3 py-2 text-sm text-gray-700"
                          >
                            <option value="user">User (Personal)</option>
                            <option value="group">Group (Shared)</option>
                          </select>
                        </div>
                        <p className="text-[11px] text-gray-400">
                          {zoteroConfig.library_type === "group" ? (
                            <>
                              Group ID: open your group at{" "}
                              <a href="https://www.zotero.org/groups/" target="_blank" rel="noreferrer"
                                className="text-blue-500 underline underline-offset-2">zotero.org/groups</a>
                              {" "}— the number in the URL is the Group ID.
                            </>
                          ) : (
                            <>
                              User ID: go to{" "}
                              <a href="https://www.zotero.org/settings/keys" target="_blank" rel="noreferrer"
                                className="text-blue-500 underline underline-offset-2">zotero.org/settings/keys</a>
                              {" "}and look for <em>"Your userID for use in API calls"</em>.
                            </>
                          )}
                        </p>
                      </div>

                      <button disabled={settingsBusy==="zotero"} className="w-fit rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                        {settingsBusy==="zotero"?"Saving…":"Save Zotero"}
                      </button>
                    </div>
                  </form>

                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  )
}

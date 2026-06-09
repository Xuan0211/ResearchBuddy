"use client"
import type { CSSProperties } from "react"
import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { Crown, Mail, Plus, Shield, Trash2, UserPlus, X } from "lucide-react"
import { api } from "@/lib/api"
import type { Contact, Document, Project, ProjectMember } from "@/lib/types"

// ── Types ─────────────────────────────────────────────────────────────────────

interface GanttItem {
  id: string; title: string; start: string; end: string
  doc_id?: string; doc_ids?: string[]; mentions?: string[]; note?: string
}
interface GanttTrack { id: string; name: string; color: string; items: GanttItem[] }
interface GanttMilestone { id: string; title: string; date: string; color: string }
interface GanttData { tracks: GanttTrack[]; milestones: GanttMilestone[] }
interface TimelineEditor {
  mode: "create" | "edit"
  trackId: string
  itemId?: string
  title: string
  start: string
  end: string
  doc_ids: string[]
  mentions: string[]
  note: string
  x: number
  y: number
}
interface HoveredTimelineItem {
  item: GanttItem
  track: GanttTrack
  x: number
  y: number
}
interface ResizeDrag {
  trackId: string
  itemId: string
  edge: "start" | "end"
  clientX: number
  originalStart: string
  originalEnd: string
  currentStart: string
  currentEnd: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000

function toMs(iso: string) { return new Date(`${iso}T00:00:00`).getTime() }

function formatDate(ms: number) {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function addDays(iso: string, days: number) {
  return formatDate(toMs(iso) + days * DAY_MS)
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function normalizeDocIds(item: GanttItem) {
  return Array.from(new Set([...(item.doc_ids ?? []), item.doc_id ?? ""].filter(Boolean)))
}

function monthsBetween(start: Date, end: Date) {
  const months: { label: string; year: number; month: number }[] = []
  const d = new Date(start.getFullYear(), start.getMonth(), 1)
  while (d <= end) {
    months.push({ label: d.toLocaleString("default", { month: "short", year: "2-digit" }), year: d.getFullYear(), month: d.getMonth() })
    d.setMonth(d.getMonth() + 1)
  }
  return months
}

const TRACK_COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#06b6d4"]

const ROLE_LABELS: Record<ProjectMember["role"], string> = {
  admin: "Admin",
  member: "Can edit",
  viewer: "Read only",
}

function roleDescription(role: ProjectMember["role"]) {
  if (role === "admin") return "Manage members and edit everything"
  if (role === "member") return "Edit project content"
  return "View project content"
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HomePage() {
  const { id: projectId } = useParams<{ id: string }>()
  const [gantt, setGantt] = useState<GanttData>({ tracks: [], milestones: [] })
  const [project, setProject] = useState<Project | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [docs, setDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [addTrack, setAddTrack] = useState(false)
  const [trackName, setTrackName] = useState("")
  const [trackColor, setTrackColor] = useState(TRACK_COLORS[0])
  const [monthWidth, setMonthWidth] = useState(112)
  const [timelineEditor, setTimelineEditor] = useState<TimelineEditor | null>(null)
  const [hoveredItem, setHoveredItem] = useState<HoveredTimelineItem | null>(null)
  const [draggingItem, setDraggingItem] = useState<string | null>(null)
  const [addingMember, setAddingMember] = useState(false)
  const [memberForm, setMemberForm] = useState<{ email: string; role: ProjectMember["role"] }>({ email: "", role: "member" })
  const [teamMsg, setTeamMsg] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<ResizeDrag | null>(null)

  useEffect(() => {
    Promise.all([
      api.get<Project>(`/api/projects/${projectId}`),
      api.get<GanttData>(`/api/projects/${projectId}/gantt`),
      api.get<Contact[]>(`/api/projects/${projectId}/contacts`).catch(() => [] as Contact[]),
      api.get<ProjectMember[]>(`/api/projects/${projectId}/members`).catch(() => [] as ProjectMember[]),
      api.get<Document[]>(`/api/projects/${projectId}/docs`).catch(() => [] as Document[]),
    ]).then(([p, g, c, m, d]) => { setProject(p); setGantt(g); setContacts(c); setMembers(m); setDocs(d) }).finally(() => setLoading(false))
  }, [projectId])

  // Compute time range
  const allDates = [
    ...gantt.tracks.flatMap(t => t.items.flatMap(i => [i.start, i.end])),
    ...gantt.milestones.map(m => m.date),
  ].filter(Boolean)
  const now = new Date()
  const minDate = allDates.length ? new Date(Math.min(...allDates.map(toMs))) : new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const maxDate = allDates.length ? new Date(Math.max(...allDates.map(toMs))) : new Date(now.getFullYear(), now.getMonth() + 5, 1)
  const viewStart = new Date(minDate.getFullYear(), minDate.getMonth() - 1, 1)
  const viewEnd = new Date(maxDate.getFullYear(), maxDate.getMonth() + 2, 1)
  const totalMs = viewEnd.getTime() - viewStart.getTime()
  const months = monthsBetween(viewStart, viewEnd)
  const totalWidth = months.length * monthWidth

  function xForDate(iso: string) {
    return ((toMs(iso) - viewStart.getTime()) / totalMs) * totalWidth
  }

  function dateForX(x: number) {
    const ratio = clamp(x / Math.max(1, totalWidth), 0, 1)
    return formatDate(viewStart.getTime() + ratio * totalMs)
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const drag = dragRef.current
      if (!drag) return
      const dayWidth = Math.max(1, totalWidth / Math.max(1, Math.round(totalMs / DAY_MS)))
      const deltaDays = Math.round((e.clientX - drag.clientX) / dayWidth)
      let start = drag.originalStart
      let end = drag.originalEnd
      if (drag.edge === "start") {
        start = addDays(drag.originalStart, deltaDays)
        if (toMs(start) > toMs(end) - DAY_MS) start = addDays(end, -1)
      } else {
        end = addDays(drag.originalEnd, deltaDays)
        if (toMs(end) < toMs(start) + DAY_MS) end = addDays(start, 1)
      }
      drag.currentStart = start
      drag.currentEnd = end
      setGantt(g => ({
        ...g,
        tracks: g.tracks.map(t => t.id === drag.trackId ? {
          ...t,
          items: t.items.map(i => i.id === drag.itemId ? { ...i, start, end } : i),
        } : t)
      }))
    }

    async function onUp() {
      const drag = dragRef.current
      if (!drag) return
      dragRef.current = null
      setDraggingItem(null)
      if (drag.currentStart === drag.originalStart && drag.currentEnd === drag.originalEnd) return
      try {
        await api.patch<GanttItem>(`/api/projects/${projectId}/gantt/tracks/${drag.trackId}/items/${drag.itemId}`, {
          start: drag.currentStart,
          end: drag.currentEnd,
        })
      } catch {
        setGantt(g => ({
          ...g,
          tracks: g.tracks.map(t => t.id === drag.trackId ? {
            ...t,
            items: t.items.map(i => i.id === drag.itemId ? { ...i, start: drag.originalStart, end: drag.originalEnd } : i),
          } : t)
        }))
      }
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [projectId, totalMs, totalWidth])

  async function createTrack(e: React.FormEvent) {
    e.preventDefault()
    const track = await api.post<GanttTrack>(`/api/projects/${projectId}/gantt/tracks`, {
      name: trackName, color: trackColor, items: []
    })
    setGantt(g => ({ ...g, tracks: [...g.tracks, track] }))
    setTrackName(""); setAddTrack(false)
  }

  async function deleteTrack(trackId: string) {
    if (!confirm("Delete this track and all its items?")) return
    await api.delete(`/api/projects/${projectId}/gantt/tracks/${trackId}`)
    setGantt(g => ({ ...g, tracks: g.tracks.filter(t => t.id !== trackId) }))
  }

  function openCreateItem(trackId: string, date: string, x: number, y: number) {
    setHoveredItem(null)
    setTimelineEditor({
      mode: "create",
      trackId,
      title: "",
      start: date,
      end: addDays(date, 7),
      doc_ids: [],
      mentions: [],
      note: "",
      x,
      y,
    })
  }

  function openEditItem(track: GanttTrack, item: GanttItem, x: number, y: number) {
    setHoveredItem(null)
    setTimelineEditor({
      mode: "edit",
      trackId: track.id,
      itemId: item.id,
      title: item.title,
      start: item.start,
      end: item.end,
      doc_ids: normalizeDocIds(item),
      mentions: item.mentions ?? [],
      note: item.note ?? "",
      x,
      y,
    })
  }

  function updateEditorMulti(field: "doc_ids" | "mentions", values: string[]) {
    setTimelineEditor(editor => editor ? { ...editor, [field]: values } : editor)
  }

  async function saveTimelineItem(e: React.FormEvent) {
    e.preventDefault()
    if (!timelineEditor) return
    const start = timelineEditor.start <= timelineEditor.end ? timelineEditor.start : timelineEditor.end
    const end = timelineEditor.end >= timelineEditor.start ? timelineEditor.end : timelineEditor.start
    const payload = {
      title: timelineEditor.title.trim() || "Untitled",
      start,
      end,
      doc_id: timelineEditor.doc_ids[0] ?? "",
      doc_ids: timelineEditor.doc_ids,
      mentions: timelineEditor.mentions.map(s => s.trim().replace(/^@/, "")).filter(Boolean),
      note: timelineEditor.note,
    }

    if (timelineEditor.mode === "edit" && timelineEditor.itemId) {
      const updated = await api.patch<GanttItem>(`/api/projects/${projectId}/gantt/tracks/${timelineEditor.trackId}/items/${timelineEditor.itemId}`, payload)
      setGantt(g => ({
        ...g,
        tracks: g.tracks.map(t => t.id === timelineEditor.trackId ? {
          ...t,
          items: t.items.map(i => i.id === timelineEditor.itemId ? updated : i),
        } : t)
      }))
    } else {
      const item = await api.post<GanttItem>(`/api/projects/${projectId}/gantt/tracks/${timelineEditor.trackId}/items`, payload)
      setGantt(g => ({
        ...g,
        tracks: g.tracks.map(t => t.id === timelineEditor.trackId ? { ...t, items: [...t.items, item] } : t)
      }))
    }
    setTimelineEditor(null)
  }

  async function deleteItem(trackId: string, itemId: string) {
    await api.delete(`/api/projects/${projectId}/gantt/tracks/${trackId}/items/${itemId}`)
    setGantt(g => ({
      ...g,
      tracks: g.tracks.map(t => t.id === trackId ? { ...t, items: t.items.filter(i => i.id !== itemId) } : t)
    }))
    if (timelineEditor?.itemId === itemId) setTimelineEditor(null)
  }

  function handleTimelineWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (!scrollRef.current) return
    e.preventDefault()
    const viewport = scrollRef.current
    const rect = viewport.getBoundingClientRect()
    const pointerX = e.clientX - rect.left + viewport.scrollLeft
    const ratio = pointerX / Math.max(1, totalWidth)
    const next = clamp(monthWidth * (e.deltaY > 0 ? 0.88 : 1.12), 58, 260)
    const nextTotal = months.length * next
    setMonthWidth(next)
    window.requestAnimationFrame(() => {
      viewport.scrollLeft = clamp(ratio * nextTotal - (e.clientX - rect.left), 0, Math.max(0, nextTotal - rect.width))
    })
  }

  function startResize(e: React.MouseEvent, trackId: string, item: GanttItem, edge: "start" | "end") {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = {
      trackId,
      itemId: item.id,
      edge,
      clientX: e.clientX,
      originalStart: item.start,
      originalEnd: item.end,
      currentStart: item.start,
      currentEnd: item.end,
    }
    setDraggingItem(item.id)
  }

  async function inviteMember(e: React.FormEvent) {
    e.preventDefault()
    setTeamMsg("")
    try {
      const member = await api.post<ProjectMember>(`/api/projects/${projectId}/members`, memberForm)
      setMembers(prev => [...prev.filter(item => item.id !== member.id && item.email !== member.email), member])
      setMemberForm({ email: "", role: "member" })
      setAddingMember(false)
      setTeamMsg(member.status === "pending" ? "Invitation saved. The user will get access automatically after registering." : "Member added.")
      api.get<Contact[]>(`/api/projects/${projectId}/contacts`).then(setContacts).catch(() => {})
    } catch (err: any) {
      setTeamMsg(err.message || "Could not invite member")
    }
  }

  async function updateMemberRole(member: ProjectMember, role: ProjectMember["role"]) {
    setTeamMsg("")
    try {
      const updated = member.status === "pending" && member.invite_id
        ? await api.put<ProjectMember>(`/api/projects/${projectId}/invites/${member.invite_id}/role`, { role })
        : await api.put<ProjectMember>(`/api/projects/${projectId}/members/${member.user_id}/role`, { role })
      setMembers(prev => prev.map(item => item.id === member.id ? updated : item))
      api.get<Contact[]>(`/api/projects/${projectId}/contacts`).then(setContacts).catch(() => {})
    } catch (err: any) {
      setTeamMsg(err.message || "Could not update member")
    }
  }

  async function removeProjectMember(member: ProjectMember) {
    const label = member.status === "pending" ? "Cancel this invitation?" : `Remove ${member.email} from this project?`
    if (!confirm(label)) return
    setTeamMsg("")
    try {
      if (member.status === "pending" && member.invite_id) {
        await api.delete(`/api/projects/${projectId}/invites/${member.invite_id}`)
      } else {
        await api.delete(`/api/projects/${projectId}/members/${member.user_id}`)
      }
      setMembers(prev => prev.filter(item => item.id !== member.id))
      api.get<Contact[]>(`/api/projects/${projectId}/contacts`).then(setContacts).catch(() => {})
    } catch (err: any) {
      setTeamMsg(err.message || "Could not remove member")
    }
  }

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading…</div>

  const canManageTeam = project?.role === "admin"
  const canEditTimeline = project?.role === "admin" || project?.role === "member"
  const peopleEntries: [string, { value: string; label: string; detail: string }][] = [
    ...contacts.map(c => [c.handle, { value: c.handle, label: `@${c.handle}`, detail: c.name || c.email }] as [string, { value: string; label: string; detail: string }]),
    ...members.filter(m => m.status === "active").map(m => [m.email, { value: m.email, label: m.name || m.email, detail: m.email }] as [string, { value: string; label: string; detail: string }]),
  ]
  const peopleOptions = Array.from(new Map(peopleEntries).values())

  function floatingStyle(x: number, y: number, width: number, height: number): CSSProperties {
    if (typeof window === "undefined") return { left: x + 12, top: y + 12 }
    return {
      left: clamp(x + 12, 12, window.innerWidth - width - 12),
      top: clamp(y + 12, 12, window.innerHeight - height - 12),
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* ── Gantt Chart ── */}
        <div className="border rounded-xl bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">Project Timeline</h3>
            </div>
            {canEditTimeline && (
              <button onClick={() => setAddTrack(v => !v)}
                className="inline-flex items-center gap-1 text-xs bg-black text-white px-3 py-1.5 rounded-lg">
                <Plus size={12} /> Add track
              </button>
            )}
          </div>

          {addTrack && canEditTimeline && (
            <form onSubmit={createTrack} className="flex items-center gap-2 px-5 py-2 bg-gray-50 border-b">
              <input autoFocus value={trackName} onChange={e => setTrackName(e.target.value)}
                placeholder="Track name" required
                className="flex-1 border rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-black" />
              <div className="flex gap-1">
                {TRACK_COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setTrackColor(c)}
                    style={{ background: c }}
                    className={`w-5 h-5 rounded-full border-2 ${trackColor === c ? "border-black" : "border-transparent"}`} />
                ))}
              </div>
              <button type="submit" className="text-xs bg-black text-white px-3 py-1.5 rounded-lg">Create</button>
              <button type="button" onClick={() => setAddTrack(false)} className="text-gray-400 hover:text-black"><X size={14} /></button>
            </form>
          )}

          {gantt.tracks.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-400">
              No tracks yet. Add a track to start planning.
            </div>
          ) : (
            <div className="flex overflow-hidden">
              {/* Track labels (fixed left) */}
              <div className="w-40 flex-shrink-0 border-r">
                <div className="h-9 border-b bg-gray-50 px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                  Tracks
                </div>
                {gantt.tracks.map(track => (
                  <div key={track.id} className="group h-16 border-b px-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: track.color }} />
                      <span className="text-xs font-medium truncate">{track.name}</span>
                    </div>
                    {canEditTimeline && (
                      <div className="hidden group-hover:flex items-center gap-1">
                        <button onClick={() => deleteTrack(track.id)} className="p-0.5 text-gray-400 hover:text-red-500"><Trash2 size={11} /></button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Scrollable timeline */}
              <div className="flex-1 overflow-x-auto" ref={scrollRef} onWheel={handleTimelineWheel}>
                <div style={{ width: totalWidth + "px", minWidth: "100%" }}>
                  {/* Month headers */}
                  <div className="h-9 border-b bg-gray-50 flex items-end">
                    {months.map((m, i) => (
                      <div key={i} style={{ width: monthWidth + "px" }}
                        className="flex-shrink-0 px-2 pb-1 text-[10px] text-gray-500 font-medium border-r">
                        {m.label}
                      </div>
                    ))}
                  </div>

                  {/* Tracks */}
                  {gantt.tracks.map(track => (
                    <div key={track.id}
                      className={`h-16 border-b relative flex items-center ${canEditTimeline ? "cursor-crosshair" : ""}`}
                      onClick={e => {
                        if (!canEditTimeline) return
                        if (!scrollRef.current) return
                        const rect = scrollRef.current.getBoundingClientRect()
                        const x = e.clientX - rect.left + scrollRef.current.scrollLeft
                        openCreateItem(track.id, dateForX(x), e.clientX, e.clientY)
                      }}>
                      {/* Month grid lines */}
                      {months.map((_, i) => (
                        <div key={i} style={{ left: i * monthWidth, width: monthWidth }}
                          className="absolute top-0 bottom-0 border-r border-gray-100" />
                      ))}
                      {/* Today line */}
                      <div className="absolute top-0 bottom-0 w-px bg-red-300 z-10"
                        style={{ left: xForDate(formatDate(now.getTime())) }} />

                      {/* Items */}
                      {track.items.map(item => {
                        const left = xForDate(item.start)
                        const width = Math.max(xForDate(item.end) - left, 36)
                        const docIds = normalizeDocIds(item)
                        return (
                          <div key={item.id}
                            className={`absolute h-8 rounded-md flex items-center px-2 text-white text-[11px] font-medium cursor-pointer group z-20 shadow-sm transition-opacity ${draggingItem === item.id ? "opacity-80" : "hover:opacity-90"}`}
                            style={{ left, width, background: track.color }}
                            onMouseEnter={e => setHoveredItem({ item, track, x: e.clientX, y: e.clientY })}
                            onMouseMove={e => setHoveredItem(prev => prev?.item.id === item.id ? { ...prev, x: e.clientX, y: e.clientY } : prev)}
                            onMouseLeave={() => setHoveredItem(prev => prev?.item.id === item.id ? null : prev)}
                            onClick={e => { e.stopPropagation(); if (canEditTimeline) openEditItem(track, item, e.clientX, e.clientY) }}
                          >
                            {canEditTimeline && (
                              <span onMouseDown={e => startResize(e, track.id, item, "start")}
                                className="absolute left-0 top-0 h-full w-2 cursor-ew-resize rounded-l-md bg-white/0 hover:bg-white/30" />
                            )}
                            <span className="truncate">{item.title}</span>
                            {docIds.length ? (
                              <span className="ml-1 opacity-75 text-[10px]">docs {docIds.length}</span>
                            ) : null}
                            {item.mentions?.length ? (
                              <span className="ml-1 opacity-75 text-[10px]">@{item.mentions[0]}{item.mentions.length > 1 ? `+${item.mentions.length-1}` : ""}</span>
                            ) : null}
                            {canEditTimeline && (
                              <span onMouseDown={e => startResize(e, track.id, item, "end")}
                                className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r-md bg-white/0 hover:bg-white/30" />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {hoveredItem && !timelineEditor && (
          <div className="fixed z-50 w-72 rounded-lg border bg-white p-3 text-xs shadow-xl pointer-events-none"
            style={floatingStyle(hoveredItem.x, hoveredItem.y, 288, 170)}>
            <p className="font-medium text-gray-900">{hoveredItem.item.title}</p>
            <p className="mt-1 text-gray-400">{hoveredItem.track.name} · {hoveredItem.item.start} to {hoveredItem.item.end}</p>
            {normalizeDocIds(hoveredItem.item).length > 0 && (
              <p className="mt-2 text-gray-500">{normalizeDocIds(hoveredItem.item).length} linked doc{normalizeDocIds(hoveredItem.item).length > 1 ? "s" : ""}</p>
            )}
            {hoveredItem.item.mentions?.length ? (
              <p className="mt-1 text-gray-500">{hoveredItem.item.mentions.map(m => m.startsWith("@") ? m : `@${m}`).join(", ")}</p>
            ) : null}
            {hoveredItem.item.note && <p className="mt-2 line-clamp-3 text-gray-500">{hoveredItem.item.note}</p>}
          </div>
        )}

        {timelineEditor && (
          <form onSubmit={saveTimelineItem}
            className="fixed z-50 w-[340px] rounded-xl border bg-white p-4 shadow-2xl"
            style={floatingStyle(timelineEditor.x, timelineEditor.y, 340, 470)}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{timelineEditor.mode === "create" ? "New timeline item" : "Edit timeline item"}</p>
                <p className="text-xs text-gray-400">{gantt.tracks.find(t => t.id === timelineEditor.trackId)?.name}</p>
              </div>
              <button type="button" onClick={() => setTimelineEditor(null)} className="rounded-md p-1 text-gray-400 hover:bg-gray-50 hover:text-black">
                <X size={14} />
              </button>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Title</span>
                <input autoFocus required value={timelineEditor.title}
                  onChange={e => setTimelineEditor({ ...timelineEditor, title: e.target.value })}
                  className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-black" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Start</span>
                  <input type="date" required value={timelineEditor.start}
                    onChange={e => setTimelineEditor({ ...timelineEditor, start: e.target.value })}
                    className="mt-1 w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-black" />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">End</span>
                  <input type="date" required value={timelineEditor.end}
                    onChange={e => setTimelineEditor({ ...timelineEditor, end: e.target.value })}
                    className="mt-1 w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-black" />
                </label>
              </div>
              <label className="block">
                <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Linked docs</span>
                <select multiple value={timelineEditor.doc_ids}
                  onChange={e => updateEditorMulti("doc_ids", Array.from(e.currentTarget.selectedOptions).map(option => option.value))}
                  className="mt-1 h-24 w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-black">
                  {docs.map(doc => <option key={doc.id} value={doc.id}>{doc.title}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">People</span>
                <select multiple value={timelineEditor.mentions}
                  onChange={e => updateEditorMulti("mentions", Array.from(e.currentTarget.selectedOptions).map(option => option.value))}
                  className="mt-1 h-24 w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-black">
                  {peopleOptions.map(person => <option key={person.value} value={person.value}>{person.label} {person.detail ? `· ${person.detail}` : ""}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Note</span>
                <textarea value={timelineEditor.note}
                  onChange={e => setTimelineEditor({ ...timelineEditor, note: e.target.value })}
                  className="mt-1 h-16 w-full resize-none rounded-lg border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-black" />
              </label>
            </div>
            <div className="mt-4 flex items-center justify-between">
              {timelineEditor.mode === "edit" && timelineEditor.itemId ? (
                <button type="button" onClick={() => deleteItem(timelineEditor.trackId, timelineEditor.itemId!)}
                  className="text-xs text-red-500 hover:text-red-600">Delete</button>
              ) : <span />}
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setTimelineEditor(null)}
                  className="rounded-lg border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">Cancel</button>
                <button type="submit" className="rounded-lg bg-black px-3 py-1.5 text-xs text-white">Save</button>
              </div>
            </div>
          </form>
        )}

        {/* ── Team ── */}
        <div className="border rounded-xl bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">Team access</h3>
              <p className="mt-0.5 text-xs text-gray-400">Invite people by email and control project permissions.</p>
            </div>
            {canManageTeam && (
              <button onClick={() => setAddingMember(v => !v)}
                className="inline-flex items-center gap-1.5 text-xs border rounded-lg px-2.5 py-1.5 text-gray-600 hover:bg-gray-50">
                <UserPlus size={13} /> Invite
              </button>
            )}
          </div>
          {addingMember && canManageTeam && (
            <form onSubmit={inviteMember} className="grid gap-2 border-b bg-gray-50 px-4 py-3 sm:grid-cols-[1fr_160px_auto]">
              <input value={memberForm.email} onChange={e => setMemberForm({ ...memberForm, email: e.target.value })}
                type="email" placeholder="teammate@lab.edu" required
                className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none" />
              <select value={memberForm.role} onChange={e => setMemberForm({ ...memberForm, role: e.target.value as ProjectMember["role"] })}
                className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none">
                <option value="member">Can edit</option>
                <option value="viewer">Read only</option>
                <option value="admin">Admin</option>
              </select>
              <button type="submit" className="rounded-lg bg-black px-3 py-1.5 text-xs text-white">Invite</button>
            </form>
          )}
          {teamMsg && <p className="border-b px-5 py-2 text-xs text-gray-500 whitespace-pre-line">{teamMsg}</p>}
          <div className="divide-y">
            {members.length === 0 ? (
              <p className="px-5 py-8 text-sm text-gray-400">No project members yet.</p>
            ) : members.map(member => (
              <div key={member.id} className="flex items-center gap-3 px-5 py-3">
                <div className={`w-8 h-8 rounded-full text-xs font-medium flex items-center justify-center flex-shrink-0 ${
                  member.status === "pending" ? "bg-blue-50 text-blue-600" : "bg-black text-white"
                }`}>
                  {member.status === "pending" ? <Mail size={14} /> : (member.name || member.email)[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium truncate">{member.name || member.email}</p>
                    {member.is_creator && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                        <Crown size={10} /> Creator
                      </span>
                    )}
                    {member.status === "pending" && (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                        Not registered
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 truncate">{member.email}</p>
                  <p className="mt-0.5 text-[11px] text-gray-400">{roleDescription(member.role)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {canManageTeam && !member.is_creator ? (
                    <select value={member.role} onChange={e => updateMemberRole(member, e.target.value as ProjectMember["role"])}
                      className="rounded-lg border px-2 py-1.5 text-xs text-gray-600">
                      <option value="member">Can edit</option>
                      <option value="viewer">Read only</option>
                      <option value="admin">Admin</option>
                    </select>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs text-gray-600">
                      <Shield size={12} /> {ROLE_LABELS[member.role]}
                    </span>
                  )}
                  {canManageTeam && !member.is_creator && (
                    <button onClick={() => removeProjectMember(member)} className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50"
                      title={member.status === "pending" ? "Cancel invitation" : "Remove member"}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

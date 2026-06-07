"use client"
import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ExternalLink, Plus, Trash2, X } from "lucide-react"
import { api } from "@/lib/api"
import type { Contact, Document } from "@/lib/types"

// ── Types ─────────────────────────────────────────────────────────────────────

interface GanttItem {
  id: string; title: string; start: string; end: string
  doc_id?: string; mentions?: string[]; note?: string
}
interface GanttTrack { id: string; name: string; color: string; items: GanttItem[] }
interface GanttMilestone { id: string; title: string; date: string; color: string }
interface GanttData { tracks: GanttTrack[]; milestones: GanttMilestone[] }

// ── Helpers ───────────────────────────────────────────────────────────────────

function toMs(iso: string) { return new Date(iso).getTime() }

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
// ── Main component ────────────────────────────────────────────────────────────

export default function HomePage() {
  const { id: projectId } = useParams<{ id: string }>()
  const router = useRouter()
  const [gantt, setGantt] = useState<GanttData>({ tracks: [], milestones: [] })
  const [contacts, setContacts] = useState<Contact[]>([])
  const [docs, setDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [addTrack, setAddTrack] = useState(false)
  const [trackName, setTrackName] = useState("")
  const [trackColor, setTrackColor] = useState(TRACK_COLORS[0])
  const [addingItem, setAddingItem] = useState<string | null>(null) // track id
  const [itemForm, setItemForm] = useState({ title: "", start: "", end: "", doc_id: "", mentions: "" })
  const [selectedItem, setSelectedItem] = useState<(GanttItem & { trackName: string; trackColor: string }) | null>(null)
  const [addingContact, setAddingContact] = useState(false)
  const [contactForm, setContactForm] = useState({ name: "", email: "", handle: "" })
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([
      api.get<GanttData>(`/api/projects/${projectId}/gantt`),
      api.get<Contact[]>(`/api/projects/${projectId}/contacts`).catch(() => [] as Contact[]),
      api.get<Document[]>(`/api/projects/${projectId}/docs`).catch(() => [] as Document[]),
    ]).then(([g, c, d]) => { setGantt(g); setContacts(c); setDocs(d) }).finally(() => setLoading(false))
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
  const MONTH_W = 100 // px per month

  function pct(iso: string) {
    return ((toMs(iso) - viewStart.getTime()) / totalMs) * (months.length * MONTH_W)
  }

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

  async function createItem(trackId: string, e: React.FormEvent) {
    e.preventDefault()
    const item = await api.post<GanttItem>(`/api/projects/${projectId}/gantt/tracks/${trackId}/items`, {
      ...itemForm,
      mentions: itemForm.mentions.split(",").map(s => s.trim().replace(/^@/, "")).filter(Boolean),
    })
    setGantt(g => ({
      ...g,
      tracks: g.tracks.map(t => t.id === trackId ? { ...t, items: [...t.items, item] } : t)
    }))
    setAddingItem(null); setItemForm({ title: "", start: "", end: "", doc_id: "", mentions: "" })
  }

  async function deleteItem(trackId: string, itemId: string) {
    await api.delete(`/api/projects/${projectId}/gantt/tracks/${trackId}/items/${itemId}`)
    setGantt(g => ({
      ...g,
      tracks: g.tracks.map(t => t.id === trackId ? { ...t, items: t.items.filter(i => i.id !== itemId) } : t)
    }))
    if (selectedItem?.id === itemId) setSelectedItem(null)
  }

  async function saveContact(e: React.FormEvent) {
    e.preventDefault()
    const c = await api.post<Contact>(`/api/projects/${projectId}/contacts`, contactForm)
    setContacts(prev => [...prev.filter(x => x.handle !== c.handle), c])
    setContactForm({ name: "", email: "", handle: "" })
    setAddingContact(false)
  }

  async function deleteContact(handle: string) {
    if (!confirm("Remove this contact?")) return
    await api.delete(`/api/projects/${projectId}/contacts/${handle}`)
    setContacts(prev => prev.filter(c => c.handle !== handle))
  }

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading…</div>

  const totalWidth = months.length * MONTH_W

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* ── Gantt Chart ── */}
        <div className="border rounded-xl bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b flex items-center justify-between">
            <h3 className="font-semibold text-sm">Project Timeline</h3>
            <button onClick={() => setAddTrack(v => !v)}
              className="inline-flex items-center gap-1 text-xs bg-black text-white px-3 py-1.5 rounded-lg">
              <Plus size={12} /> Add track
            </button>
          </div>

          {addTrack && (
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
                <div className="h-8 border-b bg-gray-50" />
                {gantt.tracks.map(track => (
                  <div key={track.id} className="group h-14 border-b px-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: track.color }} />
                      <span className="text-xs font-medium truncate">{track.name}</span>
                    </div>
                    <div className="hidden group-hover:flex items-center gap-1">
                      <button onClick={() => setAddingItem(track.id)} className="p-0.5 text-gray-400 hover:text-black"><Plus size={11} /></button>
                      <button onClick={() => deleteTrack(track.id)} className="p-0.5 text-gray-400 hover:text-red-500"><Trash2 size={11} /></button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Scrollable timeline */}
              <div className="flex-1 overflow-x-auto" ref={scrollRef}>
                <div style={{ width: totalWidth + "px", minWidth: "100%" }}>
                  {/* Month headers */}
                  <div className="h-8 border-b bg-gray-50 flex items-end">
                    {months.map((m, i) => (
                      <div key={i} style={{ width: MONTH_W + "px" }}
                        className="flex-shrink-0 px-2 pb-1 text-[10px] text-gray-500 font-medium border-r">
                        {m.label}
                      </div>
                    ))}
                  </div>

                  {/* Tracks */}
                  {gantt.tracks.map(track => (
                    <div key={track.id} className="h-14 border-b relative flex items-center">
                      {/* Month grid lines */}
                      {months.map((_, i) => (
                        <div key={i} style={{ left: i * MONTH_W, width: MONTH_W }}
                          className="absolute top-0 bottom-0 border-r border-gray-100" />
                      ))}
                      {/* Today line */}
                      <div className="absolute top-0 bottom-0 w-px bg-red-300 z-10"
                        style={{ left: pct(now.toISOString().split("T")[0]) }} />

                      {/* Items */}
                      {track.items.map(item => {
                        const left = pct(item.start)
                        const width = Math.max(pct(item.end) - left, 32)
                        return (
                          <div key={item.id}
                            className="absolute h-7 rounded-md flex items-center px-2 text-white text-[11px] font-medium cursor-pointer hover:opacity-90 group z-20 shadow-sm"
                            style={{ left, width, background: track.color }}
                            onClick={() => setSelectedItem({ ...item, trackName: track.name, trackColor: track.color })}
                            title={item.note || item.title}
                          >
                            <span className="truncate">{item.title}</span>
                            {item.mentions?.length ? (
                              <span className="ml-1 opacity-75 text-[10px]">@{item.mentions[0]}{item.mentions.length > 1 ? `+${item.mentions.length-1}` : ""}</span>
                            ) : null}
                            <button onClick={e => { e.stopPropagation(); deleteItem(track.id, item.id) }}
                              className="hidden group-hover:flex ml-1 opacity-75 hover:opacity-100">
                              <X size={10} />
                            </button>
                          </div>
                        )
                      })}

                      {/* Add item form */}
                      {addingItem === track.id && (
                        <form onSubmit={e => createItem(track.id, e)}
                          className="absolute left-0 right-0 top-0 bottom-0 bg-white z-30 flex items-center gap-2 px-3 border border-blue-300 rounded">
                          <input value={itemForm.title} onChange={e => setItemForm({...itemForm, title: e.target.value})}
                            placeholder="Title" required autoFocus
                            className="w-28 border rounded px-1.5 py-0.5 text-xs focus:outline-none" />
                          <input type="date" value={itemForm.start} onChange={e => setItemForm({...itemForm, start: e.target.value})} required
                            className="w-28 border rounded px-1.5 py-0.5 text-xs focus:outline-none" />
                          <input type="date" value={itemForm.end} onChange={e => setItemForm({...itemForm, end: e.target.value})} required
                            className="w-28 border rounded px-1.5 py-0.5 text-xs focus:outline-none" />
                          <select value={itemForm.doc_id} onChange={e => setItemForm({...itemForm, doc_id: e.target.value})}
                            className="w-36 border rounded px-1.5 py-0.5 text-xs focus:outline-none">
                            <option value="">No doc</option>
                            {docs.map(doc => <option key={doc.id} value={doc.id}>{doc.title}</option>)}
                          </select>
                          <select value={itemForm.mentions} onChange={e => setItemForm({...itemForm, mentions: e.target.value})}
                            className="w-32 border rounded px-1.5 py-0.5 text-xs focus:outline-none">
                            <option value="">No owner</option>
                            {contacts.map(c => <option key={c.handle} value={c.handle}>@{c.handle}</option>)}
                          </select>
                          <button type="submit" className="text-xs bg-black text-white px-2 py-1 rounded">Add</button>
                          <button type="button" onClick={() => setAddingItem(null)} className="text-gray-400"><X size={13} /></button>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {selectedItem && (
          <div className="border rounded-xl bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b flex items-center gap-3">
              <div className="h-2.5 w-2.5 rounded-full" style={{ background: selectedItem.trackColor }} />
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold">{selectedItem.title}</h3>
                <p className="text-xs text-gray-400">{selectedItem.trackName} · {selectedItem.start} to {selectedItem.end}</p>
              </div>
              <button onClick={() => setSelectedItem(null)} className="text-gray-400 hover:text-black"><X size={14} /></button>
            </div>
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Linked doc</p>
                {selectedItem.doc_id ? (() => {
                  const doc = docs.find(d => d.id === selectedItem.doc_id)
                  return (
                    <button onClick={() => router.push(`/projects/${projectId}/docs/${selectedItem.doc_id}`)}
                      className="mt-2 flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                      {doc?.title ?? selectedItem.doc_id} <ExternalLink size={12} />
                    </button>
                  )
                })() : <p className="mt-2 text-sm text-gray-400">No doc linked.</p>}
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">People</p>
                {selectedItem.mentions?.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedItem.mentions.map(handle => {
                      const c = contacts.find(item => item.handle === handle)
                      return <span key={handle} className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">@{c?.handle ?? handle}</span>
                    })}
                  </div>
                ) : <p className="mt-2 text-sm text-gray-400">No people linked.</p>}
              </div>
            </div>
          </div>
        )}

        {/* ── Team ── */}
        <div className="border rounded-xl bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b flex items-center justify-between">
            <h3 className="font-semibold text-sm">Team</h3>
            <button onClick={() => setAddingContact(v => !v)}
              className="inline-flex items-center gap-1 text-xs border rounded-lg px-2.5 py-1.5 text-gray-600 hover:bg-gray-50">
              <Plus size={12} /> Contact
            </button>
          </div>
          {addingContact && (
            <form onSubmit={saveContact} className="grid gap-2 border-b bg-gray-50 px-4 py-3 sm:grid-cols-[1fr_1fr_0.8fr_auto]">
              <input value={contactForm.name} onChange={e => setContactForm({ ...contactForm, name: e.target.value })}
                placeholder="Name" className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none" />
              <input value={contactForm.email} onChange={e => setContactForm({ ...contactForm, email: e.target.value })}
                placeholder="email@lab.edu" className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none" />
              <input value={contactForm.handle} onChange={e => setContactForm({ ...contactForm, handle: e.target.value })}
                placeholder="handle" required className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none" />
              <button type="submit" className="rounded-lg bg-black px-3 py-1.5 text-xs text-white">Save</button>
            </form>
          )}
          <div className="p-4 flex flex-wrap gap-3">
            {contacts.length === 0 ? (
              <p className="text-sm text-gray-400">No contacts yet.</p>
            ) : contacts.map(c => (
              <div key={c.handle} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                <div className="w-7 h-7 rounded-full bg-black text-white text-xs font-medium flex items-center justify-center flex-shrink-0">
                  {(c.name || c.handle)[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="text-xs font-medium">{c.name || c.handle}</p>
                  <p className="text-[10px] text-gray-400">@{c.handle}</p>
                </div>
                <button onClick={() => deleteContact(c.handle)} className="ml-1 text-gray-300 hover:text-red-500">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

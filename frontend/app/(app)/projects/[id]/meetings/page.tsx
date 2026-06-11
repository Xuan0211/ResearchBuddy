"use client"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { AlertTriangle, BookOpen, CalendarPlus, ChevronDown, ChevronRight, Download, ExternalLink, MapPin, Pencil, Plus, RefreshCw, Trash2, Users, X } from "lucide-react"
import { api } from "@/lib/api"
import type { Contact, Meeting, MeetingSettings } from "@/lib/types"
import DriveSyncControls from "@/components/DriveSyncControls"
import ModuleResourcesPanel from "@/components/ModuleResourcesPanel"

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

const DEFAULT_SETTINGS: MeetingSettings = {
  default_location: "",
  recurring_weekday: null,
  recurring_frequency: "weekly",
  recurring_time: "",
  recurring_duration_minutes: 60,
  default_attendees: [],
}

function pad(n: number) { return String(n).padStart(2, "0") }

function computeDefaultTimes(settings: MeetingSettings) {
  const now = new Date()
  if (settings.recurring_time) {
    const [h, m] = settings.recurring_time.split(":").map(Number)
    const totalEnd = h * 60 + m + (settings.recurring_duration_minutes || 60)
    return {
      start_time: settings.recurring_time,
      end_time: `${pad(Math.floor(totalEnd / 60) % 24)}:${pad(totalEnd % 60)}`,
    }
  }
  return {
    start_time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    end_time: `${pad((now.getHours() + 1) % 24)}:${pad(now.getMinutes())}`,
  }
}

export default function MeetingsPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const router = useRouter()
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [contactsOpen, setContactsOpen] = useState(false)
  const [showMeetingForm, setShowMeetingForm] = useState(false)
  const [addingContact, setAddingContact] = useState(false)
  const [editingContact, setEditingContact] = useState<string | null>(null)
  const [contactForm, setContactForm] = useState({ name: "", email: "", handle: "" })
  const [meetingForm, setMeetingForm] = useState({ date: "", title: "", start_time: "", end_time: "", location: "", attendees: "" })
  const [settings, setSettings] = useState<MeetingSettings>(DEFAULT_SETTINGS)
  const [settingsDraft, setSettingsDraft] = useState<MeetingSettings>(DEFAULT_SETTINGS)
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [nextMeetingDate, setNextMeetingDate] = useState<string | null>(null)
  const [syncingLog, setSyncingLog] = useState(false)
  const [syncingAll, setSyncingAll] = useState(false)
  const [syncSummary, setSyncSummary] = useState<string | null>(null)
  const [logLink, setLogLink] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.get<{ meetings: Meeting[]; next_meeting_date: string | null; settings: MeetingSettings }>(`/api/projects/${projectId}/meetings`),
      api.get<Contact[]>(`/api/projects/${projectId}/contacts`).catch(() => [] as Contact[]),
    ]).then(([res, ctcts]) => {
      setMeetings(res.meetings)
      setNextMeetingDate(res.next_meeting_date)
      setSettings(res.settings)
      setSettingsDraft(res.settings)
      setContacts(ctcts)
      if (ctcts.length > 0) setContactsOpen(true)
    }).finally(() => setLoading(false))
  }, [projectId])

  function openNewMeeting() {
    const today = new Date().toISOString().split("T")[0]
    const times = computeDefaultTimes(settings)
    const attendeesStr = settings.default_attendees?.length
      ? settings.default_attendees.map(h => h.startsWith("@") ? h : `@${h}`).join(", ")
      : ""
    setMeetingForm({
      date: nextMeetingDate || today,
      title: "",
      start_time: times.start_time,
      end_time: times.end_time,
      location: settings.default_location || "",
      attendees: attendeesStr,
    })
    setShowMeetingForm(true)
  }

  async function saveContact(e: React.FormEvent) {
    e.preventDefault()
    if (editingContact) {
      const updated = await api.put<Contact>(`/api/projects/${projectId}/contacts/${editingContact}`, contactForm)
      setContacts(prev => prev.map(c => c.handle === editingContact ? updated : c))
      setEditingContact(null)
    } else {
      const c = await api.post<Contact>(`/api/projects/${projectId}/contacts`, contactForm)
      setContacts(prev => [...prev.filter(x => x.handle !== c.handle), c])
      setAddingContact(false)
    }
    setContactForm({ name: "", email: "", handle: "" })
  }

  function startEdit(c: Contact) {
    setEditingContact(c.handle)
    setContactForm({ name: c.name, email: c.email, handle: c.handle })
    setAddingContact(false)
  }

  async function deleteContact(handle: string) {
    if (!confirm("Remove this contact?")) return
    await api.delete(`/api/projects/${projectId}/contacts/${handle}`)
    setContacts(prev => prev.filter(c => c.handle !== handle))
  }

  function patchDraft(patch: Partial<MeetingSettings>) {
    setSettingsDraft(prev => ({ ...prev, ...patch }))
    setSettingsDirty(true)
  }

  async function saveSettings() {
    setSavingSettings(true)
    try {
      await api.patch(`/api/projects/${projectId}/meetings/settings`, settingsDraft)
      setSettings(settingsDraft)
      setSettingsDirty(false)
      // Refresh next meeting date
      const res = await api.get<{ meetings: Meeting[]; next_meeting_date: string | null; settings: MeetingSettings }>(`/api/projects/${projectId}/meetings`)
      setNextMeetingDate(res.next_meeting_date)
    } finally {
      setSavingSettings(false)
    }
  }

  async function syncMtgLog() {
    setSyncingLog(true)
    try {
      const res = await api.post<{ drive_link: string; synced: number }>(`/api/projects/${projectId}/meetings/mtg-log/sync`)
      setLogLink(res.drive_link)
    } catch (err: any) { alert(err.message) }
    finally { setSyncingLog(false) }
  }

  async function smartSyncAllMeetings() {
    setSyncingAll(true)
    setSyncSummary(null)
    try {
      const res = await api.post<{ total: number; pushed: number; pulled: number; noop: number; failed: number }>(
        `/api/projects/${projectId}/meetings/smart-sync-all`, {}
      )
      setSyncSummary(`All meetings synced: ${res.pushed} pushed, ${res.pulled} pulled, ${res.noop} unchanged${res.failed ? `, ${res.failed} failed` : ""}.`)
      const updated = await api.get<{ meetings: Meeting[]; next_meeting_date: string | null; settings: MeetingSettings }>(
        `/api/projects/${projectId}/meetings`
      )
      setMeetings(updated.meetings)
      setNextMeetingDate(updated.next_meeting_date)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSyncingAll(false)
    }
  }

  async function createMeeting(e: React.FormEvent) {
    e.preventDefault()
    await api.post(`/api/projects/${projectId}/meetings`, {
      ...meetingForm,
      attendees: meetingForm.attendees.split(",").map(s => s.trim()).filter(Boolean),
    })
    setShowMeetingForm(false)
    const res = await api.get<{ meetings: Meeting[]; next_meeting_date: string | null; settings: MeetingSettings }>(`/api/projects/${projectId}/meetings`)
    setMeetings(res.meetings)
    setNextMeetingDate(res.next_meeting_date)
  }

  async function downloadIcs(m: Meeting) {
    const blob = await api.download(`/api/projects/${projectId}/meetings/${m.id}/ics`)
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([blob], { type: "text/calendar" }))
    a.download = `${m.id}.ics`
    a.click()
  }

  async function deleteMeeting(m: Meeting) {
    if (!confirm("Delete this meeting?")) return
    await api.delete(`/api/projects/${projectId}/meetings/${m.id}`)
    setMeetings(prev => prev.filter(item => item.id !== m.id))
  }

  const recurringLabel = (() => {
    if (settings.recurring_weekday === null) return null
    const freq = settings.recurring_frequency === "biweekly" ? "Every 2 weeks" : "Every week"
    const day = WEEKDAYS[settings.recurring_weekday]
    const time = settings.recurring_time ? ` · ${settings.recurring_time}` : ""
    return `${freq} · ${day}${time}`
  })()

  const ContactRow = ({ c }: { c: Contact }) => {
    const isEditing = editingContact === c.handle
    if (isEditing) {
      return (
        <form onSubmit={saveContact} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-blue-50">
          <input value={contactForm.name} onChange={e => setContactForm({ ...contactForm, name: e.target.value })}
            placeholder="Name" autoFocus
            className="flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" />
          <input value={contactForm.email} onChange={e => setContactForm({ ...contactForm, email: e.target.value })}
            placeholder="email@lab.edu"
            className="flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" />
          <input value={contactForm.handle} onChange={e => setContactForm({ ...contactForm, handle: e.target.value })}
            placeholder="@handle"
            className="w-28 border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" />
          <button type="submit" className="text-xs bg-black text-white px-2 py-1 rounded">Save</button>
          <button type="button" onClick={() => { setEditingContact(null); setContactForm({ name: "", email: "", handle: "" }) }}
            className="text-gray-400 hover:text-gray-700"><X size={13} /></button>
        </form>
      )
    }
    return (
      <div className="group flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-gray-50">
        <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-[10px] font-medium flex items-center justify-center flex-shrink-0">
          {(c.name || c.handle)[0]?.toUpperCase()}
        </div>
        <span className="text-xs font-medium text-gray-800 min-w-0 truncate">{c.name || c.handle}</span>
        <span className="text-[11px] font-mono text-gray-400">@{c.handle}</span>
        {c.email && <span className="text-[11px] text-gray-400 truncate">{c.email}</span>}
        <div className="ml-auto hidden group-hover:flex items-center gap-1">
          <button onClick={() => startEdit(c)} className="p-1 rounded text-gray-400 hover:text-gray-700"><Pencil size={12} /></button>
          <button onClick={() => deleteContact(c.handle)} className="p-1 rounded text-gray-400 hover:text-red-600"><Trash2 size={12} /></button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div>
        <h3 className="font-medium text-sm">Meetings</h3>
      </div>

      <ModuleResourcesPanel projectId={projectId} section="meetings" canEdit={true} />

      {/* ── Meeting Settings (permanent card) ── */}
      <div className="border border-gray-100 rounded-xl bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50">
          <p className="text-sm font-medium">Meeting defaults</p>
          {recurringLabel && (
            <p className="text-[11px] text-gray-400 mt-0.5">{recurringLabel}{nextMeetingDate ? ` · Next: ${nextMeetingDate}` : ""}</p>
          )}
        </div>
        <div className="px-4 py-3 space-y-3">
          {/* Recurring row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Recurring</label>
              <select
                value={settingsDraft.recurring_weekday === null ? "none" : settingsDraft.recurring_frequency}
                onChange={e => {
                  const v = e.target.value
                  if (v === "none") patchDraft({ recurring_weekday: null })
                  else patchDraft({ recurring_frequency: v, recurring_weekday: settingsDraft.recurring_weekday ?? 0 })
                }}
                className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none"
              >
                <option value="none">No recurring</option>
                <option value="weekly">Every week</option>
                <option value="biweekly">Every 2 weeks</option>
              </select>
            </div>
            {settingsDraft.recurring_weekday !== null && (
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Day</label>
                <select
                  value={settingsDraft.recurring_weekday}
                  onChange={e => patchDraft({ recurring_weekday: Number(e.target.value) })}
                  className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                >
                  {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
            )}
            {settingsDraft.recurring_weekday !== null && (
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Time</label>
                <input type="time" value={settingsDraft.recurring_time}
                  onChange={e => patchDraft({ recurring_time: e.target.value })}
                  className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none" />
              </div>
            )}
          </div>

          {/* Duration + Location row */}
          <div className="grid grid-cols-2 gap-3">
            {settingsDraft.recurring_weekday !== null && (
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Duration (min)</label>
                <input type="number" value={settingsDraft.recurring_duration_minutes} min={15} step={15}
                  onChange={e => patchDraft({ recurring_duration_minutes: Number(e.target.value) })}
                  className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none" />
              </div>
            )}
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1 flex items-center gap-1"><MapPin size={10} /> Default location</label>
              <input value={settingsDraft.default_location}
                onChange={e => patchDraft({ default_location: e.target.value })}
                placeholder="Zoom, Room 301…"
                className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none" />
            </div>
          </div>

          {/* Default attendees */}
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1.5 flex items-center gap-1"><Users size={10} /> Default attendees</label>
            <div className="flex flex-wrap gap-1.5">
              {contacts.map(c => {
                const selected = settingsDraft.default_attendees?.includes(c.handle)
                return (
                  <button
                    key={c.handle}
                    type="button"
                    onClick={() => {
                      const current = settingsDraft.default_attendees || []
                      patchDraft({
                        default_attendees: selected
                          ? current.filter(h => h !== c.handle)
                          : [...current, c.handle]
                      })
                    }}
                    className={`inline-flex items-center gap-1 text-[11px] rounded-full px-2.5 py-0.5 font-mono transition-colors ${
                      selected
                        ? "bg-black text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    @{c.handle}
                  </button>
                )
              })}
              {contacts.length === 0 && (
                <span className="text-[11px] text-gray-400">Add contacts in the Team section below</span>
              )}
            </div>
          </div>

          {settingsDirty && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={saveSettings}
                disabled={savingSettings}
                className="bg-black text-white text-xs px-3 py-1.5 rounded-lg disabled:opacity-50"
              >
                {savingSettings ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => { setSettingsDraft(settings); setSettingsDirty(false) }}
                className="text-xs text-gray-500 px-3"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Team / Contacts ── */}
      <div className="border border-gray-100 rounded-xl bg-white shadow-sm overflow-hidden">
        <button
          onClick={() => setContactsOpen(v => !v)}
          className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
        >
          {contactsOpen ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
          <span className="text-sm font-medium">Team</span>
          <span className="text-xs text-gray-400">{contacts.length} contacts</span>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setAddingContact(v => !v); setEditingContact(null); setContactsOpen(true) }}
            className="ml-auto inline-flex items-center gap-1 text-xs text-gray-500 hover:text-black px-2 py-0.5 border rounded-md"
          >
            <Plus size={11} /> Add
          </button>
        </button>

        {contactsOpen && (
          <div className="px-3 pb-3 space-y-0.5">
            {addingContact && (
              <form onSubmit={saveContact} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-blue-50 mb-1">
                <input value={contactForm.name} onChange={e => setContactForm({ ...contactForm, name: e.target.value })}
                  placeholder="Name" autoFocus
                  className="flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" />
                <input value={contactForm.email} onChange={e => setContactForm({ ...contactForm, email: e.target.value })}
                  placeholder="email@lab.edu"
                  className="flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" />
                <input value={contactForm.handle} onChange={e => setContactForm({ ...contactForm, handle: e.target.value })}
                  placeholder="@handle"
                  className="w-28 border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" />
                <button type="submit" className="text-xs bg-black text-white px-2 py-1 rounded">Save</button>
                <button type="button" onClick={() => setAddingContact(false)} className="text-gray-400 hover:text-gray-700"><X size={13} /></button>
              </form>
            )}
            {contacts.length === 0 && !addingContact ? (
              <p className="text-xs text-gray-400 px-2 py-2">No contacts yet.</p>
            ) : (
              contacts.map(c => <ContactRow key={c.handle} c={c} />)
            )}
          </div>
        )}
      </div>

      {/* ── Meeting timeline header ── */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm">Schedule</h3>
        <div className="flex items-center gap-2">
          {logLink && (
            <a href={logLink} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-green-600 border border-green-200 px-2 py-1.5 rounded-lg hover:bg-green-50">
              <BookOpen size={11} /> MTG Log ↗
            </a>
          )}
          <button onClick={syncMtgLog} disabled={syncingLog}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 border px-2 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={11} className={syncingLog ? "animate-spin" : ""} />
            {syncingLog ? "Syncing…" : "Sync Log"}
          </button>
          <button onClick={smartSyncAllMeetings} disabled={syncingAll}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 border px-2 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={11} className={syncingAll ? "animate-spin" : ""} />
            {syncingAll ? "Syncing all..." : "Smart sync all"}
          </button>
          <button onClick={openNewMeeting}
            className="inline-flex items-center gap-1.5 bg-black text-white text-xs px-3 py-1.5 rounded-lg">
            <CalendarPlus size={13} /> New meeting
          </button>
        </div>
      </div>

      {syncSummary && (
        <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">{syncSummary}</p>
      )}

      {/* ── New meeting form ── */}
      {showMeetingForm && (
        <form onSubmit={createMeeting} className="border border-gray-100 rounded-xl p-4 space-y-3 bg-white shadow-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Date</label>
              <input type="date" value={meetingForm.date} onChange={e => setMeetingForm({ ...meetingForm, date: e.target.value })}
                required className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-black" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Title</label>
              <input value={meetingForm.title} onChange={e => setMeetingForm({ ...meetingForm, title: e.target.value })}
                placeholder="Weekly sync" required
                className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-black" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Start</label>
              <input type="time" value={meetingForm.start_time} onChange={e => setMeetingForm({ ...meetingForm, start_time: e.target.value })}
                className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">End</label>
              <input type="time" value={meetingForm.end_time} onChange={e => setMeetingForm({ ...meetingForm, end_time: e.target.value })}
                className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Location</label>
              <input value={meetingForm.location} onChange={e => setMeetingForm({ ...meetingForm, location: e.target.value })}
                placeholder="Zoom, office…" className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Attendees</label>
              <input value={meetingForm.attendees} onChange={e => setMeetingForm({ ...meetingForm, attendees: e.target.value })}
                placeholder="@alice, @bob"
                className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none" />
            </div>
          </div>
          {contacts.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {contacts.map(c => (
                <button key={c.handle} type="button"
                  onClick={() => setMeetingForm(prev => {
                    const tag = `@${c.handle}`
                    if (prev.attendees.includes(tag)) return prev
                    return { ...prev, attendees: [prev.attendees, tag].filter(Boolean).join(", ") }
                  })}
                  className="text-[10px] rounded-full bg-gray-100 px-2 py-0.5 text-gray-600 hover:bg-gray-200 font-mono">
                  @{c.handle}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button type="submit" className="bg-black text-white text-xs px-4 py-2 rounded-lg">Create</button>
            <button type="button" onClick={() => setShowMeetingForm(false)} className="text-xs px-3 py-2 text-gray-500">Cancel</button>
          </div>
        </form>
      )}

      {/* ── Timeline ── */}
      {loading && meetings.length === 0 ? (
        <div className="text-sm text-gray-400 flex items-center gap-2"><RefreshCw size={13} className="animate-spin" /> Loading…</div>
      ) : meetings.length === 0 ? (
        <p className="text-sm text-gray-400">No meetings yet.</p>
      ) : (
        <div className="relative">
          {/* vertical line */}
          <div className="absolute left-[7px] top-3 bottom-3 w-px bg-gray-200" />
          <ul className="space-y-0">
            {meetings.map((m, idx) => {
              const isInvalid = !!(m._validation_errors?.length)
              const timeStr = [m.start_time, m.end_time].filter(Boolean).join("–")
              const meta = [timeStr, m.location].filter(Boolean).join(" · ")
              const attendeeStr = m.attendees?.length
                ? m.attendees.slice(0, 4).join(", ") + (m.attendees.length > 4 ? ` +${m.attendees.length - 4}` : "")
                : ""
              return (
                <li key={m._path ?? m.id ?? idx} className="relative flex gap-4 pb-5">
                  {/* dot */}
                  <div className="relative flex-shrink-0 mt-2.5">
                    <div className={`w-3.5 h-3.5 rounded-full bg-white border-2 z-10 relative ${isInvalid ? "border-amber-400" : "border-gray-300"}`} />
                  </div>

                  {isInvalid ? (
                    /* ── Invalid / malformed meeting file ── */
                    <div className="flex-1 border border-amber-200 rounded-xl px-4 py-3 bg-amber-50">
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-mono text-amber-700 truncate">{m._path ?? "unknown path"}</p>
                          <p className="text-xs font-semibold text-amber-800 mt-0.5">Invalid meeting file — cannot be opened</p>
                          <ul className="mt-1.5 space-y-0.5">
                            {m._validation_errors!.map((err, i) => (
                              <li key={i} className="text-[11px] text-amber-700">• {err}</li>
                            ))}
                          </ul>
                          <p className="text-[11px] text-amber-600 mt-2">
                            Fix the file, then refer to{" "}
                            <code className="font-mono bg-amber-100 px-0.5 rounded text-[10px]">meetings/mygdocs/README.md</code>{" "}
                            for the correct format.
                          </p>
                        </div>
                        <button
                          onClick={() => deleteMeeting(m)}
                          className="text-amber-300 hover:text-red-500 p-1 flex-shrink-0"
                          title="Delete this file"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── Normal valid meeting card ── */
                    <div
                      className="flex-1 border border-gray-100 rounded-xl px-4 py-3 bg-white shadow-sm hover:border-gray-200 hover:shadow cursor-pointer transition-all"
                      onClick={() => router.push(`/projects/${projectId}/meetings/${m.id}`)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[11px] font-mono text-gray-400">{m.date}</span>
                          </div>
                          <p className="font-medium text-sm truncate">{m.title}</p>
                          {(meta || attendeeStr) && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {[meta, attendeeStr].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                          <DriveSyncControls projectId={projectId} resource="meetings" itemId={m.id} />
                          {m.links?.outlook_calendar && (
                            <a href={m.links.outlook_calendar} target="_blank" rel="noreferrer"
                              className="text-xs text-blue-500 hover:text-blue-700">
                              <ExternalLink size={12} />
                            </a>
                          )}
                          <button onClick={() => downloadIcs(m)} className="text-gray-300 hover:text-gray-600 p-1"><Download size={12} /></button>
                          <button onClick={() => deleteMeeting(m)} className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={12} /></button>
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

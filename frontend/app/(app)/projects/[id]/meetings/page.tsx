"use client"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { CalendarPlus, ChevronDown, ChevronRight, Download, ExternalLink, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react"
import { api } from "@/lib/api"
import type { Contact, Meeting } from "@/lib/types"
import DriveSyncControls from "@/components/DriveSyncControls"

export default function MeetingsPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const router = useRouter()
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [contactsOpen, setContactsOpen] = useState(false)
  const [showMeetingForm, setShowMeetingForm] = useState(false)
  const [addingContact, setAddingContact] = useState(false)
  const [editingContact, setEditingContact] = useState<string | null>(null) // handle being edited
  const [contactForm, setContactForm] = useState({ name: "", email: "", handle: "" })
  const [meetingForm, setMeetingForm] = useState({ date: "", title: "", start_time: "", end_time: "", location: "", attendees: "" })

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.get<Meeting[]>(`/api/projects/${projectId}/meetings`),
      api.get<Contact[]>(`/api/projects/${projectId}/contacts`).catch(() => [] as Contact[]),
    ]).then(([mtgs, ctcts]) => {
      setMeetings(mtgs)
      setContacts(ctcts)
      if (ctcts.length > 0) setContactsOpen(true)
    }).finally(() => setLoading(false))
  }, [projectId])

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

  async function createMeeting(e: React.FormEvent) {
    e.preventDefault()
    await api.post(`/api/projects/${projectId}/meetings`, {
      ...meetingForm,
      attendees: meetingForm.attendees.split(",").map(s => s.trim()).filter(Boolean),
    })
    setShowMeetingForm(false)
    setMeetingForm({ date: "", title: "", start_time: "", end_time: "", location: "", attendees: "" })
    const updated = await api.get<Meeting[]>(`/api/projects/${projectId}/meetings`)
    setMeetings(updated)
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
    <div className="p-6 max-w-5xl space-y-5">
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

      {/* ── Meetings ── */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm">Meetings</h3>
        <button onClick={() => setShowMeetingForm(v => !v)}
          className="inline-flex items-center gap-1.5 bg-black text-white text-xs px-3 py-1.5 rounded-lg">
          <CalendarPlus size={13} /> New meeting
        </button>
      </div>

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
                  onClick={() => setMeetingForm(prev => ({ ...prev, attendees: [prev.attendees, `@${c.handle}`].filter(Boolean).join(", ") }))}
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

      {loading && meetings.length === 0 ? (
        <div className="text-sm text-gray-400 flex items-center gap-2"><RefreshCw size={13} className="animate-spin" /> Loading…</div>
      ) : meetings.length === 0 ? (
        <p className="text-sm text-gray-400">No meetings yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {meetings.map(m => (
            <li key={m.id}
              className="border border-gray-100 rounded-xl px-4 py-3 hover:bg-gray-50 cursor-pointer bg-white shadow-sm transition-colors"
              onClick={() => router.push(`/projects/${projectId}/meetings/${m.id}`)}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{m.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {[m.date, m.start_time, m.location].filter(Boolean).join(" · ")}
                    {m.attendees?.length ? ` · ${m.attendees.slice(0, 3).join(", ")}${m.attendees.length > 3 ? ` +${m.attendees.length - 3}` : ""}` : ""}
                  </p>
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
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

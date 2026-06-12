"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { Copy, Download, ExternalLink, Pencil, Plus, Share2, Trash2 } from "lucide-react"
import { api } from "@/lib/api"
import type { DocumentTab, Meeting } from "@/lib/types"
import DriveSyncControls from "@/components/DriveSyncControls"
import DocumentCommentsPanel from "@/components/DocumentCommentsPanel"

const NotionEditor = dynamic(() => import("@/components/editor/NotionEditor"), { ssr: false })

interface ShareState { enabled: boolean; token: string; url: string; created_at?: string }

export default function MeetingDetailPage() {
  const { id: projectId, mtgId } = useParams<{ id: string; mtgId: string }>()
  const router = useRouter()
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pullingDrive, setPullingDrive] = useState(false)
  const [share, setShare] = useState<ShareState | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareBusy, setShareBusy] = useState(false)
  const [titleDraft, setTitleDraft] = useState("")
  const [editingTitle, setEditingTitle] = useState(false)
  const [metaDraft, setMetaDraft] = useState({ date: "", start_time: "", end_time: "", location: "", attendees: "" })
  const [activeTabId, setActiveTabId] = useState("")
  // Inline tab name editing
  const [newTabInput, setNewTabInput] = useState("")
  const [addingTab, setAddingTab] = useState(false)
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState("")
  const newTabRef = useRef<HTMLInputElement>(null)
  const renameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([
      api.get<Meeting>(`/api/projects/${projectId}/meetings/${mtgId}`),
      api.get<ShareState>(`/api/projects/${projectId}/meetings/${mtgId}/share`).catch(() => null),
    ])
      .then(([m, shareState]) => {
        setMeeting(m)
        if (shareState) setShare(shareState)
        setTitleDraft(m.title)
        setMetaDraft({
          date: m.date ?? "",
          start_time: m.start_time ?? "",
          end_time: m.end_time ?? "",
          location: m.location ?? "",
          attendees: (m.attendees ?? []).join(", "),
        })
        setActiveTabId(m.tabs?.[0]?.id ?? "pre-meeting")
      })
      .finally(() => setLoading(false))
  }, [projectId, mtgId])

  function localShareUrl(next = share) {
    if (!next?.token) return ""
    if (next.url) return next.url
    if (typeof window === "undefined") return ""
    return `${window.location.origin}/share/docs/${next.token}`
  }

  async function createShareLink() {
    setShareBusy(true)
    try {
      const res = await api.post<ShareState>(`/api/projects/${projectId}/meetings/${mtgId}/share`, {})
      setShare(res)
      setShareOpen(true)
    } finally {
      setShareBusy(false)
    }
  }

  async function disableShareLink() {
    if (!confirm("Disable this public share link?")) return
    setShareBusy(true)
    try {
      const res = await api.delete<ShareState>(`/api/projects/${projectId}/meetings/${mtgId}/share`)
      setShare(res)
    } finally {
      setShareBusy(false)
    }
  }

  async function copyShareLink() {
    const url = localShareUrl()
    if (!url) return
    await navigator.clipboard.writeText(url)
  }

  const saveContent = useCallback(async (content: string) => {
    setSaving(true)
    try {
      await api.patch(`/api/projects/${projectId}/meetings/${mtgId}`, { content, tab_id: activeTabId })
      setMeeting(prev => prev ? {
        ...prev,
        tabs: (prev.tabs ?? []).map(tab => tab.id === activeTabId ? { ...tab, content } : tab),
      } : prev)
      setSaved(true)
      setTimeout(() => setSaved(false), 1600)
    } finally {
      setSaving(false)
    }
  }, [projectId, mtgId, activeTabId])

  async function saveTitle() {
    if (!meeting || titleDraft === meeting.title) { setEditingTitle(false); return }
    await api.patch(`/api/projects/${projectId}/meetings/${mtgId}`, { title: titleDraft })
    setMeeting(prev => prev ? { ...prev, title: titleDraft } : prev)
    setEditingTitle(false)
  }

  async function saveMeta() {
    const attendees = metaDraft.attendees.split(",").map(s => s.trim()).filter(Boolean)
    await api.patch(`/api/projects/${projectId}/meetings/${mtgId}`, { ...metaDraft, attendees })
    const updated = await api.get<Meeting>(`/api/projects/${projectId}/meetings/${mtgId}`)
    setMeeting(updated)
  }

  async function downloadIcs() {
    const blob = await api.download(`/api/projects/${projectId}/meetings/${mtgId}/ics`)
    const url = URL.createObjectURL(new Blob([blob], { type: "text/calendar" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `${mtgId}.ics`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function pullFromDrive() {
    setPullingDrive(true)
    try {
      await api.post(`/api/projects/${projectId}/meetings/${mtgId}/pull-from-drive`)
      const updated = await api.get<Meeting>(`/api/projects/${projectId}/meetings/${mtgId}`)
      setMeeting(updated)
      setActiveTabId(updated.tabs?.[0]?.id ?? "pre-meeting")
    } catch (err: any) {
      alert(err.message)
    } finally {
      setPullingDrive(false)
    }
  }

  async function deleteMeeting() {
    if (!confirm("Delete this meeting and move its linked Drive file to trash?")) return
    await api.delete(`/api/projects/${projectId}/meetings/${mtgId}`)
    router.push(`/projects/${projectId}/meetings`)
  }

  async function commitAddTab() {
    const title = newTabInput.trim()
    if (!title) { setAddingTab(false); return }
    const res = await api.post<{ tabs: DocumentTab[] }>(`/api/projects/${projectId}/meetings/${mtgId}/tabs`, {
      title,
    })
    setMeeting(prev => prev ? { ...prev, tabs: res.tabs } : prev)
    setActiveTabId(res.tabs.at(-1)?.id ?? activeTabId)
    setNewTabInput("")
    setAddingTab(false)
  }

  async function commitRenameTab(tab: DocumentTab) {
    const title = renameDraft.trim()
    setRenamingTabId(null)
    if (!title || title === tab.title) return
    const res = await api.patch<{ tabs: DocumentTab[] }>(
      `/api/projects/${projectId}/meetings/${mtgId}/tabs/${tab.id}`,
      { title },
    )
    setMeeting(prev => prev ? { ...prev, tabs: res.tabs } : prev)
  }

  async function deleteTab(tab: DocumentTab) {
    if ((meeting?.tabs?.length ?? 0) <= 1) return alert("A meeting document needs at least one tab.")
    if (!confirm(`Delete tab "${tab.title}"?`)) return
    await api.delete(`/api/projects/${projectId}/meetings/${mtgId}/tabs/${tab.id}`)
    const updated = await api.get<Meeting>(`/api/projects/${projectId}/meetings/${mtgId}`)
    setMeeting(updated)
    setActiveTabId(updated.tabs?.[0]?.id ?? "pre-meeting")
  }

  const addTab = () => { setAddingTab(true); setTimeout(() => newTabRef.current?.focus(), 50) }
  const renameTab = (tab: DocumentTab) => { setRenamingTabId(tab.id); setRenameDraft(tab.title); setTimeout(() => renameRef.current?.focus(), 50) }

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading meeting…</div>
  if (!meeting) return <div className="p-8 text-sm text-red-500">Meeting not found</div>
  const tabs = meeting.tabs?.length ? meeting.tabs : [{ id: "pre-meeting", title: "Pre-meeting", content: meeting._body ?? "" }]
  const activeTab = tabs.find(tab => tab.id === activeTabId) ?? tabs[0]

  return (
    <div className="flex h-full overflow-hidden bg-white">
      <aside className="w-72 border-r p-4 space-y-4 overflow-y-auto">
        <button onClick={() => router.back()} className="text-xs text-gray-400 hover:text-black">← Back</button>
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-500">Meeting fields</label>
          <input type="date" value={metaDraft.date} onChange={e => setMetaDraft({ ...metaDraft, date: e.target.value })}
            className="w-full border rounded-md px-2 py-1.5 text-xs" />
          <div className="grid grid-cols-2 gap-2">
            <input type="time" value={metaDraft.start_time} onChange={e => setMetaDraft({ ...metaDraft, start_time: e.target.value })}
              className="border rounded-md px-2 py-1.5 text-xs" />
            <input type="time" value={metaDraft.end_time} onChange={e => setMetaDraft({ ...metaDraft, end_time: e.target.value })}
              className="border rounded-md px-2 py-1.5 text-xs" />
          </div>
          <input value={metaDraft.location} onChange={e => setMetaDraft({ ...metaDraft, location: e.target.value })}
            placeholder="Location / Teams / Zoom"
            className="w-full border rounded-md px-2 py-1.5 text-xs" />
          <input value={metaDraft.attendees} onChange={e => setMetaDraft({ ...metaDraft, attendees: e.target.value })}
            placeholder="@alice, bob@lab.edu"
            className="w-full border rounded-md px-2 py-1.5 text-xs" />
          <button onClick={saveMeta} className="w-full text-xs bg-black text-white rounded-md px-2 py-1.5">Save fields</button>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500">Sync</p>
          <DriveSyncControls projectId={projectId} resource="meetings" itemId={mtgId} />
          {meeting.links?.outlook_calendar && (
            <a href={meeting.links.outlook_calendar} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
              Outlook <ExternalLink size={10} />
            </a>
          )}
          <button onClick={downloadIcs} className="flex items-center gap-1 text-xs text-gray-500 hover:text-black">
            <Download size={11} /> Download .ics
          </button>
          <div className="space-y-1.5 rounded-md border px-2 py-2">
            <button
              onClick={() => {
                setShareOpen(v => !v)
                if (!share?.enabled) createShareLink()
              }}
              disabled={shareBusy}
              className="flex items-center gap-1 text-xs text-gray-600 hover:text-black disabled:opacity-50"
            >
              <Share2 size={11} /> {share?.enabled ? "Share meeting doc" : shareBusy ? "Creating..." : "Create share link"}
            </button>
            {shareOpen && (
              <div className="space-y-1">
                {share?.enabled ? (
                  <>
                    <div className="rounded bg-gray-50 px-2 py-1 text-[10px] text-gray-500 break-all">{localShareUrl()}</div>
                    <div className="flex gap-2">
                      <button onClick={copyShareLink} className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-black"><Copy size={10}/>Copy</button>
                      <button onClick={disableShareLink} disabled={shareBusy} className="text-[11px] text-red-500 hover:text-red-700 disabled:opacity-50">Disable</button>
                    </div>
                  </>
                ) : (
                  <button onClick={createShareLink} disabled={shareBusy} className="text-[11px] text-gray-500 hover:text-black disabled:opacity-50">Create public link</button>
                )}
              </div>
            )}
          </div>
          <button onClick={pullFromDrive} disabled={pullingDrive}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-black disabled:opacity-50">
            <Download size={11} /> {pullingDrive ? "Pulling…" : "Pull from Drive"}
          </button>
          <button onClick={deleteMeeting} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
            <Trash2 size={11} /> Delete meeting
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b px-6 py-3 flex items-center gap-3">
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setEditingTitle(false) }}
              className="flex-1 text-base font-semibold focus:outline-none border-b border-black"
            />
          ) : (
            <h1 onClick={() => setEditingTitle(true)}
              className="flex-1 text-base font-semibold cursor-pointer hover:text-gray-600">
              {meeting.title}
            </h1>
          )}
          <span className="text-xs text-gray-400">{saving ? "Saving…" : saved ? "✓ Saved" : ""}</span>
        </div>
        <div className="border-b bg-white px-6 py-2 flex items-center gap-1 overflow-x-auto">
          {tabs.map(tab => (
            <div key={tab.id} className="group inline-flex items-center">
              {renamingTabId === tab.id ? (
                <input
                  ref={renameRef}
                  value={renameDraft}
                  onChange={e => setRenameDraft(e.target.value)}
                  onBlur={() => commitRenameTab(tab)}
                  onKeyDown={e => {
                    if (e.key === "Enter") commitRenameTab(tab)
                    if (e.key === "Escape") setRenamingTabId(null)
                  }}
                  className="rounded-md border border-black px-2 py-1 text-xs w-28 outline-none"
                />
              ) : (
                <button
                  onClick={() => setActiveTabId(tab.id)}
                  onDoubleClick={() => renameTab(tab)}
                  className={`rounded-md px-3 py-1.5 text-xs whitespace-nowrap ${
                    activeTab.id === tab.id ? "bg-black text-white" : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {tab.title}
                </button>
              )}
              {activeTab.id === tab.id && renamingTabId !== tab.id && (
                <div className="ml-0.5 hidden items-center gap-0.5 group-hover:inline-flex">
                  <button onClick={() => renameTab(tab)}
                    className="rounded p-1 text-gray-300 hover:text-gray-600">
                    <Pencil size={10} />
                  </button>
                  {tabs.length > 1 && (
                    <button onClick={() => deleteTab(tab)}
                      className="rounded p-1 text-gray-300 hover:text-red-600">
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          {addingTab ? (
            <input
              ref={newTabRef}
              value={newTabInput}
              onChange={e => setNewTabInput(e.target.value)}
              onBlur={commitAddTab}
              onKeyDown={e => {
                if (e.key === "Enter") commitAddTab()
                if (e.key === "Escape") { setAddingTab(false); setNewTabInput("") }
              }}
              placeholder="Tab title"
              className="rounded-md border border-black px-2 py-1 text-xs w-24 outline-none"
            />
          ) : (
            <button onClick={addTab}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100">
              <Plus size={12} /> Tab
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          <NotionEditor
            key={activeTab.id}
            content={activeTab.content ?? ""}
            onSave={saveContent}
            placeholder={`${activeTab.title}…`}
            projectId={projectId}
          />
        </div>
      </main>
      <DocumentCommentsPanel projectId={projectId} resource="meetings" itemId={mtgId} />
    </div>
  )
}

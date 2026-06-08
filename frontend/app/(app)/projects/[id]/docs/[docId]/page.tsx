"use client"
import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { ArrowDown, ArrowUp, Check, Copy, Download, Plus, RefreshCw, Share2, Trash2, X } from "lucide-react"
import { api } from "@/lib/api"
import type { Document, DocumentTab, Paper } from "@/lib/types"

const NotionEditor = dynamic(() => import("@/components/editor/NotionEditor"), { ssr: false })

type ShareState = {
  enabled: boolean
  token: string
  url: string
}

export default function DocDetailPage() {
  const { id: projectId, docId } = useParams<{ id: string; docId: string }>()
  const router = useRouter()
  const [doc, setDoc] = useState<Document & { _body?: string } | null>(null)
  const [cited, setCited] = useState<Paper[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMessage, setLoadingMessage] = useState("Loading…")
  const [saveStatus, setSaveStatus] = useState<"" | "saving" | "saved">("")
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState("")
  const [driveLink, setDriveLink] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncDir, setSyncDir] = useState<"push" | "pull" | null>(null)
  const [pullingDrive, setPullingDrive] = useState(false)
  const [driveMode, setDriveMode] = useState<"mapped" | "new" | "existing">("mapped")
  const [driveTarget, setDriveTarget] = useState("")
  const [activeTabId, setActiveTabId] = useState("")
  const [share, setShare] = useState<ShareState | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareBusy, setShareBusy] = useState(false)
  const [copiedShare, setCopiedShare] = useState(false)

  function localShareUrl(next: ShareState | null) {
    if (!next?.token) return ""
    if (typeof window === "undefined") return next.url
    return `${window.location.origin}/share/docs/${next.token}`
  }

  useEffect(() => {
    let cancelled = false

    async function loadDoc() {
      setLoading(true)
      setLoadingMessage("Loading…")
      try {
        const [initialDoc, ctx, driveRes, shareRes] = await Promise.all([
          api.get<Document & { _body: string }>(`/api/projects/${projectId}/docs/${docId}`),
          api.get<{ document: Document & { _body: string }; cited_papers: Paper[] }>(
            `/api/projects/${projectId}/docs/${docId}/context`
          ).catch(() => null),
          api.get<{ drive_link: string | null }>(`/api/projects/${projectId}/docs/${docId}/drive-link`).catch(() => null),
          api.get<ShareState>(`/api/projects/${projectId}/docs/${docId}/share`).catch(() => null),
        ])

        let nextDoc = initialDoc
        let nextDriveLink = driveRes?.drive_link ?? null
        if (nextDriveLink) {
          setLoadingMessage("Checking Google Drive…")
          try {
            const res = await api.post<{ direction: "push" | "pull" | "noop"; drive_link?: string }>(
              `/api/projects/${projectId}/docs/${docId}/smart-sync`,
              {},
            )
            if (res.direction === "pull") {
              nextDoc = await api.get<Document & { _body: string }>(`/api/projects/${projectId}/docs/${docId}`)
            }
            if (res.drive_link) nextDriveLink = res.drive_link
            if (res.direction === "push" || res.direction === "pull") {
              setSyncDir(res.direction)
              setTimeout(() => setSyncDir(null), 3000)
            }
          } catch (err: any) {
            alert(err.message)
          }
        }

        if (cancelled) return
        setDoc(nextDoc)
        setTitleDraft(nextDoc.title)
        setActiveTabId(nextDoc.tabs?.[0]?.id ?? "main")
        setDriveLink(nextDriveLink)
        if (shareRes) setShare(shareRes)
        if (ctx) setCited(ctx.cited_papers)
      } catch (err: any) {
        if (!cancelled) alert(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadDoc()
    return () => { cancelled = true }
  }, [projectId, docId])

  const handleSave = useCallback(async (content: string) => {
    setSaveStatus("saving")
    try {
      await api.patch(`/api/projects/${projectId}/docs/${docId}`, { content, tab_id: activeTabId })
      setDoc(prev => prev ? {
        ...prev,
        tabs: (prev.tabs ?? []).map(tab => tab.id === activeTabId ? { ...tab, content } : tab),
      } : prev)
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus(""), 2000)
    } catch {
      setSaveStatus("")
    }
  }, [projectId, docId, activeTabId])

  async function saveTitle() {
    if (!doc || titleDraft === doc.title) { setEditingTitle(false); return }
    await api.patch(`/api/projects/${projectId}/docs/${docId}`, { title: titleDraft })
    setDoc(prev => prev ? { ...prev, title: titleDraft } : prev)
    setEditingTitle(false)
  }

  async function syncToDrive() {
    setSyncing(true)
    setSyncDir(null)
    try {
      if (driveMode === "mapped") {
        const res = await api.post<{ direction: "push" | "pull" | "noop"; drive_link?: string }>(
          `/api/projects/${projectId}/docs/${docId}/smart-sync`, {}
        )
        if (res.direction === "push" || res.direction === "pull") {
          setSyncDir(res.direction)
          setTimeout(() => setSyncDir(null), 3000)
        }
        if (res.direction === "pull") {
          const updated = await api.get<Document & { _body: string }>(`/api/projects/${projectId}/docs/${docId}`)
          setDoc(updated)
          setActiveTabId(updated.tabs?.[0]?.id ?? "main")
        } else if (res.drive_link) {
          setDriveLink(res.drive_link)
        }
      } else {
        const res = await api.post<{ drive_link: string }>(`/api/projects/${projectId}/docs/${docId}/sync-to-drive`, {
          mode: driveMode, drive_url: driveTarget,
        })
        setDriveLink(res.drive_link)
        setSyncDir("push")
        setTimeout(() => setSyncDir(null), 3000)
        setDriveMode("mapped")
        setDriveTarget("")
      }
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSyncing(false)
    }
  }

  async function pullFromDrive() {
    setPullingDrive(true)
    try {
      await api.post(`/api/projects/${projectId}/docs/${docId}/pull-from-drive`)
      const updated = await api.get<Document & { _body: string }>(`/api/projects/${projectId}/docs/${docId}`)
      setDoc(updated)
      setActiveTabId(updated.tabs?.[0]?.id ?? "main")
    } catch (err: any) {
      alert(err.message)
    } finally {
      setPullingDrive(false)
    }
  }

  async function deleteDoc() {
    if (!confirm("Delete this document and move its linked Drive file to trash?")) return
    await api.delete(`/api/projects/${projectId}/docs/${docId}`)
    router.push(`/projects/${projectId}/docs`)
  }

  async function createShareLink() {
    setShareBusy(true)
    try {
      const res = await api.post<ShareState>(`/api/projects/${projectId}/docs/${docId}/share`, {})
      setShare(res)
      setShareOpen(true)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setShareBusy(false)
    }
  }

  async function disableShareLink() {
    if (!confirm("Disable this public share link?")) return
    setShareBusy(true)
    try {
      const res = await api.delete<ShareState>(`/api/projects/${projectId}/docs/${docId}/share`)
      setShare(res)
      setCopiedShare(false)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setShareBusy(false)
    }
  }

  async function copyShareLink() {
    const url = localShareUrl(share)
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopiedShare(true)
    setTimeout(() => setCopiedShare(false), 1800)
  }

  async function exportMarkdown() {
    if (!doc) return
    const content = `---\ntitle: ${doc.title}\n---\n\n${doc._body ?? ""}`
    const blob = new Blob([content], { type: "text/markdown" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `${docId}.md`
    a.click()
  }

  async function addTab() {
    const title = prompt("Tab title")
    if (!title?.trim()) return
    const res = await api.post<{ tabs: DocumentTab[] }>(`/api/projects/${projectId}/docs/${docId}/tabs`, {
      title: title.trim(),
    })
    setDoc(prev => prev ? { ...prev, tabs: res.tabs } : prev)
    setActiveTabId(res.tabs.at(-1)?.id ?? activeTabId)
  }

  async function renameTab(tab: DocumentTab) {
    const title = prompt("Tab title", tab.title)
    if (!title?.trim() || title === tab.title) return
    const res = await api.patch<{ tabs: DocumentTab[] }>(
      `/api/projects/${projectId}/docs/${docId}/tabs/${tab.id}`,
      { title: title.trim() },
    )
    setDoc(prev => prev ? { ...prev, tabs: res.tabs } : prev)
  }

  async function deleteTab(tab: DocumentTab) {
    if ((doc?.tabs?.length ?? 0) <= 1) return alert("A document needs at least one tab.")
    if (!confirm(`Delete tab "${tab.title}"?`)) return
    await api.delete(`/api/projects/${projectId}/docs/${docId}/tabs/${tab.id}`)
    const updated = await api.get<Document & { _body: string }>(`/api/projects/${projectId}/docs/${docId}`)
    setDoc(updated)
    setActiveTabId(updated.tabs?.[0]?.id ?? "main")
  }

  if (loading) return <div className="p-8 text-sm text-gray-500">{loadingMessage}</div>
  if (!doc) return <div className="p-8 text-sm text-red-500">Document not found</div>
  const tabs = doc.tabs?.length ? doc.tabs : [{ id: "main", title: "Main", content: doc._body ?? "" }]
  const activeTab = tabs.find(tab => tab.id === activeTabId) ?? tabs[0]

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Main editor ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Doc header */}
        <div className="border-b px-6 py-3 flex items-center gap-3 flex-shrink-0 bg-white">
          <button onClick={() => router.back()} className="text-xs text-gray-400 hover:text-black">←</button>
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
            <h1 className="flex-1 text-base font-semibold cursor-pointer hover:text-gray-600"
              onClick={() => setEditingTitle(true)}>
              {doc.title}
            </h1>
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">
              {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "✓ Saved" : ""}
            </span>
            {driveLink ? (
              <a href={driveLink} target="_blank" rel="noreferrer"
                className="text-xs text-green-600 hover:underline px-2 py-1 border border-green-200 rounded-lg">
                ✓ Drive ↗
              </a>
            ) : null}
            <select value={driveMode} onChange={e => setDriveMode(e.target.value as any)}
              className="text-xs border rounded-lg px-2 py-1 text-gray-600">
              <option value="mapped">Drive: linked/new</option>
              <option value="new">Drive: new doc</option>
              <option value="existing">Drive: existing link</option>
            </select>
            {driveMode === "existing" && (
              <input value={driveTarget} onChange={e => setDriveTarget(e.target.value)}
                placeholder="Drive/Docs URL"
                className="w-40 text-xs border rounded-lg px-2 py-1 focus:outline-none" />
            )}
            <button onClick={syncToDrive} disabled={syncing}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-black px-2 py-1 border rounded-lg disabled:opacity-50">
              {syncing
                ? <RefreshCw size={11} className="animate-spin" />
                : syncDir === "push" ? <ArrowUp size={11} />
                : syncDir === "pull" ? <ArrowDown size={11} />
                : <RefreshCw size={11} />}
              {syncing ? "Syncing…" : syncDir === "pull" ? "Pulled" : syncDir === "push" ? "Pushed" : "Sync"}
            </button>
            {driveLink && (
              <button onClick={pullFromDrive} disabled={pullingDrive}
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-black px-2 py-1 border rounded-lg disabled:opacity-50">
                <Download size={11} /> {pullingDrive ? "Pulling…" : "Pull"}
              </button>
            )}
            <div className="relative">
              <button
                onClick={() => {
                  setShareOpen(v => !v)
                  if (!share?.enabled) createShareLink()
                }}
                disabled={shareBusy}
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-black px-2 py-1 border rounded-lg disabled:opacity-50"
              >
                <Share2 size={11} /> Share
              </button>
              {shareOpen && (
                <div className="absolute right-0 top-8 z-30 w-80 rounded-xl border bg-white p-3 shadow-xl">
                  <div className="mb-2 flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-gray-800">Public document link</p>
                      <p className="mt-0.5 text-[11px] leading-4 text-gray-400">
                        Anyone with this link can view this document without logging in.
                      </p>
                    </div>
                    <button onClick={() => setShareOpen(false)} className="p-1 text-gray-300 hover:text-black">
                      <X size={13} />
                    </button>
                  </div>
                  {share?.enabled ? (
                    <div className="space-y-2">
                      <div className="rounded-lg border bg-gray-50 px-2 py-1.5 text-[11px] text-gray-600 truncate">
                        {localShareUrl(share)}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <button
                          onClick={copyShareLink}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-black px-3 py-1.5 text-xs text-white"
                        >
                          {copiedShare ? <Check size={12} /> : <Copy size={12} />}
                          {copiedShare ? "Copied" : "Copy link"}
                        </button>
                        <button
                          onClick={disableShareLink}
                          disabled={shareBusy}
                          className="rounded-lg border px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 disabled:opacity-50"
                        >
                          Disable
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={createShareLink}
                      disabled={shareBusy}
                      className="rounded-lg bg-black px-3 py-1.5 text-xs text-white disabled:opacity-50"
                    >
                      {shareBusy ? "Creating…" : "Create share link"}
                    </button>
                  )}
                </div>
              )}
            </div>
            <button onClick={deleteDoc}
              className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-2 py-1 border border-red-100 rounded-lg">
              <Trash2 size={11} /> Delete
            </button>
            <button onClick={exportMarkdown}
              className="text-xs text-gray-400 hover:text-black px-2 py-1 border rounded-lg">
              ↓ .md
            </button>
          </div>
        </div>

        <div className="border-b bg-white px-6 py-2 flex items-center gap-1 overflow-x-auto">
          {tabs.map(tab => (
            <div key={tab.id} className="group inline-flex items-center">
              <button
                onClick={() => setActiveTabId(tab.id)}
                onDoubleClick={() => renameTab(tab)}
                className={`rounded-md px-3 py-1.5 text-xs whitespace-nowrap ${
                  activeTab.id === tab.id ? "bg-black text-white" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {tab.title}
              </button>
              {tabs.length > 1 && activeTab.id === tab.id && (
                <button onClick={() => deleteTab(tab)}
                  className="ml-1 hidden rounded p-1 text-gray-300 hover:text-red-600 group-hover:inline-flex">
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          ))}
          <button onClick={addTab}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100">
            <Plus size={12} /> Tab
          </button>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-y-auto">
          <NotionEditor
            key={activeTab.id}
            content={activeTab.content ?? ""}
            onSave={handleSave}
            placeholder={`${activeTab.title}… Type [[ to cite papers.`}
            projectId={projectId}
          />
        </div>
      </div>

      {/* ── Right: cited papers ── */}
      {cited.length > 0 && (
        <div className="w-64 border-l bg-gray-50 overflow-y-auto flex-shrink-0">
          <div className="p-3 border-b">
            <p className="text-xs font-medium text-gray-600">Cited papers ({cited.length})</p>
          </div>
          <ul className="p-2 space-y-1">
            {cited.map(p => (
              <li key={p.id}>
                <button
                  onClick={() => router.push(`/projects/${projectId}/papers/${p.id}`)}
                  className="w-full text-left p-2 rounded-lg hover:bg-white text-xs space-y-0.5"
                >
                  <p className="font-medium line-clamp-2 leading-tight">{p.title}</p>
                  <p className="text-gray-500">{p.authors?.[0]?.split(",")[0]} {p.year ? `· ${p.year}` : ""}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

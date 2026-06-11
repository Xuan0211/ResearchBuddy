"use client"
import { useEffect, useState, useCallback, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { api } from "@/lib/api"
import type { Paper } from "@/lib/types"
import DocumentCommentsPanel from "@/components/DocumentCommentsPanel"

const NotionEditor = dynamic(() => import("@/components/editor/NotionEditor"), { ssr: false })

interface DocRef { id: string; title: string }

export default function PaperDetailPage() {
  const { id: projectId, paperId } = useParams<{ id: string; paperId: string }>()
  const router = useRouter()
  const [paper, setPaper] = useState<Paper | null>(null)
  const [notes, setNotes] = useState("")
  const [refs, setRefs] = useState<DocRef[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [syncingZotero, setSyncingZotero] = useState(false)
  const [zoteroMsg, setZoteroMsg] = useState("")
  const [syncingDrive, setSyncingDrive] = useState(false)
  const [driveLink, setDriveLink] = useState<string | null>(null)
  // Tag editing
  const [newTag, setNewTag] = useState("")
  const [addingTag, setAddingTag] = useState(false)

  const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

  useEffect(() => {
    Promise.all([
      api.get<Paper>(`/api/projects/${projectId}/papers/${paperId}`),
      api.get<{ notes: string }>(`/api/projects/${projectId}/papers/${paperId}/context`).catch(() => null),
      api.get<DocRef[]>(`/api/projects/${projectId}/papers/${paperId}/refs`).catch(() => []),
    ]).then(([p, ctx, r]) => {
      setPaper(p)
      const raw = (ctx as any)?.notes ?? ""
      const cleaned = raw.replace(/^[\s\n]*##\s*Notes\n*/i, "").replace(/\n*##\s*Related[\s\S]*$/i, "").trim()
      setNotes(cleaned)
      setRefs(r as DocRef[])
    }).finally(() => setLoading(false))
  }, [projectId, paperId])

  const handleSave = useCallback(async (val: string) => {
    setSaving(true)
    try {
      await api.patch(`/api/projects/${projectId}/papers/${paperId}`, { notes: val })
      setNotes(val); setSaved(true); setTimeout(() => setSaved(false), 2000)
    } finally { setSaving(false) }
  }, [projectId, paperId])

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text)
    setCopied(label); setTimeout(() => setCopied(null), 1800)
  }

  async function uploadImage(file: File) {
    const res = await api.uploadImage(`/api/projects/${projectId}/papers/${paperId}/image`, file)
    setPaper(prev => prev ? { ...prev, preview_image: res.url } : prev)
  }

  // Clipboard paste for image
  useEffect(() => {
    const handler = async (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? [])
      const imageItem = items.find(i => i.type.startsWith("image/"))
      if (!imageItem) return
      const file = imageItem.getAsFile()
      if (file) { e.preventDefault(); await uploadImage(file) }
    }
    window.addEventListener("paste", handler)
    return () => window.removeEventListener("paste", handler)
  }, [projectId, paperId])

  async function removeTag(tag: string) {
    if (!paper) return
    const newTags = paper.tags.filter(t => t !== tag)
    await api.patch(`/api/projects/${projectId}/papers/${paperId}`, { tags: newTags })
    setPaper(prev => prev ? { ...prev, tags: newTags } : prev)
  }

  async function addTag(e: React.FormEvent) {
    e.preventDefault()
    if (!paper || !newTag.trim()) return
    const newTags = [...new Set([...paper.tags, newTag.trim()])]
    await api.patch(`/api/projects/${projectId}/papers/${paperId}`, { tags: newTags })
    setPaper(prev => prev ? { ...prev, tags: newTags } : prev)
    setNewTag(""); setAddingTag(false)
  }

  async function syncToZotero() {
    setSyncingZotero(true); setZoteroMsg("")
    try {
      const res = await api.post<{ message: string }>(`/api/projects/${projectId}/papers/${paperId}/sync-to-zotero`)
      setZoteroMsg(res.message)
    } catch (err: any) { setZoteroMsg(err.message) }
    finally { setSyncingZotero(false) }
  }

  async function syncNotesToDrive() {
    setSyncingDrive(true)
    try {
      const res = await api.post<{ drive_link: string }>(`/api/projects/${projectId}/papers/${paperId}/sync-notes-to-drive`)
      setDriveLink(res.drive_link)
    } catch (err: any) { alert(err.message) }
    finally { setSyncingDrive(false) }
  }

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading…</div>
  if (!paper) return <div className="p-8 text-sm text-red-500">Paper not found</div>

  const cleanKey = paper.id.replace(/[^\x00-\x7Fa-zA-Z0-9_-]/g, "")
  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: info panel ── */}
      <div className="w-80 xl:w-96 flex-shrink-0 border-r overflow-y-auto bg-white">
        <div className="p-4 space-y-4">
          <button onClick={() => router.back()} className="text-xs text-gray-400 hover:text-black">← Back</button>

          {/* Preview image — click or paste to replace */}
          <div className="flex justify-center">
            <label className="cursor-pointer group relative w-full">
              {paper.preview_image ? (
                <>
                  <img src={`${BASE}${paper.preview_image}`} alt="Preview"
                    className="w-full max-h-48 object-contain rounded-lg border" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 rounded-lg flex items-center justify-center transition-opacity">
                    <span className="text-white text-xs">Click or paste to replace</span>
                  </div>
                </>
              ) : (
                <div className="w-full h-28 flex flex-col items-center justify-center border-2 border-dashed rounded-lg text-xs text-gray-400 hover:border-gray-400 gap-1">
                  <span>+ Click or paste image</span>
                  <span className="text-[10px]">⌘V also works</span>
                </div>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f) }} />
            </label>
          </div>

          {/* Title & metadata */}
          <div className="space-y-1">
            <h1 className="text-sm font-semibold leading-snug">{paper.title}</h1>
            <p className="text-xs text-gray-600">{paper.authors?.join("; ")}</p>
            <p className="text-xs text-gray-500">{[paper.venue, paper.year].filter(Boolean).join(" · ")}</p>
          </div>

          {paper.abstract && <p className="text-xs text-gray-500 leading-relaxed">{paper.abstract}</p>}

          {/* Tags editor */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-gray-500">Tags</p>
            <div className="flex flex-wrap gap-1">
              {paper.tags?.map(t => (
                <span key={t} className="group flex items-center gap-0.5 text-[10px] bg-gray-100 px-1.5 py-0.5 rounded-full text-gray-600">
                  {t}
                  <button onClick={() => removeTag(t)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 ml-0.5">×</button>
                </span>
              ))}
              {addingTag ? (
                <form onSubmit={addTag} className="flex gap-1">
                  <input autoFocus value={newTag} onChange={e => setNewTag(e.target.value)}
                    placeholder="new tag" className="text-[10px] border rounded px-1.5 py-0.5 w-20 focus:outline-none" />
                  <button type="submit" className="text-[10px] text-blue-600">Add</button>
                  <button type="button" onClick={() => setAddingTag(false)} className="text-[10px] text-gray-400">✕</button>
                </form>
              ) : (
                <button onClick={() => setAddingTag(true)} className="text-[10px] text-gray-400 hover:text-black px-1.5 py-0.5 border border-dashed rounded-full">+ tag</button>
              )}
            </div>
          </div>

          {/* Citation */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-gray-500">Citation</p>
            <button onClick={() => copy(cleanKey || paper.id, "key")}
              className="w-full text-left text-xs bg-gray-100 px-2 py-1.5 rounded-lg font-mono hover:bg-gray-200 flex items-center justify-between">
              <span className="truncate text-gray-700">@{cleanKey || paper.id}</span>
              <span className="text-gray-400 ml-2 flex-shrink-0">{copied === "key" ? "✓" : "copy"}</span>
            </button>
            <button onClick={() => copy(paper.bibtex ?? "", "bib")}
              className="w-full text-xs text-gray-500 hover:text-black text-left px-2 py-1 hover:bg-gray-50 rounded-lg">
              {copied === "bib" ? "✓ BibTeX copied" : "Copy full BibTeX"}
            </button>
          </div>

          {/* Sync actions */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-gray-500">Sync</p>
            {paper.zotero_key && (
              <button onClick={syncToZotero} disabled={syncingZotero}
                className="w-full text-xs border px-2 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-left">
                {syncingZotero ? "Syncing…" : "↑ Sync tags & notes → Zotero"}
              </button>
            )}
            {zoteroMsg && <p className="text-[10px] text-gray-500">{zoteroMsg}</p>}

            {driveLink ? (
              <div className="flex items-center gap-2">
                <a href={driveLink} target="_blank" rel="noreferrer"
                  className="text-xs text-green-600 hover:underline flex-1">✓ Notes on Drive ↗</a>
                <button onClick={syncNotesToDrive} disabled={syncingDrive} className="text-[10px] text-gray-400 hover:text-black">re-sync</button>
              </div>
            ) : (
              <button onClick={syncNotesToDrive} disabled={syncingDrive}
                className="w-full text-xs border px-2 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-left">
                {syncingDrive ? "Syncing…" : "↑ Sync notes → Google Drive"}
              </button>
            )}
          </div>

          {/* Cross-references */}
          {refs.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-500">Referenced in</p>
              {refs.map(r => (
                <button key={r.id} onClick={() => router.push(`/projects/${projectId}/docs/${r.id}`)}
                  className="w-full text-left text-xs text-blue-600 hover:underline px-2 py-1 hover:bg-blue-50 rounded">
                  {r.title}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: TipTap notes editor ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white">
        <div className="px-4 py-2 border-b flex items-center justify-between flex-shrink-0">
          <span className="text-xs font-medium text-gray-600">Notes</span>
          <span className="text-xs text-gray-400">{saving ? "Saving…" : saved ? "✓ Saved" : ""}</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NotionEditor
            content={notes}
            onSave={handleSave}
            placeholder="Write notes… Type [[ to cite a paper."
            projectId={projectId}
          />
        </div>
      </div>
      <DocumentCommentsPanel projectId={projectId} resource="papers" itemId={paperId} />
    </div>
  )
}

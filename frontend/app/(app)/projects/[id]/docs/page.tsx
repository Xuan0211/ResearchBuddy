"use client"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useParams, useRouter } from "next/navigation"
import { ChevronRight, Folder, FolderPlus, MoreHorizontal, RefreshCw, X } from "lucide-react"
import { api } from "@/lib/api"
import type { Document } from "@/lib/types"
import DriveSyncControls from "@/components/DriveSyncControls"
import ModuleResourcesPanel from "@/components/ModuleResourcesPanel"

function DocMenu({
  doc,
  folders,
  onMove,
  onDelete,
}: {
  doc: Document & { folder?: string }
  folders: string[]
  onMove: (folder: string) => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const [showMove, setShowMove] = useState(false)
  const [target, setTarget] = useState("")
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })

  function updateMenuPosition() {
    const button = buttonRef.current
    if (!button) return
    const rect = button.getBoundingClientRect()
    const width = 176
    const height = showMove ? 154 : 86
    const gap = 6
    const top = rect.bottom + gap + height > window.innerHeight
      ? Math.max(8, rect.top - height - gap)
      : rect.bottom + gap
    const left = Math.min(
      window.innerWidth - width - 8,
      Math.max(8, rect.right - width),
    )
    setMenuPos({ top, left })
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      const targetNode = e.target as Node
      if (
        ref.current &&
        !ref.current.contains(targetNode) &&
        !menuRef.current?.contains(targetNode)
      ) {
        setOpen(false); setShowMove(false)
      }
    }
    if (open) document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    updateMenuPosition()
  }, [open, showMove])

  useEffect(() => {
    if (!open) return
    window.addEventListener("resize", updateMenuPosition)
    window.addEventListener("scroll", updateMenuPosition, true)
    return () => {
      window.removeEventListener("resize", updateMenuPosition)
      window.removeEventListener("scroll", updateMenuPosition, true)
    }
  }, [open, showMove])

  const menu = open && typeof document !== "undefined" ? createPortal(
    <div
      ref={menuRef}
      style={{ top: menuPos.top, left: menuPos.left }}
      className="fixed z-[1000] bg-white border border-gray-100 rounded-xl shadow-lg w-44 py-1 text-xs"
      onClick={e => e.stopPropagation()}
    >
      {!showMove ? (
        <>
          <button onClick={() => setShowMove(true)}
            className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2">
            <Folder size={12} className="text-gray-400" /> Move to folder
          </button>
          <button onClick={() => { onDelete(); setOpen(false) }}
            className="w-full text-left px-3 py-2 hover:bg-gray-50 text-red-500 flex items-center gap-2">
            <X size={12} /> Delete
          </button>
        </>
      ) : (
        <div className="px-2 py-1.5 space-y-1.5">
          <p className="text-[11px] text-gray-500 font-medium px-1">Move to folder</p>
          <input
            autoFocus
            list="move-folder-list"
            value={target}
            onChange={e => setTarget(e.target.value)}
            placeholder="Folder name or blank"
            className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <datalist id="move-folder-list">
            <option value="" />
            {folders.map(f => <option key={f} value={f} />)}
          </datalist>
          <div className="flex gap-1">
            <button onClick={() => { onMove(target.trim()); setOpen(false); setShowMove(false) }}
              className="flex-1 bg-black text-white rounded px-2 py-1 text-[11px]">Move</button>
            <button onClick={() => setShowMove(false)}
              className="text-gray-400 hover:text-gray-700 px-1"><X size={12} /></button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  ) : null

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <button ref={buttonRef} onClick={() => setOpen(v => !v)}
        className="p-1 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100">
        <MoreHorizontal size={14} />
      </button>
      {menu}
    </div>
  )
}

export default function DocsPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const router = useRouter()
  const [docs, setDocs] = useState<(Document & { folder?: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState("")
  const [newFolder, setNewFolder] = useState("")
  const [creating, setCreating] = useState(false)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set(["__root__"]))
  const [syncingStructure, setSyncingStructure] = useState(false)
  const [lastStructureSync, setLastStructureSync] = useState<string | null>(null)

  useEffect(() => {
    api.get<(Document & { folder?: string })[]>(`/api/projects/${projectId}/docs`)
      .then(setDocs)
      .finally(() => setLoading(false))
  }, [projectId])

  async function createDoc(e: React.FormEvent) {
    e.preventDefault()
    const res = await api.post<{ id: string }>(`/api/projects/${projectId}/docs`, {
      title: newTitle,
      folder: newFolder.trim(),
    })
    setNewTitle("")
    setNewFolder("")
    setCreating(false)
    router.push(`/projects/${projectId}/docs/${res.id}`)
  }

  async function createFolder(e: React.FormEvent) {
    e.preventDefault()
    if (!newFolderName.trim()) return
    // Open the folder (it will auto-appear when docs are moved into it)
    setOpenFolders(prev => new Set([...prev, newFolderName.trim()]))
    setCreatingFolder(false)
    setNewFolderName("")
  }

  async function moveDoc(docId: string, folder: string) {
    await api.patch(`/api/projects/${projectId}/docs/${docId}`, { folder })
    setDocs(prev => prev.map(d => d.id === docId ? { ...d, folder: folder || undefined } : d))
    if (folder) setOpenFolders(prev => new Set([...prev, folder]))
  }

  async function deleteDoc(docId: string) {
    if (!confirm("Delete this document?")) return
    await api.delete(`/api/projects/${projectId}/docs/${docId}`)
    setDocs(prev => prev.filter(d => d.id !== docId))
  }

  async function syncStructureFromDrive() {
    setSyncingStructure(true)
    try {
      const res = await api.post<{ updated: number; synced_at: string }>(
        `/api/projects/${projectId}/docs/sync-structure-from-drive`, {}
      )
      setLastStructureSync(res.synced_at)
      // Reload docs to reflect new folders
      const updated = await api.get<(Document & { folder?: string })[]>(`/api/projects/${projectId}/docs`)
      setDocs(updated)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Sync failed"
      alert(message)
    } finally {
      setSyncingStructure(false)
    }
  }

  function toggleFolder(name: string) {
    setOpenFolders(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const grouped: Record<string, (Document & { folder?: string })[]> = {}
  for (const doc of docs) {
    const key = doc.folder || "__root__"
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(doc)
  }
  const folderNames = Object.keys(grouped).sort((a, b) => {
    if (a === "__root__") return -1
    if (b === "__root__") return 1
    return a.localeCompare(b)
  })
  const existingFolders = folderNames.filter(f => f !== "__root__")

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading…</div>

  return (
    <div className="p-6 max-w-4xl space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <h3 className="font-medium text-sm flex-1">Documents</h3>
        <button
          onClick={syncStructureFromDrive}
          disabled={syncingStructure}
          title={lastStructureSync ? `Last synced: ${new Date(lastStructureSync).toLocaleString()}` : "Sync folder structure from Drive"}
          className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1.5 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={11} className={syncingStructure ? "animate-spin" : ""} />
          {lastStructureSync ? new Date(lastStructureSync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Sync structure"}
        </button>
        <button onClick={() => { setCreatingFolder(true); setCreating(false) }}
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-black border border-gray-200 rounded-lg px-2.5 py-1.5 transition-colors">
          <FolderPlus size={12} /> Folder
        </button>
        <button onClick={() => { setCreating(true); setCreatingFolder(false) }}
          className="inline-flex items-center gap-1.5 bg-black text-white text-xs px-3 py-1.5 rounded-lg">
          + New doc
        </button>
      </div>


      {/* Create folder inline */}
      {creatingFolder && (
        <form onSubmit={createFolder} className="flex gap-2 items-center">
          <FolderPlus size={14} className="text-gray-400 flex-shrink-0" />
          <input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
            placeholder="Folder name" required
            className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-black" />
          <button type="submit" className="bg-black text-white text-xs px-3 py-1.5 rounded-lg">Create</button>
          <button type="button" onClick={() => setCreatingFolder(false)} className="text-gray-400 hover:text-gray-700"><X size={14} /></button>
        </form>
      )}

      {/* Create doc form */}
      {creating && (
        <form onSubmit={createDoc} className="border border-gray-100 rounded-xl p-4 space-y-2.5 bg-white shadow-sm">
          <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
            placeholder="Document title" required
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black" />
          <div className="flex gap-2 items-center">
            <Folder size={13} className="text-gray-400 flex-shrink-0" />
            <input list="folder-list" value={newFolder} onChange={e => setNewFolder(e.target.value)}
              placeholder="Folder (optional)"
              className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none" />
            <datalist id="folder-list">
              {existingFolders.map(f => <option key={f} value={f} />)}
            </datalist>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bg-black text-white text-xs px-4 py-1.5 rounded-lg">Create</button>
            <button type="button" onClick={() => setCreating(false)} className="text-xs text-gray-400 hover:text-gray-700">Cancel</button>
          </div>
        </form>
      )}

      {docs.length === 0 ? (
        <p className="text-sm text-gray-400">No documents yet.</p>
      ) : (
        <div className="space-y-1">
          {folderNames.map(folderKey => {
            const isRoot = folderKey === "__root__"
            const isOpen = openFolders.has(folderKey)
            const folderDocs = grouped[folderKey]
            return (
              <div key={folderKey}>
                {!isRoot && (
                  <button onClick={() => toggleFolder(folderKey)}
                    className="flex items-center gap-1.5 w-full py-1.5 px-2 rounded-lg hover:bg-gray-50 text-xs font-medium text-gray-600">
                    <ChevronRight size={13} className={`transition-transform text-gray-400 ${isOpen ? "rotate-90" : ""}`} />
                    <Folder size={13} className="text-gray-400" />
                    {folderKey}
                    <span className="ml-auto text-[11px] text-gray-400 font-normal">{folderDocs.length}</span>
                  </button>
                )}
                {(isRoot || isOpen) && (
                  <ul className={`space-y-1 ${!isRoot ? "ml-5 mt-0.5" : ""}`}>
                    {folderDocs.map(d => (
                      <li key={d.id}
                        className="group border border-gray-100 rounded-xl px-4 py-2.5 hover:bg-gray-50 cursor-pointer bg-white shadow-sm transition-colors"
                        onClick={() => router.push(`/projects/${projectId}/docs/${d.id}`)}>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium flex-1 truncate">{d.title}</p>
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <DriveSyncControls projectId={projectId} resource="docs" itemId={d.id} />
                            <DocMenu
                              doc={d}
                              folders={existingFolders}
                              onMove={folder => moveDoc(d.id, folder)}
                              onDelete={() => deleteDoc(d.id)}
                            />
                          </div>
                        </div>
                        {(d.tags?.length > 0 || d.papers?.length > 0) && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {d.tags?.map(t => (
                              <span key={t} className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded-full text-gray-500">{t}</span>
                            ))}
                            {d.papers?.length > 0 && (
                              <span className="text-[10px] text-gray-400">{d.papers.length} refs</span>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
      <ModuleResourcesPanel projectId={projectId} section="document" canEdit={true} />
    </div>
  )
}

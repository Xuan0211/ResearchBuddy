"use client"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  BookOpen,
  FileText,
  Folder,
  FolderTree,
  Link as LinkIcon,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { api } from "@/lib/api"
import type {
  Document,
  ProjectSkill,
  SectionResourceDoc,
  SectionResourceLink,
  SectionResources,
  SectionResourceTreeNode,
} from "@/lib/types"

type SectionKey = "papers" | "meetings" | "coding" | "workspace" | "writing" | "docs" | "images" | "prototype"

type Props = {
  projectId: string
  section: SectionKey
  title?: string
  preferredLinkKind?: "figma" | "github" | "link"
  scope?: string
}

function ResourceTree({ nodes, depth = 0 }: { nodes: SectionResourceTreeNode[]; depth?: number }) {
  if (nodes.length === 0) return <p className="text-xs text-gray-400">No files yet.</p>
  return (
    <ul className="space-y-1">
      {nodes.map(node => (
        <li key={node.path}>
          <div className="flex items-center gap-1.5 text-xs text-gray-600" style={{ paddingLeft: depth * 12 }}>
            {node.type === "dir" ? <Folder size={12} className="text-gray-400" /> : <FileText size={12} className="text-gray-300" />}
            <span className="truncate" title={node.path}>{node.name}</span>
          </div>
          {node.children && <ResourceTree nodes={node.children} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  )
}

export default function SectionResourcesPanel({
  projectId,
  section,
  title,
  preferredLinkKind = "link",
  scope = "",
}: Props) {
  const [resources, setResources] = useState<SectionResources | null>(null)
  const [skills, setSkills] = useState<ProjectSkill[]>([])
  const [projectDocs, setProjectDocs] = useState<(Document & { folder?: string; _path?: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [showDocForm, setShowDocForm] = useState(false)
  const [docForm, setDocForm] = useState({ title: "", content: "" })
  const [editingDoc, setEditingDoc] = useState<SectionResourceDoc | null>(null)
  const [selectedSkill, setSelectedSkill] = useState("")
  const [selectedDocPath, setSelectedDocPath] = useState("")
  const [folderPath, setFolderPath] = useState("")
  const [uploadTarget, setUploadTarget] = useState<"docs" | "files">("docs")
  const [linkForm, setLinkForm] = useState({ title: "", url: "" })
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  function resourcePath(path: string) {
    const qs = scope ? `?scope=${encodeURIComponent(scope)}` : ""
    const joiner = path.includes("?") ? "&" : "?"
    return `/api/projects/${projectId}/module-resources/${section}${path}${scope && path.includes("?") ? `${joiner}scope=${encodeURIComponent(scope)}` : qs}`
  }

  async function load() {
    setLoading(true)
    try {
      const [res, allSkills, docs] = await Promise.all([
        api.get<SectionResources>(resourcePath("")),
        api.get<ProjectSkill[]>(`/api/projects/${projectId}/skills`),
        api.get<(Document & { folder?: string; _path?: string })[]>(`/api/projects/${projectId}/docs`),
      ])
      setResources(res)
      setSkills(allSkills)
      setProjectDocs(docs)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [projectId, section, scope])

  useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "")
    folderInputRef.current?.setAttribute("directory", "")
  }, [])

  const attachableSkills = useMemo(() => {
    const attached = new Set(resources?.skill_ids ?? [])
    return skills.filter(skill => !attached.has(skill.id))
  }, [resources?.skill_ids, skills])

  const attachedDocPaths = useMemo(() => new Set(resources?.doc_refs.map(ref => ref.path) ?? []), [resources?.doc_refs])
  const attachableDocs = useMemo(() => {
    return projectDocs
      .map(doc => ({
        id: doc.id,
        title: doc.title,
        path: doc._path || `docs/${doc.id}.md`,
        folder: doc.folder,
      }))
      .filter(doc => !attachedDocPaths.has(doc.path))
  }, [attachedDocPaths, projectDocs])

  async function createDoc(e: React.FormEvent) {
    e.preventDefault()
    await api.post(resourcePath("/docs"), docForm)
    setDocForm({ title: "", content: "" })
    setShowDocForm(false)
    await load()
  }

  async function saveDoc(e: React.FormEvent) {
    e.preventDefault()
    if (!editingDoc) return
    await api.patch(resourcePath(`/docs/${editingDoc.id}`), {
      title: editingDoc.title,
      content: editingDoc.content,
    })
    setEditingDoc(null)
    await load()
  }

  async function deleteDoc(doc: SectionResourceDoc) {
    if (!confirm(`Delete "${doc.title}"?`)) return
    await api.delete(resourcePath(`/docs/${doc.id}`))
    await load()
  }

  async function attachSkill() {
    if (!selectedSkill) return
    await api.post(resourcePath("/skills"), { skill_id: selectedSkill })
    setSelectedSkill("")
    await load()
  }

  async function detachSkill(skill: ProjectSkill) {
    await api.delete(resourcePath(`/skills/${skill.id}`))
    await load()
  }

  async function attachDoc(path: string, kind: "doc" | "folder") {
    if (!path.trim()) return
    try {
      await api.post(resourcePath("/doc-refs"), { path: path.trim(), kind })
      setSelectedDocPath("")
      setFolderPath("")
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Attach failed")
    }
  }

  async function detachDoc(path: string, kind: "doc" | "folder") {
    await api.delete(resourcePath(`/doc-refs?path=${encodeURIComponent(path)}&kind=${kind}`))
    await load()
  }

  async function upload(files: FileList | null, target: "docs" | "files") {
    if (!files?.length) return
    const form = new FormData()
    Array.from(files).forEach(file => {
      form.append("files", file)
      form.append("relative_paths", (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name)
    })
    form.append("target", target)
    setUploading(true)
    try {
      await api.uploadForm(resourcePath("/upload"), form)
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
      if (folderInputRef.current) folderInputRef.current.value = ""
    }
  }

  async function createLink(e: React.FormEvent) {
    e.preventDefault()
    await api.post<SectionResourceLink>(resourcePath("/links"), {
      kind: preferredLinkKind,
      title: linkForm.title,
      url: linkForm.url,
    })
    setLinkForm({ title: "", url: "" })
    await load()
  }

  async function deleteLink(link: SectionResourceLink) {
    await api.delete(resourcePath(`/links/${link.id}`))
    await load()
  }

  if (loading) return <div className="rounded-md border p-3 text-xs text-gray-400">Loading resources...</div>
  if (!resources) return null

  const localDocs = resources.docs
  const attachedDocs = resources.attached_docs ?? []

  return (
    <section className="rounded-md border bg-white">
      <div className="border-b px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">{title ?? "Module resources"}</h3>
          <p className="text-xs text-gray-400 mt-0.5">Local folder: {resources.local_root}/</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={uploadTarget}
            onChange={e => setUploadTarget(e.target.value as "docs" | "files")}
            className="rounded-md border px-2 py-1.5 text-xs text-gray-600"
            title="Upload target"
          >
            <option value="docs">Docs</option>
            <option value="files">Files</option>
          </select>
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <Upload size={13} /> File
          </button>
          <button onClick={() => folderInputRef.current?.click()} disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <FolderTree size={13} /> Folder
          </button>
          <button
            onClick={() => setShowDocForm(v => !v)}
            className="inline-flex items-center gap-1.5 rounded-md bg-black px-3 py-1.5 text-xs text-white"
          >
            <Plus size={13} /> Doc
          </button>
        </div>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => upload(e.target.files, uploadTarget)} />
        <input ref={folderInputRef} type="file" multiple className="hidden" onChange={e => upload(e.target.files, uploadTarget)} />
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
              <FileText size={13} /> Docs
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex gap-2">
                <select
                  value={selectedDocPath}
                  onChange={e => setSelectedDocPath(e.target.value)}
                  className="min-w-0 flex-1 rounded-md border px-2 py-1.5 text-xs text-gray-700"
                >
                  <option value="">Attach a project doc</option>
                  {attachableDocs.map(doc => <option key={doc.path} value={doc.path}>{doc.title}</option>)}
                </select>
                <button onClick={() => attachDoc(selectedDocPath, "doc")} disabled={!selectedDocPath}
                  className="rounded-md border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  Add
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  value={folderPath}
                  onChange={e => setFolderPath(e.target.value)}
                  placeholder="docs/folder-name"
                  className="min-w-0 flex-1 rounded-md border px-2 py-1.5 text-xs text-gray-700"
                />
                <button onClick={() => attachDoc(folderPath, "folder")} disabled={!folderPath}
                  className="rounded-md border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  Add
                </button>
              </div>
            </div>

            {showDocForm && (
              <form onSubmit={createDoc} className="space-y-2">
                <input
                  autoFocus
                  value={docForm.title}
                  onChange={e => setDocForm({ ...docForm, title: e.target.value })}
                  placeholder="Local resource doc title"
                  required
                  className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-black"
                />
                <textarea
                  value={docForm.content}
                  onChange={e => setDocForm({ ...docForm, content: e.target.value })}
                  placeholder="Optional markdown content"
                  rows={4}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none"
                />
                <div className="flex gap-2">
                  <button type="submit" className="rounded-md bg-black px-3 py-1.5 text-xs text-white">Create</button>
                  <button type="button" onClick={() => setShowDocForm(false)} className="text-xs text-gray-400 hover:text-black">Cancel</button>
                </div>
              </form>
            )}

            {resources.doc_refs.length > 0 && (
              <ul className="space-y-2">
                {resources.doc_refs.map(ref => (
                  <li key={`${ref.type}:${ref.path}`} className="rounded-md border border-gray-100 px-3 py-2">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{ref.type === "folder" ? "Folder" : "Doc"} attachment</p>
                        <p className="mt-0.5 truncate text-[11px] text-gray-400">{ref.path}</p>
                      </div>
                      <button onClick={() => detachDoc(ref.path, ref.type)} className="p-1 text-gray-300 hover:text-red-500">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {attachedDocs.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Attached docs preview</p>
                {attachedDocs.map(doc => (
                  <div key={doc.path} className="rounded-md bg-gray-50 px-3 py-2">
                    <p className="truncate text-sm font-medium">{doc.title}</p>
                    <p className="mt-0.5 truncate text-[11px] text-gray-400">{doc.path}</p>
                  </div>
                ))}
              </div>
            )}

            {localDocs.length > 0 && (
              <ul className="space-y-2">
                {localDocs.map(doc => (
                  <li key={doc.id} className="rounded-md border border-gray-100 px-3 py-2">
                    {editingDoc?.id === doc.id ? (
                      <form onSubmit={saveDoc} className="space-y-2">
                        <input
                          value={editingDoc.title}
                          onChange={e => setEditingDoc({ ...editingDoc, title: e.target.value })}
                          className="w-full rounded-md border px-2 py-1 text-sm"
                        />
                        <textarea
                          value={editingDoc.content}
                          onChange={e => setEditingDoc({ ...editingDoc, content: e.target.value })}
                          rows={6}
                          className="w-full rounded-md border px-2 py-1.5 text-sm"
                        />
                        <div className="flex gap-2">
                          <button type="submit" className="rounded bg-black px-2 py-1 text-xs text-white">Save</button>
                          <button type="button" onClick={() => setEditingDoc(null)} className="text-gray-400 hover:text-black"><X size={14} /></button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex items-start gap-2">
                        <button onClick={() => setEditingDoc(doc)} className="min-w-0 flex-1 text-left">
                          <p className="truncate text-sm font-medium">{doc.title}</p>
                          <p className="mt-0.5 truncate text-[11px] text-gray-400">{doc.path}</p>
                        </button>
                        <button onClick={() => deleteDoc(doc)} className="p-1 text-gray-300 hover:text-red-500">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {localDocs.length === 0 && attachedDocs.length === 0 && resources.doc_refs.length === 0 && (
              <p className="text-xs text-gray-400">No docs attached yet.</p>
            )}
          </div>

          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
              <LinkIcon size={13} /> Links
            </div>
            <form onSubmit={createLink} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input
                value={linkForm.title}
                onChange={e => setLinkForm({ ...linkForm, title: e.target.value })}
                placeholder={preferredLinkKind === "figma" ? "Figma label" : preferredLinkKind === "github" ? "GitHub label" : "Link label"}
                className="rounded-md border px-2 py-1.5 text-xs text-gray-700"
              />
              <input
                value={linkForm.url}
                onChange={e => setLinkForm({ ...linkForm, url: e.target.value })}
                placeholder={preferredLinkKind === "figma" ? "https://figma.com/..." : preferredLinkKind === "github" ? "https://github.com/..." : "https://..."}
                required
                className="rounded-md border px-2 py-1.5 text-xs text-gray-700"
              />
              <button type="submit" className="rounded-md border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">Add</button>
            </form>
            {resources.links.length === 0 ? (
              <p className="text-xs text-gray-400">No links yet.</p>
            ) : (
              <ul className="space-y-2">
                {resources.links.map(link => (
                  <li key={link.id} className="flex items-start gap-2 rounded-md border border-gray-100 px-3 py-2">
                    <a href={link.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{link.title}</p>
                      <p className="mt-0.5 truncate text-[11px] text-gray-400">{link.url}</p>
                    </a>
                    <button onClick={() => deleteLink(link)} className="p-1 text-gray-300 hover:text-red-500">
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
              <BookOpen size={13} /> Skills
            </div>
            <div className="flex gap-2">
              <select
                value={selectedSkill}
                onChange={e => setSelectedSkill(e.target.value)}
                className="min-w-0 flex-1 rounded-md border px-2 py-1.5 text-xs text-gray-700"
              >
                <option value="">Attach a skill</option>
                {attachableSkills.map(skill => <option key={skill.id} value={skill.id}>{skill.title}</option>)}
              </select>
              <button onClick={attachSkill} disabled={!selectedSkill}
                className="rounded-md border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                Add
              </button>
            </div>
            {resources.skills.length === 0 ? (
              <p className="text-xs text-gray-400">No skills attached.</p>
            ) : (
              <ul className="space-y-2">
                {resources.skills.map(skill => (
                  <li key={skill.id} className="rounded-md border border-gray-100 px-3 py-2">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{skill.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{skill.description || skill.path}</p>
                      </div>
                      <button onClick={() => detachSkill(skill)} className="p-1 text-gray-300 hover:text-red-500">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
              <FolderTree size={13} /> Folder structure
            </div>
            <ResourceTree nodes={resources.tree ?? []} />
          </div>
        </div>
      </div>
    </section>
  )
}

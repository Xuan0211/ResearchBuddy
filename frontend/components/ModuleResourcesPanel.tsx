"use client"
import { useEffect, useMemo, useState } from "react"
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  Pencil,
  Plus,
  X,
} from "lucide-react"
import { api } from "@/lib/api"
import type { Document, ProjectSkill } from "@/lib/types"

// ── Types ─────────────────────────────────────────────────────────────────────

type AttachedDoc = {
  id: string
  type: "doc" | "folder"
  path: string
  title: string
  note: string
}

type AttachedSkill = {
  id: string
  path: string
  title: string
  description: string
  note: string
}

type ModuleResources = {
  docs: AttachedDoc[]
  skills: AttachedSkill[]
}

type Props = {
  projectId: string
  section: string
  canEdit: boolean
  scope?: string
}

type DocWithMeta = Document & { folder?: string; _path?: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildDocGroups(docs: DocWithMeta[]): Record<string, DocWithMeta[]> {
  const groups: Record<string, DocWithMeta[]> = {}
  for (const doc of docs) {
    const folder = doc.folder || ""
    if (!groups[folder]) groups[folder] = []
    groups[folder].push(doc)
  }
  return groups
}

// ── Inline note editor ────────────────────────────────────────────────────────

function NoteEditor({
  note,
  onSave,
  onCancel,
}: {
  note: string
  onSave: (note: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(note)
  return (
    <div className="mt-1 flex gap-1">
      <input
        autoFocus
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Add a note…"
        className="flex-1 min-w-0 rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-black"
      />
      <button
        onClick={() => onSave(value)}
        className="p-1 text-green-600 hover:text-green-800"
        title="Save"
      >
        <Check size={13} />
      </button>
      <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-700" title="Cancel">
        <X size={13} />
      </button>
    </div>
  )
}

// ── Attach doc row (inside picker) ────────────────────────────────────────────

function DocPickerRow({
  doc,
  onAttach,
}: {
  doc: DocWithMeta
  onAttach: (path: string, kind: "doc" | "folder", note: string) => void
}) {
  const [pending, setPending] = useState(false)
  const [note, setNote] = useState("")

  if (pending) {
    return (
      <div className="pl-2 pr-1 py-1">
        <p className="text-xs font-medium truncate">{doc.title}</p>
        <NoteEditor
          note={note}
          onSave={n => {
            onAttach(doc._path || `document/docs/${doc.id}.md`, "doc", n)
            setPending(false)
          }}
          onCancel={() => setPending(false)}
        />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 pl-2 pr-1 py-0.5 hover:bg-gray-50 rounded group">
      <FileText size={11} className="text-gray-400 flex-shrink-0" />
      <span className="flex-1 text-xs truncate text-gray-700">{doc.title}</span>
      <button
        onClick={() => setPending(true)}
        className="hidden group-hover:flex items-center gap-0.5 text-[10px] text-blue-600 hover:text-blue-800 px-1 py-0.5 rounded border border-blue-200 bg-blue-50"
      >
        <Plus size={10} /> Attach
      </button>
    </div>
  )
}

// ── Folder group in picker ────────────────────────────────────────────────────

function FolderPickerGroup({
  folder,
  docs,
  onAttach,
  onAttachFolder,
  forceOpen = false,
}: {
  folder: string
  docs: DocWithMeta[]
  onAttach: (path: string, kind: "doc" | "folder", note: string) => void
  onAttachFolder: (folder: string, note: string) => void
  forceOpen?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pendingFolder, setPendingFolder] = useState(false)
  const expanded = forceOpen || open

  if (!folder) {
    return (
      <div className="space-y-0.5">
        <p className="text-[10px] text-gray-400 px-1 pb-0.5">(no folder)</p>
        {docs.map(doc => (
          <DocPickerRow key={doc.id} doc={doc} onAttach={onAttach} />
        ))}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-1 px-1 py-0.5 hover:bg-gray-50 rounded cursor-pointer group">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-1 flex-1 min-w-0"
        >
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          <Folder size={11} className="text-amber-500 flex-shrink-0" />
          <span className="text-xs font-medium truncate text-gray-700">{folder}</span>
        </button>
        {!pendingFolder && (
          <button
            onClick={() => setPendingFolder(true)}
            className="hidden group-hover:flex items-center gap-0.5 text-[10px] text-amber-600 hover:text-amber-800 px-1 py-0.5 rounded border border-amber-200 bg-amber-50"
          >
            <Plus size={10} /> Folder
          </button>
        )}
      </div>
      {pendingFolder && (
        <div className="pl-5 pr-1">
          <NoteEditor
            note=""
            onSave={n => {
              onAttachFolder(folder, n)
              setPendingFolder(false)
            }}
            onCancel={() => setPendingFolder(false)}
          />
        </div>
      )}
      {expanded && (
        <div className="pl-4 space-y-0.5">
          {docs.map(doc => (
            <DocPickerRow key={doc.id} doc={doc} onAttach={onAttach} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ModuleResourcesPanel({ projectId, section, canEdit, scope = "" }: Props) {
  const [resources, setResources] = useState<ModuleResources | null>(null)
  const [allDocs, setAllDocs] = useState<DocWithMeta[]>([])
  const [allSkills, setAllSkills] = useState<ProjectSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  // picker open state
  const [showDocPicker, setShowDocPicker] = useState(false)
  const [showSkillPicker, setShowSkillPicker] = useState(false)

  // picker search
  const [docSearch, setDocSearch] = useState("")
  const [skillSearch, setSkillSearch] = useState("")

  // inline note editing
  const [editingDocNote, setEditingDocNote] = useState<string | null>(null)
  const [editingSkillNote, setEditingSkillNote] = useState<string | null>(null)

  // pending skill attach note
  const [pendingSkillId, setPendingSkillId] = useState<string | null>(null)
  const [pendingSkillNote, setPendingSkillNote] = useState("")

  function resourceUrl(path: string) {
    const base = `/api/projects/${projectId}/module-resources/${section}`
    const qs = scope ? `?scope=${encodeURIComponent(scope)}` : ""
    return `${base}${path}${qs}`
  }

  async function load() {
    setLoading(true)
    try {
      const [res, docs, skills] = await Promise.all([
        api.get<ModuleResources>(resourceUrl("")),
        api.get<DocWithMeta[]>(`/api/projects/${projectId}/docs`),
        api.get<ProjectSkill[]>(`/api/projects/${projectId}/skills`),
      ])
      setResources(res)
      setAllDocs(docs)
      setAllSkills(skills)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [projectId, section, scope]) // eslint-disable-line react-hooks/exhaustive-deps

  // Docs already attached (by path)
  const attachedDocPaths = useMemo(
    () => new Set(resources?.docs.map(d => d.path) ?? []),
    [resources?.docs],
  )

  // Skills already attached (by id)
  const attachedSkillIds = useMemo(
    () => new Set(resources?.skills.map(s => s.id) ?? []),
    [resources?.skills],
  )

  const availableDocs = useMemo(
    () => allDocs.filter(d => {
      const p = d._path || `document/docs/${d.id}.md`
      return !attachedDocPaths.has(p)
    }),
    [allDocs, attachedDocPaths],
  )

  const filteredDocs = useMemo(() => {
    const q = docSearch.trim().toLowerCase()
    if (!q) return availableDocs
    return availableDocs.filter(d => {
      const path = d._path || `document/docs/${d.id}.md`
      const haystack = `${d.title} ${d.folder || ""} ${path} ${(d.tags || []).join(" ")}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [availableDocs, docSearch])

  const docGroups = useMemo(() => buildDocGroups(filteredDocs), [filteredDocs])

  const availableSkills = useMemo(
    () => allSkills.filter(s => !attachedSkillIds.has(s.id)),
    [allSkills, attachedSkillIds],
  )

  const filteredSkills = useMemo(() => {
    const q = skillSearch.toLowerCase()
    if (!q) return availableSkills
    return availableSkills.filter(
      s => s.title.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q),
    )
  }, [availableSkills, skillSearch])

  // ── actions ──────────────────────────────────────────────────────────────────

  async function handleAttachDoc(path: string, kind: "doc" | "folder", note: string) {
    await api.post(resourceUrl("/doc-refs"), { path, kind, note })
    setShowDocPicker(false)
    setDocSearch("")
    await load()
  }

  async function handleDetachDoc(id: string) {
    await api.delete(resourceUrl(`/doc-refs/${id}`))
    await load()
  }

  async function handleSaveDocNote(id: string, note: string) {
    await api.patch(resourceUrl(`/doc-refs/${id}`), { note })
    setEditingDocNote(null)
    await load()
  }

  async function handleAttachSkill(skillId: string, note: string) {
    await api.post(resourceUrl("/skills"), { skill_id: skillId, note })
    setShowSkillPicker(false)
    setSkillSearch("")
    setPendingSkillId(null)
    setPendingSkillNote("")
    await load()
  }

  async function handleDetachSkill(id: string) {
    await api.delete(resourceUrl(`/skills/${id}`))
    await load()
  }

  async function handleSaveSkillNote(id: string, note: string) {
    await api.patch(resourceUrl(`/skills/${id}`), { note })
    setEditingSkillNote(null)
    await load()
  }

  // ── render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="rounded-md border p-3 text-xs text-gray-400">Loading module resources…</div>
    )
  }
  if (!resources) return null

  const folderKeys = Object.keys(docGroups).sort((a, b) => {
    if (!a) return -1
    if (!b) return 1
    return a.localeCompare(b)
  })

  return (
    <section className="rounded-md border bg-white">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between border-b px-4 py-3 text-left hover:bg-gray-50"
      >
        <h3 className="text-sm font-medium">Module Resources</h3>
        <span className="flex items-center gap-2 text-xs text-gray-400">
          {(resources.docs.length + resources.skills.length) > 0 && (
            <span>{resources.docs.length} docs · {resources.skills.length} skills</span>
          )}
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      {open && <div className="p-4 space-y-6">
        {/* ── Attached Documents ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
              <FileText size={13} />
              <span>Attached Documents</span>
            </div>
            {canEdit && (
              <button
                onClick={() => { setShowDocPicker(v => !v); setShowSkillPicker(false) }}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-black rounded border px-2 py-0.5 hover:bg-gray-50"
              >
                <Plus size={11} /> Add Document
              </button>
            )}
          </div>

          {/* Attached doc list */}
          {resources.docs.length === 0 ? (
            <p className="text-xs text-gray-400">No documents attached.</p>
          ) : (
            <ul className="space-y-1.5">
              {resources.docs.map(doc => (
                <li key={doc.id} className="rounded-md border border-gray-100 px-3 py-2">
                  <div className="flex items-start gap-2">
                    {doc.type === "folder" ? (
                      <Folder size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <FileText size={13} className="text-blue-400 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{doc.title}</p>
                      {doc.note && editingDocNote !== doc.id && (
                        <p className="text-[11px] text-gray-500 truncate">{doc.note}</p>
                      )}
                      {editingDocNote === doc.id && (
                        <NoteEditor
                          note={doc.note}
                          onSave={n => handleSaveDocNote(doc.id, n)}
                          onCancel={() => setEditingDocNote(null)}
                        />
                      )}
                    </div>
                    {canEdit && editingDocNote !== doc.id && (
                      <button
                        onClick={() => setEditingDocNote(doc.id)}
                        className="p-1 text-gray-300 hover:text-gray-600"
                        title="Edit note"
                      >
                        <Pencil size={11} />
                      </button>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => handleDetachDoc(doc.id)}
                        className="p-1 text-gray-300 hover:text-red-500"
                        title="Remove"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Doc picker */}
          {showDocPicker && canEdit && (
            <div className="rounded-md border border-blue-100 bg-blue-50/40 p-2 space-y-1">
              <input
                value={docSearch}
                onChange={e => setDocSearch(e.target.value)}
                placeholder="Search docs..."
                className="w-full rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-black"
              />
              {availableDocs.length === 0 ? (
                <p className="text-xs text-gray-400 px-1">All documents are already attached.</p>
              ) : filteredDocs.length === 0 ? (
                <p className="text-xs text-gray-400 px-1">No docs match your search.</p>
              ) : (
                <div className="space-y-1">
                  {folderKeys.map(folder => (
                    <FolderPickerGroup
                      key={folder || "__none__"}
                      folder={folder}
                      docs={docGroups[folder]}
                      onAttach={handleAttachDoc}
                      onAttachFolder={(f, note) => handleAttachDoc(f, "folder", note)}
                      forceOpen={!!docSearch.trim()}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Attached Skills ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
              <BookOpen size={13} />
              <span>Attached Skills</span>
            </div>
            {canEdit && (
              <button
                onClick={() => { setShowSkillPicker(v => !v); setShowDocPicker(false) }}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-black rounded border px-2 py-0.5 hover:bg-gray-50"
              >
                <Plus size={11} /> Add Skill
              </button>
            )}
          </div>

          {/* Attached skill list */}
          {resources.skills.length === 0 ? (
            <p className="text-xs text-gray-400">No skills attached.</p>
          ) : (
            <ul className="space-y-1.5">
              {resources.skills.map(skill => (
                <li key={skill.id} className="rounded-md border border-gray-100 px-3 py-2">
                  <div className="flex items-start gap-2">
                    <BookOpen size={13} className="text-purple-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{skill.title}</p>
                      {skill.description && (
                        <p className="text-[11px] text-gray-400 truncate">{skill.description}</p>
                      )}
                      {skill.note && editingSkillNote !== skill.id && (
                        <p className="text-[11px] text-gray-500 truncate italic">{skill.note}</p>
                      )}
                      {editingSkillNote === skill.id && (
                        <NoteEditor
                          note={skill.note}
                          onSave={n => handleSaveSkillNote(skill.id, n)}
                          onCancel={() => setEditingSkillNote(null)}
                        />
                      )}
                    </div>
                    {canEdit && editingSkillNote !== skill.id && (
                      <button
                        onClick={() => setEditingSkillNote(skill.id)}
                        className="p-1 text-gray-300 hover:text-gray-600"
                        title="Edit note"
                      >
                        <Pencil size={11} />
                      </button>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => handleDetachSkill(skill.id)}
                        className="p-1 text-gray-300 hover:text-red-500"
                        title="Remove"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Skill picker */}
          {showSkillPicker && canEdit && (
            <div className="rounded-md border border-purple-100 bg-purple-50/40 p-2 space-y-2">
              <input
                value={skillSearch}
                onChange={e => setSkillSearch(e.target.value)}
                placeholder="Search skills…"
                className="w-full rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-black"
              />
              {filteredSkills.length === 0 ? (
                <p className="text-xs text-gray-400 px-1">
                  {availableSkills.length === 0
                    ? "All skills are already attached."
                    : "No skills match your search."}
                </p>
              ) : (
                <ul className="space-y-1 max-h-52 overflow-y-auto">
                  {filteredSkills.map(skill => (
                    <li key={skill.id}>
                      {pendingSkillId === skill.id ? (
                        <div className="rounded px-2 py-1 bg-white border">
                          <p className="text-xs font-medium">{skill.title}</p>
                          <NoteEditor
                            note={pendingSkillNote}
                            onSave={n => handleAttachSkill(skill.id, n)}
                            onCancel={() => { setPendingSkillId(null); setPendingSkillNote("") }}
                          />
                        </div>
                      ) : (
                        <div className="flex items-start gap-2 px-2 py-1 rounded hover:bg-white group cursor-pointer"
                          onClick={() => setPendingSkillId(skill.id)}>
                          <BookOpen size={11} className="text-purple-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{skill.title}</p>
                            {skill.description && (
                              <p className="text-[11px] text-gray-400 line-clamp-1">{skill.description}</p>
                            )}
                          </div>
                          <span className="hidden group-hover:inline-flex items-center gap-0.5 text-[10px] text-purple-600 border border-purple-200 bg-purple-50 px-1 py-0.5 rounded">
                            <Plus size={10} /> Attach
                          </span>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>}
    </section>
  )
}

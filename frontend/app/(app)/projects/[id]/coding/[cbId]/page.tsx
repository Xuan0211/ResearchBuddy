"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  AlignLeft, BookOpen, Check, ChevronRight,
  Download, FileText, GripVertical, Pencil, Plus, Table2,
  Trash2, X,
} from "lucide-react"
import { api } from "@/lib/api"
import type {
  Codebook, CodebookCode, CodebookExcerpt, CodebookStage, Contact,
  Paper, StageCriterion, Transcript, TranscriptSegment,
} from "@/lib/types"

// ─── CodeTree with drag-and-drop ─────────────────────────────────────────────

function CodeTreeDnD({
  codes,
  selectedId,
  onSelect,
  onReorder,
}: {
  codes: CodebookCode[]
  selectedId: string | null
  onSelect: (id: string) => void
  onReorder: (codeId: string, newParentId: string | null, newOrder: number) => void
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string | null; position: "child" | "before" } | null>(null)

  function handleDragStart(e: React.DragEvent, id: string) {
    setDragId(id)
    e.dataTransfer.effectAllowed = "move"
  }

  function handleDragOver(e: React.DragEvent, targetId: string | null, position: "child" | "before") {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDropTarget({ id: targetId, position })
  }

  function handleDrop(e: React.DragEvent, targetId: string | null) {
    e.preventDefault()
    if (!dragId || dragId === targetId) { setDragId(null); setDropTarget(null); return }
    function isDescendant(parentId: string | null, childId: string): boolean {
      if (!parentId) return false
      const parent = codes.find(c => c.id === parentId)
      if (!parent) return false
      if (parent.parent_id === childId) return true
      return isDescendant(parent.parent_id, childId)
    }
    if (targetId && isDescendant(dragId, targetId)) {
      setDragId(null); setDropTarget(null); return
    }
    const siblings = codes
      .filter(c => c.parent_id === (targetId === null ? null : targetId))
      .sort((a, b) => a.order - b.order)
    const newOrder = siblings.length
    onReorder(dragId, targetId, newOrder)
    setDragId(null)
    setDropTarget(null)
  }

  function renderCode(code: CodebookCode, depth = 0): React.ReactNode {
    const children = codes.filter(c => c.parent_id === code.id).sort((a, b) => a.order - b.order)
    const isDropTarget = dropTarget?.id === code.id
    return (
      <div key={code.id}>
        <div
          draggable
          onDragStart={e => handleDragStart(e, code.id)}
          onDragOver={e => handleDragOver(e, code.id, "child")}
          onDrop={e => handleDrop(e, code.id)}
          onDragEnd={() => { setDragId(null); setDropTarget(null) }}
          className={`group flex items-center gap-1.5 rounded-lg text-xs cursor-pointer transition-colors
            ${selectedId === code.id ? "bg-indigo-50 text-indigo-700" : "hover:bg-gray-50 text-gray-700"}
            ${isDropTarget ? "ring-2 ring-indigo-300 ring-inset" : ""}
            ${dragId === code.id ? "opacity-40" : ""}
          `}
          style={{ paddingLeft: `${8 + depth * 14}px`, paddingRight: "8px", paddingTop: "6px", paddingBottom: "6px" }}
          onClick={() => onSelect(code.id)}
        >
          <GripVertical size={11} className="text-gray-300 group-hover:text-gray-400 flex-shrink-0" />
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: code.color }} />
          <span className="flex-1 font-medium truncate">{code.label}</span>
          {children.length > 0 && <ChevronRight size={10} className="text-gray-400" />}
        </div>
        {children.map(c => renderCode(c, depth + 1))}
      </div>
    )
  }

  const roots = codes.filter(c => !c.parent_id).sort((a, b) => a.order - b.order)

  return (
    <div>
      <div
        onDragOver={e => handleDragOver(e, null, "before")}
        onDrop={e => handleDrop(e, null)}
        className={`text-[10px] text-gray-300 text-center py-1.5 rounded-lg mb-0.5 border border-dashed transition-colors
          ${dropTarget?.id === null ? "border-indigo-300 bg-indigo-50/40 text-indigo-400" : "border-transparent"}`}
      >
        {dropTarget?.id === null ? "Drop here to make top-level" : "⋯"}
      </div>
      {roots.map(c => renderCode(c))}
    </div>
  )
}

// ─── Excerpt Panel ───────────────────────────────────────────────────────────

function ExcerptPanel({
  projectId, cbId, paperId, codeId, excerpts, contacts, onAdded,
}: {
  projectId: string; cbId: string; paperId: string; codeId: string
  excerpts: CodebookExcerpt[]; contacts: Contact[]
  onAdded: (exc: CodebookExcerpt) => void
}) {
  const mine = excerpts.filter(e => e.paper_id === paperId && e.code_id === codeId)
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState("")
  const [note, setNote] = useState("")
  const [coder, setCoder] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)
  const pasteZoneRef = useRef<HTMLDivElement>(null)
  const [images, setImages] = useState<string[]>([])   // base64 data-URLs

  function readFileAsDataURL(file: File): Promise<string> {
    return new Promise(res => {
      const reader = new FileReader()
      reader.onload = e => res(e.target?.result as string)
      reader.readAsDataURL(file)
    })
  }

  async function handleFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue
      const dataUrl = await readFileAsDataURL(file)
      setImages(prev => [...prev, dataUrl])
    }
  }

  // Global paste listener when the form is open
  useEffect(() => {
    if (!adding) return
    const handler = async (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? [])
      const imgItems = items.filter(i => i.type.startsWith("image/"))
      if (imgItems.length === 0) return
      e.preventDefault()
      for (const item of imgItems) {
        const file = item.getAsFile()
        if (file) { const d = await readFileAsDataURL(file); setImages(prev => [...prev, d]) }
      }
    }
    document.addEventListener("paste", handler)
    return () => document.removeEventListener("paste", handler)
  }, [adding])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const exc = await api.post<CodebookExcerpt>(
      `/api/projects/${projectId}/codebooks/${cbId}/excerpts`,
      { paper_id: paperId, code_id: codeId, text, note, coder, images }
    )
    onAdded(exc)
    setText(""); setNote(""); setCoder(""); setImages([]); setAdding(false)
  }

  // All images for a displayed excerpt (legacy + new)
  function allImages(e: CodebookExcerpt): string[] {
    const imgs = [...(e.images ?? [])]
    if (e.image && !imgs.includes(e.image)) imgs.unshift(e.image)
    return imgs
  }

  return (
    <div className="space-y-2">
      {mine.map(e => (
        <div key={e.id} className="rounded-lg border border-gray-100 p-3 text-xs space-y-1.5 bg-white">
          {allImages(e).map((src, i) => (
            <img key={i} src={src} alt="excerpt" className="rounded max-w-full max-h-48 object-contain border block" />
          ))}
          {e.text && <p className="text-gray-800 leading-relaxed italic">"{e.text}"</p>}
          {e.note && <p className="text-gray-500">{e.note}</p>}
          {e.coder && <p className="text-[10px] text-gray-400 font-mono">@{e.coder}</p>}
        </div>
      ))}
      {adding ? (
        <form onSubmit={submit} className="space-y-2 p-3 border border-blue-100 rounded-lg bg-blue-50/30">
          <textarea value={text} onChange={e => setText(e.target.value)}
            placeholder="Excerpt or quote…" rows={3}
            className="w-full border rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" />

          {/* Image area — paste or file pick */}
          <div
            ref={pasteZoneRef}
            className={`border-2 border-dashed rounded-lg p-2 transition-colors ${images.length ? "border-gray-200" : "border-gray-100"}`}
          >
            <div className="flex flex-wrap gap-2">
              {images.map((src, i) => (
                <div key={i} className="relative group">
                  <img src={src} alt="" className="h-16 w-16 rounded border object-cover" />
                  <button type="button"
                    onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                    className="absolute -top-1 -right-1 hidden group-hover:flex bg-red-500 text-white rounded-full w-4 h-4 items-center justify-center text-[10px]">
                    ×
                  </button>
                </div>
              ))}
              <button type="button"
                onClick={() => fileRef.current?.click()}
                className="h-16 w-16 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-gray-300 hover:text-gray-500 text-[10px] gap-0.5">
                <span className="text-base">📷</span>
                <span>Add</span>
              </button>
            </div>
            {images.length === 0 && (
              <p className="text-[10px] text-gray-300 text-center mt-1">Paste or click to add images</p>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => e.target.files && handleFiles(e.target.files)} />

          <input value={note} onChange={e => setNote(e.target.value)}
            placeholder="Analyst note" className="w-full border rounded-lg px-3 py-1.5 text-xs focus:outline-none bg-white" />
          <div className="flex gap-2 items-center">
            <input list="coder-hints" value={coder} onChange={e => setCoder(e.target.value)}
              placeholder="@coder" className="w-28 border rounded px-2 py-1 text-xs font-mono focus:outline-none bg-white" />
            <datalist id="coder-hints">{contacts.map(c => <option key={c.handle} value={c.handle} />)}</datalist>
            <button type="submit" className="bg-black text-white text-xs px-3 py-1 rounded-lg">Add</button>
            <button type="button" onClick={() => { setAdding(false); setImages([]) }} className="text-xs text-gray-400">Cancel</button>
          </div>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1">
          <Plus size={11} /> Add excerpt
        </button>
      )}
    </div>
  )
}

// ─── Transcript Editor ────────────────────────────────────────────────────────

function TranscriptEditor({
  transcript, codes, contacts, projectId, cbId, onUpdate,
}: {
  transcript: Transcript
  codes: CodebookCode[]
  contacts: Contact[]
  projectId: string
  cbId: string
  onUpdate: (t: Transcript) => void
}) {
  const textRef = useRef<HTMLDivElement>(null)
  const [popup, setPopup] = useState<{ x: number; y: number; start: number; end: number; text: string } | null>(null)
  const [selectedSegId, setSelectedSegId] = useState<string | null>(null)

  function getCharOffset(container: Node, node: Node, offset: number): number {
    let total = 0
    function walk(n: Node): boolean {
      if (n === node) {
        total += offset
        return true
      }
      if (n.nodeType === Node.TEXT_NODE) {
        total += (n.textContent?.length ?? 0)
      } else {
        for (let i = 0; i < n.childNodes.length; i++) {
          if (walk(n.childNodes[i])) return true
        }
      }
      return false
    }
    walk(container)
    return total
  }

  function handleMouseUp(e: React.MouseEvent) {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { setPopup(null); return }
    const range = sel.getRangeAt(0)
    const container = textRef.current
    if (!container || !container.contains(range.commonAncestorContainer)) { setPopup(null); return }
    const start = getCharOffset(container, range.startContainer, range.startOffset)
    const end = getCharOffset(container, range.endContainer, range.endOffset)
    if (start === end) { setPopup(null); return }
    const rect = range.getBoundingClientRect()
    setPopup({ x: rect.left + rect.width / 2, y: rect.bottom + 8, start, end, text: sel.toString() })
  }

  async function applyCode(codeId: string) {
    if (!popup) return
    const seg = await api.post<TranscriptSegment>(
      `/api/projects/${projectId}/codebooks/${cbId}/transcripts/${transcript.id}/segments`,
      { code_id: codeId, start: popup.start, end: popup.end, text: popup.text }
    )
    onUpdate({ ...transcript, segments: [...transcript.segments, seg] })
    setPopup(null)
    window.getSelection()?.removeAllRanges()
  }

  async function deleteSegment(segId: string) {
    await api.delete(`/api/projects/${projectId}/codebooks/${cbId}/transcripts/${transcript.id}/segments/${segId}`)
    onUpdate({ ...transcript, segments: transcript.segments.filter(s => s.id !== segId) })
    setSelectedSegId(null)
  }

  const segments = [...transcript.segments].sort((a, b) => a.start - b.start)
  const text = transcript.content
  const chunks: { text: string; seg?: TranscriptSegment }[] = []
  let cursor = 0
  for (const seg of segments) {
    if (seg.start > cursor) chunks.push({ text: text.slice(cursor, seg.start) })
    chunks.push({ text: text.slice(seg.start, seg.end), seg })
    cursor = seg.end
  }
  if (cursor < text.length) chunks.push({ text: text.slice(cursor) })

  const codeById = Object.fromEntries(codes.map(c => [c.id, c]))

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6">
        <div
          ref={textRef}
          onMouseUp={handleMouseUp}
          className="leading-8 text-sm text-gray-800 font-serif max-w-2xl select-text cursor-text whitespace-pre-wrap"
        >
          {chunks.map((chunk, i) => {
            if (!chunk.seg) return <span key={i}>{chunk.text}</span>
            const code = codeById[chunk.seg.code_id]
            const isSelected = selectedSegId === chunk.seg.id
            return (
              <mark
                key={i}
                onClick={() => setSelectedSegId(isSelected ? null : chunk.seg!.id)}
                className="cursor-pointer rounded px-0.5 transition-opacity"
                style={{
                  background: code ? `${code.color}33` : "#e0e7ff66",
                  borderBottom: `2px solid ${code?.color ?? "#6366f1"}`,
                  opacity: isSelected ? 1 : 0.8,
                }}
                title={code?.label ?? chunk.seg.code_id}
              >
                {chunk.text}
              </mark>
            )
          })}
        </div>
      </div>

      {popup && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-2 w-52"
          style={{ left: Math.min(popup.x - 100, window.innerWidth - 220), top: popup.y }}
        >
          <p className="text-[10px] text-gray-400 px-2 pb-1.5 border-b mb-1">Apply code to selection</p>
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {codes.filter(c => !c.parent_id).map(code => (
              <div key={code.id}>
                <button onClick={() => applyCode(code.id)}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-xs">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: code.color }} />
                  <span className="font-medium">{code.label}</span>
                </button>
                {codes.filter(c => c.parent_id === code.id).map(child => (
                  <button key={child.id} onClick={() => applyCode(child.id)}
                    className="w-full text-left pl-6 pr-2 py-1 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-xs text-gray-600">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: child.color }} />
                    {child.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <button onClick={() => setPopup(null)} className="mt-1 w-full text-center text-[11px] text-gray-400 hover:text-gray-700 py-1">Cancel</button>
        </div>
      )}

      <div className="w-64 border-l flex flex-col flex-shrink-0 bg-white">
        <div className="border-b px-4 py-3">
          <p className="text-xs font-medium text-gray-600">Coded segments · {transcript.segments.length}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {transcript.segments.sort((a, b) => a.start - b.start).map(seg => {
            const code = codeById[seg.code_id]
            return (
              <div key={seg.id}
                onClick={() => setSelectedSegId(seg.id === selectedSegId ? null : seg.id)}
                className={`rounded-lg border p-2.5 text-xs cursor-pointer transition-colors ${
                  selectedSegId === seg.id ? "border-indigo-200 bg-indigo-50/40" : "border-gray-100 hover:bg-gray-50"
                }`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: code?.color ?? "#6366f1" }} />
                  <span className="font-medium text-gray-700">{code?.label ?? seg.code_id}</span>
                  <button onClick={e => { e.stopPropagation(); deleteSegment(seg.id) }}
                    className="ml-auto text-gray-300 hover:text-red-500"><Trash2 size={11} /></button>
                </div>
                <p className="text-gray-600 line-clamp-2 italic">"{seg.text}"</p>
                {seg.note && <p className="text-gray-400 mt-0.5">{seg.note}</p>}
              </div>
            )
          })}
          {transcript.segments.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">Select text to start coding.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Code Editor ─────────────────────────────────────────────────────────────

function CodeEditor({ code, allCodes, projectId, cbId, onSave, onDelete }: {
  code: CodebookCode; allCodes: CodebookCode[]
  projectId: string; cbId: string
  onSave: () => void; onDelete: () => void
}) {
  const [form, setForm] = useState({ label: code.label, color: code.color, parent_id: code.parent_id ?? "", description: code.description })
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    setForm({ label: code.label, color: code.color, parent_id: code.parent_id ?? "", description: code.description })
  }, [code.id])
  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await api.patch(`/api/projects/${projectId}/codebooks/${cbId}/codes/${code.id}`, {
      ...form, parent_id: form.parent_id || null,
    })
    await onSave()
    setSaving(false)
  }
  return (
    <form onSubmit={save} className="max-w-md space-y-4">
      <div className="flex items-center gap-3">
        <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })}
          className="w-9 h-9 rounded-lg border cursor-pointer p-1" />
        <input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} required
          className="flex-1 border-b border-gray-200 px-1 py-1 text-base font-semibold focus:outline-none focus:border-black" />
      </div>
      <div>
        <label className="block text-[11px] font-medium text-gray-500 mb-1">Parent code</label>
        <select value={form.parent_id} onChange={e => setForm({ ...form, parent_id: e.target.value })}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none">
          <option value="">— None (top-level) —</option>
          {allCodes.filter(c => c.id !== code.id && !c.parent_id).map(c => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-[11px] font-medium text-gray-500 mb-1">Definition</label>
        <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
          rows={6} placeholder="When to apply this code…"
          className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none" />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="bg-black text-white text-xs px-4 py-2 rounded-lg disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onDelete} className="text-xs text-red-400 hover:text-red-600 px-3 py-2 flex items-center gap-1">
          <Trash2 size={12} /> Delete
        </button>
      </div>
    </form>
  )
}

// ─── Paper Picker Modal ────────────────────────────────────────────────────────

function PaperPickerModal({ allPapers, alreadyIn, onAdd, onClose }: {
  allPapers: Paper[]; alreadyIn: string[]
  onAdd: (ids: string[]) => void; onClose: () => void
}) {
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const filtered = allPapers.filter(p =>
    !alreadyIn.includes(p.id) &&
    (!search || p.title?.toLowerCase().includes(search.toLowerCase()) ||
      p.authors?.some(a => a.toLowerCase().includes(search.toLowerCase())))
  )
  function toggle(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
        <div className="px-5 py-4 border-b flex items-center gap-3">
          <h3 className="font-semibold text-sm flex-1">Add papers</h3>
          <span className="text-xs text-gray-400">{selected.size} selected</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={16} /></button>
        </div>
        <div className="px-4 py-2 border-b">
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search…" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black" />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map(p => (
            <label key={p.id} className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50">
              <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="mt-0.5 accent-black" />
              <div className="min-w-0">
                <p className="text-sm font-medium line-clamp-1">{p.title}</p>
                <p className="text-xs text-gray-400">{p.authors?.[0]?.split(",")[0]} {p.year ? `· ${p.year}` : ""}</p>
              </div>
            </label>
          ))}
        </div>
        <div className="px-5 py-3 border-t flex gap-2">
          <button onClick={() => onAdd([...selected])} disabled={selected.size === 0}
            className="bg-black text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50 flex-1">
            Add {selected.size > 0 ? `${selected.size} paper${selected.size > 1 ? "s" : ""}` : "papers"}
          </button>
          <button onClick={onClose} className="text-sm text-gray-400 px-4">Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ─── Stage builder inline panel ───────────────────────────────────────────────

function StageBuilder({ stages, onSave, onCancel }: {
  stages: CodebookStage[]
  onSave: (stages: any[]) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<any[]>(
    stages.length > 0 ? stages : [{ id: "s1", name: "Title screening", order: 0, criteria: [], pass_logic: "all_pass" }]
  )

  function addStage() {
    setDraft(prev => [...prev, {
      id: `s${Date.now()}`, name: `Stage ${prev.length + 1}`,
      order: prev.length, criteria: [], pass_logic: "all_pass",
    }])
  }

  function updateStage(i: number, updates: any) {
    setDraft(prev => prev.map((s, idx) => idx === i ? { ...s, ...updates } : s))
  }

  function addCriterion(stageIdx: number) {
    setDraft(prev => prev.map((s, i) => i === stageIdx ? {
      ...s, criteria: [...s.criteria, {
        id: `c${Date.now()}`, text: "", type: "boolean", options: [], order: s.criteria.length,
      }],
    } : s))
  }

  function updateCriterion(stageIdx: number, criIdx: number, updates: any) {
    setDraft(prev => prev.map((s, i) => i === stageIdx ? {
      ...s, criteria: s.criteria.map((c: any, j: number) => j === criIdx ? { ...c, ...updates } : c),
    } : s))
  }

  function removeCriterion(stageIdx: number, criIdx: number) {
    setDraft(prev => prev.map((s, i) => i === stageIdx ? {
      ...s, criteria: s.criteria.filter((_: any, j: number) => j !== criIdx),
    } : s))
  }

  function removeStage(i: number) {
    setDraft(prev => prev.filter((_, idx) => idx !== i))
  }

  return (
    <div className="space-y-4">
      {draft.map((stage, si) => (
        <div key={stage.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <input value={stage.name} onChange={e => updateStage(si, { name: e.target.value })}
              className="flex-1 font-medium text-sm border-b border-gray-200 focus:outline-none focus:border-black py-0.5" />
            <select value={stage.pass_logic} onChange={e => updateStage(si, { pass_logic: e.target.value })}
              className="text-xs border rounded px-2 py-1 text-gray-600 focus:outline-none">
              <option value="all_pass">All must pass</option>
              <option value="any_pass">Any passes</option>
            </select>
            <button onClick={() => removeStage(si)} className="text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
          </div>
          <div className="space-y-2">
            {stage.criteria.map((c: any, ci: number) => (
              <div key={c.id} className="flex items-start gap-2">
                <input value={c.text} onChange={e => updateCriterion(si, ci, { text: e.target.value })}
                  placeholder="Criterion text"
                  className="flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-black" />
                <select value={c.type} onChange={e => updateCriterion(si, ci, { type: e.target.value })}
                  className="text-xs border rounded px-2 py-1 text-gray-600 focus:outline-none">
                  <option value="boolean">Yes/No</option>
                  <option value="select">Single choice</option>
                  <option value="multiselect">Multi-choice</option>
                </select>
                {(c.type === "select" || c.type === "multiselect") && (
                  <input value={(c.options || []).join(", ")}
                    onChange={e => updateCriterion(si, ci, { options: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) })}
                    placeholder="opt1, opt2"
                    className="w-28 border rounded px-2 py-1 text-xs focus:outline-none" />
                )}
                <button onClick={() => removeCriterion(si, ci)} className="text-gray-300 hover:text-red-500 mt-0.5"><X size={12} /></button>
              </div>
            ))}
            <button onClick={() => addCriterion(si)}
              className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1">
              <Plus size={11} /> Add criterion
            </button>
          </div>
        </div>
      ))}
      <button onClick={addStage} className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1">
        <Plus size={12} /> Add stage
      </button>
      <div className="flex gap-2 pt-1">
        <button onClick={() => onSave(draft)} className="bg-black text-white text-xs px-4 py-2 rounded-lg">Save stages</button>
        <button onClick={onCancel} className="text-xs text-gray-400">Cancel</button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = "papers" | "codes" | "matrix" | "transcripts"

export default function CodebookDetailPage() {
  const { id: projectId, cbId } = useParams<{ id: string; cbId: string }>()
  const router = useRouter()
  const [cb, setCb] = useState<Codebook | null>(null)
  const [allPapers, setAllPapers] = useState<Paper[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [transcripts, setTranscripts] = useState<Transcript[]>([])
  const [activeTranscript, setActiveTranscript] = useState<Transcript | null>(null)
  const [tab, setTab] = useState<Tab>("papers")
  const [loading, setLoading] = useState(true)

  // Papers tab
  const [showPaperPicker, setShowPaperPicker] = useState(false)
  const [editingStages, setEditingStages] = useState(false)
  const [activeStageId, setActiveStageId] = useState<string | null>(null)

  // Codes tab
  const [selectedCodeId, setSelectedCodeId] = useState<string | null>(null)
  const [addingCode, setAddingCode] = useState(false)
  const [codeForm, setCodeForm] = useState({ label: "", parent_id: "", color: "#6366f1", description: "" })

  // Matrix tab
  const [activeCell, setActiveCell] = useState<{ paperId: string; codeId: string } | null>(null)

  // Transcripts tab
  const [showTranscriptForm, setShowTranscriptForm] = useState(false)
  const [transcriptForm, setTranscriptForm] = useState({ title: "", content: "", source: "interview" })

  // Title editing
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState("")

  useEffect(() => {
    Promise.all([
      api.get<Codebook>(`/api/projects/${projectId}/codebooks/${cbId}`),
      api.get<Paper[]>(`/api/projects/${projectId}/papers`).catch(() => [] as Paper[]),
      api.get<Contact[]>(`/api/projects/${projectId}/contacts`).catch(() => [] as Contact[]),
      api.get<Transcript[]>(`/api/projects/${projectId}/codebooks/${cbId}/transcripts`).catch(() => [] as Transcript[]),
    ]).then(([codebook, papers, ctcts, trans]) => {
      setCb(codebook)
      setTitleDraft(codebook.title)
      setAllPapers(papers.filter(p => p.title))
      setContacts(ctcts)
      setTranscripts(trans)
      const stages = (codebook.stages ?? []) as CodebookStage[]
      if (stages.length) setActiveStageId(stages[0].id)
    }).finally(() => setLoading(false))
  }, [projectId, cbId])

  const refresh = useCallback(async () => {
    const updated = await api.get<Codebook>(`/api/projects/${projectId}/codebooks/${cbId}`)
    setCb(updated)
  }, [projectId, cbId])

  async function saveTitle() {
    if (!cb || titleDraft === cb.title) { setEditingTitle(false); return }
    await api.patch(`/api/projects/${projectId}/codebooks/${cbId}`, { title: titleDraft })
    setCb(prev => prev ? { ...prev, title: titleDraft } : prev)
    setEditingTitle(false)
  }

  // ── Papers ──

  async function addPapers(ids: string[]) {
    await api.post(`/api/projects/${projectId}/codebooks/${cbId}/papers`, { paper_ids: ids })
    await refresh(); setShowPaperPicker(false)
  }

  async function removePaper(paperId: string) {
    if (!confirm("Remove this paper?")) return
    await api.delete(`/api/projects/${projectId}/codebooks/${cbId}/papers/${paperId}`)
    await refresh()
  }

  async function saveStages(stages: any[]) {
    await api.put(`/api/projects/${projectId}/codebooks/${cbId}/stages`, { stages })
    await refresh()
    setEditingStages(false)
    const updated = await api.get<Codebook>(`/api/projects/${projectId}/codebooks/${cbId}`)
    const newStages = (updated.stages ?? []) as CodebookStage[]
    if (newStages.length) setActiveStageId(newStages[0].id)
  }

  async function stageDecision(paperId: string, stageId: string, criterionId: string, value: any) {
    await api.patch(
      `/api/projects/${projectId}/codebooks/${cbId}/stage-screening/${paperId}/${stageId}`,
      { decisions: { [criterionId]: value } }
    )
    await refresh()
  }

  async function overrideStage(paperId: string, stage: string) {
    await api.patch(`/api/projects/${projectId}/codebooks/${cbId}/stage-override/${paperId}`, { stage })
    await refresh()
  }

  // ── Codes ──

  async function createCode(e: React.FormEvent) {
    e.preventDefault()
    await api.post(`/api/projects/${projectId}/codebooks/${cbId}/codes`, {
      label: codeForm.label, parent_id: codeForm.parent_id || null,
      color: codeForm.color, description: codeForm.description,
    })
    await refresh()
    setCodeForm({ label: "", parent_id: "", color: "#6366f1", description: "" })
    setAddingCode(false)
  }

  async function deleteCode(codeId: string) {
    if (!confirm("Delete this code and its excerpts?")) return
    await api.delete(`/api/projects/${projectId}/codebooks/${cbId}/codes/${codeId}`)
    await refresh()
    if (selectedCodeId === codeId) setSelectedCodeId(null)
  }

  async function reorderCode(codeId: string, newParentId: string | null, newOrder: number) {
    await api.patch(`/api/projects/${projectId}/codebooks/${cbId}/codes/${codeId}`, {
      parent_id: newParentId, order: newOrder,
    })
    await refresh()
  }

  // ── Excerpts ──

  function handleExcerptAdded(exc: CodebookExcerpt) {
    setCb(prev => prev ? { ...prev, excerpts: [...(prev.excerpts ?? []), exc] } : prev)
  }

  // ── Transcripts ──

  async function createTranscript(e: React.FormEvent) {
    e.preventDefault()
    const t = await api.post<Transcript>(
      `/api/projects/${projectId}/codebooks/${cbId}/transcripts`,
      transcriptForm
    )
    setTranscripts(prev => [...prev, t])
    setTranscriptForm({ title: "", content: "", source: "interview" })
    setShowTranscriptForm(false)
    setActiveTranscript(t)
  }

  async function deleteTranscript(id: string) {
    if (!confirm("Delete this transcript?")) return
    await api.delete(`/api/projects/${projectId}/codebooks/${cbId}/transcripts/${id}`)
    setTranscripts(prev => prev.filter(t => t.id !== id))
    if (activeTranscript?.id === id) setActiveTranscript(null)
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading…</div>
  if (!cb) return <div className="p-8 text-sm text-red-500">Codebook not found</div>

  const cbStages = (cb.stages ?? []) as CodebookStage[]
  const activeStage = cbStages.find(s => s.id === activeStageId) ?? cbStages[0]
  const cbPapers = allPapers.filter(p => cb.papers?.includes(p.id))
  const selectedCode = cb.codes?.find(c => c.id === selectedCodeId) ?? null

  const includedPapers = cbPapers.filter(p => {
    const entry = cb.screening?.[p.id]
    if (!entry) return cbStages.length === 0
    return entry.current_stage === "coding"
  })

  const cbCodes = cb.codes ?? []
  const rootCodes = cbCodes.filter(c => !c.parent_id).sort((a, b) => a.order - b.order)
  const allCodesFlat: (CodebookCode & { _depth: number })[] = []
  function flattenCodes(parentId: string | null, depth: number) {
    const children = cbCodes.filter(c => c.parent_id === parentId).sort((a, b) => a.order - b.order)
    for (const c of children) {
      allCodesFlat.push({ ...c, _depth: depth })
      flattenCodes(c.id, depth + 1)
    }
  }
  for (const rc of rootCodes) {
    allCodesFlat.push({ ...rc, _depth: 0 })
    flattenCodes(rc.id, 1)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b bg-white px-6 py-3 flex items-center gap-3 flex-shrink-0">
        <button onClick={() => router.back()} className="text-xs text-gray-400 hover:text-black">←</button>
        {editingTitle ? (
          <input autoFocus value={titleDraft} onChange={e => setTitleDraft(e.target.value)}
            onBlur={saveTitle} onKeyDown={e => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setEditingTitle(false) }}
            className="text-base font-semibold focus:outline-none border-b border-black" />
        ) : (
          <h1 className="text-base font-semibold cursor-pointer hover:text-gray-600" onClick={() => setEditingTitle(true)}>
            {cb.title}
          </h1>
        )}
        <div className="ml-auto flex items-center gap-3 text-xs text-gray-400">
          <span>{cb.papers?.length ?? 0} papers · {cb.codes?.length ?? 0} codes · {transcripts.length} transcripts</span>
          <a href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/projects/${projectId}/codebooks/${cbId}/export/csv`}
            download className="inline-flex items-center gap-1 border rounded-lg px-2.5 py-1.5 text-gray-500 hover:text-black">
            <Download size={11} /> Export CSV
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b bg-white px-6 flex gap-1 flex-shrink-0">
        {([
          { id: "papers", label: "Papers", icon: <BookOpen size={13} /> },
          { id: "codes",  label: "Codes",  icon: <AlignLeft size={13} /> },
          { id: "matrix", label: "Matrix", icon: <Table2 size={13} /> },
          { id: "transcripts", label: "Transcripts", icon: <FileText size={13} /> },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? "border-black text-black" : "border-transparent text-gray-500 hover:text-black"
            }`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">

        {/* ═══ PAPERS TAB ═══ */}
        {tab === "papers" && (
          <div className="p-6 max-w-5xl space-y-5">
            <div className="border border-gray-100 rounded-xl bg-white shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-50">
                <span className="text-sm font-medium">Screening stages</span>
                <div className="flex gap-1 ml-2">
                  {cbStages.map(s => (
                    <button key={s.id} onClick={() => setActiveStageId(s.id)}
                      className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                        activeStageId === s.id ? "bg-black text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}>
                      {s.name}
                    </button>
                  ))}
                </div>
                <button onClick={() => setEditingStages(v => !v)}
                  className="ml-auto text-xs text-gray-400 hover:text-black flex items-center gap-1">
                  <Pencil size={11} /> {editingStages ? "Close" : "Edit stages"}
                </button>
              </div>
              {editingStages ? (
                <div className="p-4">
                  <StageBuilder stages={cbStages} onSave={saveStages} onCancel={() => setEditingStages(false)} />
                </div>
              ) : cbStages.length === 0 ? (
                <p className="px-4 py-3 text-xs text-gray-400">No stages configured. Click "Edit stages" to add screening rounds.</p>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium">Papers</h4>
              <span className="text-xs text-gray-400">{cbPapers.length} total · {includedPapers.length} → coding</span>
              <button onClick={() => setShowPaperPicker(true)}
                className="ml-auto inline-flex items-center gap-1.5 bg-black text-white text-xs px-3 py-1.5 rounded-lg">
                <Plus size={12} /> Add papers
              </button>
            </div>

            {showPaperPicker && (
              <PaperPickerModal allPapers={allPapers} alreadyIn={cb.papers ?? []}
                onAdd={addPapers} onClose={() => setShowPaperPicker(false)} />
            )}

            {cbPapers.length === 0 ? (
              <p className="text-sm text-gray-400">No papers yet.</p>
            ) : (
              <div className="border border-gray-100 rounded-xl overflow-hidden bg-white shadow-sm">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-50 bg-gray-50/60">
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500">Paper</th>
                      {activeStage?.criteria.map((c: StageCriterion) => (
                        <th key={c.id} className="px-3 py-2.5 text-center font-medium text-gray-500 max-w-[90px]">
                          <span className="block truncate text-[11px]" title={c.text}>{c.text.slice(0, 18)}{c.text.length > 18 ? "…" : ""}</span>
                          <span className="text-[10px] font-normal text-gray-400">{c.type}</span>
                        </th>
                      ))}
                      <th className="px-3 py-2.5 font-medium text-gray-500 text-center">Stage</th>
                      <th className="px-2 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {cbPapers.map(p => {
                      const screeningEntry = cb.screening?.[p.id]
                      const currentStage = screeningEntry?.current_stage ?? cbStages[0]?.id ?? "coding"
                      const stageEntry = screeningEntry?.stages?.[activeStage?.id ?? ""] ?? {}
                      return (
                        <tr key={p.id} className={`border-b border-gray-50 hover:bg-gray-50/40 ${
                          currentStage === "excluded" ? "opacity-50" : ""
                        }`}>
                          <td className="px-4 py-2.5">
                            <p className="font-medium line-clamp-1">{p.title}</p>
                            <p className="text-gray-400 text-[11px]">{p.authors?.[0]?.split(",")[0]} {p.year ? `· ${p.year}` : ""}</p>
                          </td>
                          {activeStage?.criteria.map((c: StageCriterion) => (
                            <td key={c.id} className="px-3 py-2.5 text-center">
                              {c.type === "boolean" ? (
                                <button
                                  onClick={() => stageDecision(p.id, activeStage.id, c.id,
                                    stageEntry[c.id] === "pass" ? "fail" : stageEntry[c.id] === "fail" ? "pending" : "pass"
                                  )}
                                  className="p-1.5 rounded-lg hover:bg-gray-100"
                                  title={`${stageEntry[c.id] ?? "pending"} — click to cycle`}
                                >
                                  {stageEntry[c.id] === "pass" ? <Check size={13} className="text-emerald-600" />
                                    : stageEntry[c.id] === "fail" ? <X size={13} className="text-red-500" />
                                    : <span className="text-gray-300 text-xs">—</span>}
                                </button>
                              ) : c.type === "select" ? (
                                <select
                                  value={stageEntry[c.id] ?? ""}
                                  onChange={e => stageDecision(p.id, activeStage.id, c.id, e.target.value)}
                                  className="text-xs border rounded px-1 py-0.5 focus:outline-none max-w-[80px]"
                                >
                                  <option value="">—</option>
                                  {c.options.map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                              ) : (
                                <div className="flex flex-wrap gap-0.5 justify-center">
                                  {c.options.map(o => {
                                    const vals = (stageEntry[c.id] as string[] | undefined) ?? []
                                    return (
                                      <label key={o} className="flex items-center gap-0.5 text-[10px] cursor-pointer">
                                        <input type="checkbox" checked={vals.includes(o)}
                                          onChange={e => {
                                            const next = e.target.checked ? [...vals, o] : vals.filter((v: string) => v !== o)
                                            stageDecision(p.id, activeStage.id, c.id, next)
                                          }} className="accent-black" />
                                        {o}
                                      </label>
                                    )
                                  })}
                                </div>
                              )}
                            </td>
                          ))}
                          <td className="px-3 py-2.5 text-center">
                            <select value={currentStage}
                              onChange={e => overrideStage(p.id, e.target.value)}
                              className={`text-[10px] px-2 py-0.5 rounded-full border focus:outline-none ${
                                currentStage === "coding" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : currentStage === "excluded" ? "bg-red-50 text-red-500 border-red-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                              }`}>
                              {cbStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                              <option value="coding">→ Coding</option>
                              <option value="excluded">Excluded</option>
                            </select>
                          </td>
                          <td className="px-2 py-2.5">
                            <button onClick={() => removePaper(p.id)} className="p-1 text-gray-300 hover:text-red-500">
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ═══ CODES TAB ═══ */}
        {tab === "codes" && (
          <div className="flex h-full overflow-hidden">
            <div className="w-64 border-r flex flex-col flex-shrink-0">
              <div className="px-3 py-3 border-b flex items-center gap-2">
                <span className="text-xs font-medium text-gray-600 flex-1">Codes</span>
                <button onClick={() => setAddingCode(true)} className="text-xs text-gray-400 hover:text-black flex items-center gap-1">
                  <Plus size={12} /> New
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {(cb.codes?.length ?? 0) === 0 ? (
                  <p className="text-xs text-gray-400 p-2">No codes yet.</p>
                ) : (
                  <CodeTreeDnD
                    codes={cb.codes ?? []}
                    selectedId={selectedCodeId}
                    onSelect={setSelectedCodeId}
                    onReorder={reorderCode}
                  />
                )}
              </div>
            </div>
            <div className="flex-1 p-6 overflow-y-auto">
              {addingCode ? (
                <form onSubmit={createCode} className="max-w-md space-y-4">
                  <h3 className="font-medium text-sm">New code</h3>
                  <div className="flex gap-3 items-center">
                    <input type="color" value={codeForm.color} onChange={e => setCodeForm({ ...codeForm, color: e.target.value })}
                      className="w-9 h-9 rounded-lg border cursor-pointer p-1" />
                    <input autoFocus value={codeForm.label} onChange={e => setCodeForm({ ...codeForm, label: e.target.value })}
                      placeholder="Code label" required
                      className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black" />
                  </div>
                  <select value={codeForm.parent_id} onChange={e => setCodeForm({ ...codeForm, parent_id: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none">
                    <option value="">— None (top-level) —</option>
                    {(cb.codes ?? []).filter(c => !c.parent_id).map(c => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                  <textarea value={codeForm.description} onChange={e => setCodeForm({ ...codeForm, description: e.target.value })}
                    placeholder="Definition…" rows={4}
                    className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none" />
                  <div className="flex gap-2">
                    <button type="submit" className="bg-black text-white text-xs px-4 py-2 rounded-lg">Create</button>
                    <button type="button" onClick={() => setAddingCode(false)} className="text-xs text-gray-400">Cancel</button>
                  </div>
                </form>
              ) : selectedCode ? (
                <CodeEditor code={selectedCode} allCodes={cb.codes ?? []} projectId={projectId} cbId={cbId}
                  onSave={refresh} onDelete={() => deleteCode(selectedCode.id)} />
              ) : (
                <div className="text-center pt-20 text-gray-300">
                  <AlignLeft size={40} className="mx-auto mb-3" />
                  <p className="text-sm">Select a code to edit, or create a new one.</p>
                  <p className="text-xs mt-1">Drag codes to rearrange hierarchy.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ MATRIX TAB ═══ */}
        {tab === "matrix" && (
          <div className="flex h-full overflow-hidden">
            <div className="flex-1 overflow-auto p-4">
              {includedPapers.length === 0 || allCodesFlat.length === 0 ? (
                <div className="text-center py-20 text-gray-400">
                  <Table2 size={36} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Move papers to "Coding" stage and add codes to see the matrix.</p>
                </div>
              ) : (
                <table className="border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-left font-medium text-gray-500 min-w-[200px] sticky left-0 z-10">
                        Paper
                      </th>
                      {allCodesFlat.map(code => (
                        <th key={code.id}
                          className={`border border-gray-200 px-2 py-2 font-medium min-w-[100px] whitespace-nowrap ${
                            code._depth === 0 ? "bg-gray-50 text-gray-600" : "bg-gray-50/50 text-gray-400"
                          }`}
                          style={{ paddingLeft: `${8 + code._depth * 10}px` }}
                        >
                          <div className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: code.color }} />
                            <span className="truncate max-w-[80px]">{code.label}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {includedPapers.map(paper => (
                      <tr key={paper.id} className="hover:bg-gray-50/60">
                        <td className="border border-gray-200 px-3 py-2 sticky left-0 bg-white z-10">
                          <p className="font-medium line-clamp-1">{paper.title}</p>
                          <p className="text-gray-400 text-[10px]">{paper.authors?.[0]?.split(",")[0]} {paper.year ?? ""}</p>
                        </td>
                        {allCodesFlat.map(code => {
                          const count = (cb.excerpts ?? []).filter(e => e.paper_id === paper.id && e.code_id === code.id).length
                          const isActive = activeCell?.paperId === paper.id && activeCell?.codeId === code.id
                          return (
                            <td key={code.id}
                              className={`border border-gray-200 px-2 py-1.5 cursor-pointer text-center transition-colors ${
                                isActive ? "bg-indigo-50" : count > 0 ? "bg-violet-50/40 hover:bg-violet-50" : "hover:bg-gray-50"
                              }`}
                              onClick={() => setActiveCell(isActive ? null : { paperId: paper.id, codeId: code.id })}>
                              {count > 0 ? (
                                <span className="text-[10px] font-medium text-violet-700 bg-violet-100 rounded px-1.5 py-0.5">{count}</span>
                              ) : <span className="text-gray-200 text-xs">+</span>}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {activeCell && (
              <div className="w-80 border-l bg-white flex flex-col flex-shrink-0">
                <div className="border-b px-4 py-3 flex items-center gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">
                      {(cb.codes ?? []).find(c => c.id === activeCell.codeId)?.label}
                    </p>
                    <p className="text-[11px] text-gray-400 truncate">
                      {allPapers.find(p => p.id === activeCell.paperId)?.title}
                    </p>
                  </div>
                  <button onClick={() => setActiveCell(null)} className="ml-auto text-gray-400 hover:text-gray-700"><X size={14} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <ExcerptPanel
                    projectId={projectId} cbId={cbId}
                    paperId={activeCell.paperId} codeId={activeCell.codeId}
                    excerpts={cb.excerpts ?? []} contacts={contacts}
                    onAdded={handleExcerptAdded}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ TRANSCRIPTS TAB ═══ */}
        {tab === "transcripts" && (
          <div className="flex h-full overflow-hidden">
            <div className={`${activeTranscript ? "w-56" : "w-full max-w-2xl"} border-r flex flex-col flex-shrink-0`}>
              <div className="px-4 py-3 border-b flex items-center gap-2">
                <span className="text-sm font-medium flex-1">Transcripts</span>
                <button onClick={() => setShowTranscriptForm(v => !v)}
                  className="text-xs text-gray-400 hover:text-black flex items-center gap-1">
                  <Plus size={12} /> New
                </button>
              </div>

              {showTranscriptForm && (
                <form onSubmit={createTranscript} className="p-4 space-y-3 border-b border-gray-100 bg-gray-50/40">
                  <div className="flex gap-2">
                    <input autoFocus value={transcriptForm.title}
                      onChange={e => setTranscriptForm({ ...transcriptForm, title: e.target.value })}
                      placeholder="Title (e.g. Interview P1)" required
                      className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black" />
                    <select value={transcriptForm.source}
                      onChange={e => setTranscriptForm({ ...transcriptForm, source: e.target.value })}
                      className="border rounded-lg px-2 py-2 text-sm focus:outline-none text-gray-600">
                      <option value="interview">Interview</option>
                      <option value="focus_group">Focus group</option>
                      <option value="observation">Observation</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  {/* File import OR paste */}
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-black border rounded-lg px-2.5 py-1.5 cursor-pointer transition-colors">
                      📄 Import .txt
                      <input type="file" accept=".txt,text/plain" className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          const reader = new FileReader()
                          reader.onload = ev => {
                            setTranscriptForm(f => ({
                              ...f,
                              title: f.title || file.name.replace(/\.txt$/i, ""),
                              content: ev.target?.result as string,
                            }))
                          }
                          reader.readAsText(file)
                        }}
                      />
                    </label>
                    <span className="text-xs text-gray-300">or paste below</span>
                  </div>
                  <textarea value={transcriptForm.content}
                    onChange={e => setTranscriptForm({ ...transcriptForm, content: e.target.value })}
                    placeholder="Paste transcript text here…" rows={6} required
                    className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none" />
                  <div className="flex gap-2">
                    <button type="submit" className="bg-black text-white text-xs px-4 py-2 rounded-lg">Create</button>
                    <button type="button" onClick={() => setShowTranscriptForm(false)} className="text-xs text-gray-400">Cancel</button>
                  </div>
                </form>
              )}

              <div className="flex-1 overflow-y-auto">
                {transcripts.length === 0 ? (
                  <p className="text-xs text-gray-400 p-4">No transcripts yet.</p>
                ) : (
                  transcripts.map(t => (
                    <div key={t.id}
                      className={`group border-b border-gray-50 px-4 py-3 cursor-pointer hover:bg-gray-50 ${activeTranscript?.id === t.id ? "bg-indigo-50/40" : ""}`}
                      onClick={() => setActiveTranscript(t)}>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-medium flex-1 truncate">{t.title}</p>
                        <button onClick={e => { e.stopPropagation(); deleteTranscript(t.id) }}
                          className="hidden group-hover:block text-gray-300 hover:text-red-500">
                          <Trash2 size={11} />
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {t.source} · {t.segments?.length ?? 0} segments
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {activeTranscript && (cb.codes?.length ?? 0) > 0 ? (
              <div className="flex-1 overflow-hidden">
                <TranscriptEditor
                  transcript={activeTranscript}
                  codes={cb.codes ?? []}
                  contacts={contacts}
                  projectId={projectId}
                  cbId={cbId}
                  onUpdate={updated => {
                    setActiveTranscript(updated)
                    setTranscripts(prev => prev.map(t => t.id === updated.id ? updated : t))
                  }}
                />
              </div>
            ) : activeTranscript ? (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <AlignLeft size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Add codes first (Codes tab).</p>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

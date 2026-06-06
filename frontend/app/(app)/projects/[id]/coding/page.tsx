"use client"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { BookOpen, Plus, Trash2 } from "lucide-react"
import { api } from "@/lib/api"
import type { Codebook } from "@/lib/types"
import SectionResourcesPanel from "@/components/SectionResourcesPanel"

export default function CodingPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const router = useRouter()
  const [codebooks, setCodebooks] = useState<Codebook[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ title: "", description: "" })

  useEffect(() => {
    api.get<Codebook[]>(`/api/projects/${projectId}/codebooks`)
      .then(setCodebooks)
      .finally(() => setLoading(false))
  }, [projectId])

  async function createCodebook(e: React.FormEvent) {
    e.preventDefault()
    const cb = await api.post<Codebook>(`/api/projects/${projectId}/codebooks`, form)
    setCodebooks(prev => [...prev, cb])
    setForm({ title: "", description: "" })
    setCreating(false)
    router.push(`/projects/${projectId}/coding/${cb.id}`)
  }

  async function deleteCodebook(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (!confirm("Delete this codebook?")) return
    await api.delete(`/api/projects/${projectId}/codebooks/${id}`)
    setCodebooks(prev => prev.filter(cb => cb.id !== id))
  }

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading…</div>

  return (
    <div className="p-6 max-w-4xl space-y-5">
      <SectionResourcesPanel projectId={projectId} section="coding" title="Coding docs and skills" />

      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Coding</h3>
          <p className="text-xs text-gray-400 mt-0.5">Qualitative analysis codebooks</p>
        </div>
        <button onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 bg-black text-white text-xs px-3 py-1.5 rounded-lg">
          <Plus size={13} /> New codebook
        </button>
      </div>

      {creating && (
        <form onSubmit={createCodebook} className="border border-gray-100 rounded-xl p-4 space-y-3 bg-white shadow-sm">
          <input autoFocus value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
            placeholder="Codebook title" required
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black" />
          <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
            placeholder="Description (optional)"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none" />
          <div className="flex gap-2">
            <button type="submit" className="bg-black text-white text-xs px-4 py-1.5 rounded-lg">Create</button>
            <button type="button" onClick={() => setCreating(false)} className="text-xs text-gray-400 hover:text-gray-700">Cancel</button>
          </div>
        </form>
      )}

      {codebooks.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <BookOpen size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No codebooks yet.</p>
          <p className="text-xs mt-1">Create one to start qualitative coding.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {codebooks.map(cb => (
            <li key={cb.id}
              className="border border-gray-100 rounded-xl px-5 py-4 hover:bg-gray-50 cursor-pointer bg-white shadow-sm transition-colors"
              onClick={() => router.push(`/projects/${projectId}/coding/${cb.id}`)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm">{cb.title}</p>
                  {cb.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{cb.description}</p>}
                  <div className="flex gap-3 mt-1.5 text-[11px] text-gray-400">
                    <span>{cb.papers?.length ?? 0} papers</span>
                    <span>{cb.codes?.length ?? 0} codes</span>
                    <span>{cb.criteria?.length ?? 0} criteria</span>
                  </div>
                </div>
                <button onClick={e => deleteCodebook(e, cb.id)}
                  className="p-1 text-gray-300 hover:text-red-500 rounded flex-shrink-0">
                  <Trash2 size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

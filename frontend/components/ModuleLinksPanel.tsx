"use client"
import { useEffect, useState } from "react"
import { ExternalLink, Plus, Trash2 } from "lucide-react"
import { api } from "@/lib/api"
import type { SectionResourceLink, SectionResources } from "@/lib/types"

type SectionKey = "papers" | "meetings" | "coding" | "workspace" | "writing" | "docs" | "images" | "prototype"

type Props = {
  projectId: string
  section: SectionKey
  title: string
  kind: "figma" | "github" | "overleaf" | "link"
  labelPlaceholder: string
  urlPlaceholder: string
  scope?: string
}

export default function ModuleLinksPanel({
  projectId,
  section,
  title,
  kind,
  labelPlaceholder,
  urlPlaceholder,
  scope = "",
}: Props) {
  const [links, setLinks] = useState<SectionResourceLink[]>([])
  const [form, setForm] = useState({ title: "", url: "" })
  const [loading, setLoading] = useState(true)

  function resourcePath(path: string) {
    const qs = scope ? `?scope=${encodeURIComponent(scope)}` : ""
    const joiner = path.includes("?") ? "&" : "?"
    return `/api/projects/${projectId}/module-resources/${section}${path}${scope && path.includes("?") ? `${joiner}scope=${encodeURIComponent(scope)}` : qs}`
  }

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<SectionResources>(resourcePath(""))
      setLinks((res.links ?? []).filter(link => link.kind === kind || kind === "link"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [projectId, section, scope, kind])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    await api.post<SectionResourceLink>(resourcePath("/links"), {
      kind,
      title: form.title,
      url: form.url,
    })
    setForm({ title: "", url: "" })
    await load()
  }

  async function remove(link: SectionResourceLink) {
    await api.delete(resourcePath(`/links/${link.id}`))
    await load()
  }

  return (
    <section className="rounded-md border bg-white">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-medium">{title}</h3>
      </div>
      <div className="space-y-3 p-4">
        <form onSubmit={create} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
          <input
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            placeholder={labelPlaceholder}
            className="rounded-md border px-2 py-1.5 text-xs text-gray-700"
          />
          <input
            value={form.url}
            onChange={e => setForm({ ...form, url: e.target.value })}
            placeholder={urlPlaceholder}
            required
            className="rounded-md border px-2 py-1.5 text-xs text-gray-700"
          />
          <button type="submit" className="inline-flex items-center justify-center gap-1 rounded-md border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
            <Plus size={12} /> Add
          </button>
        </form>

        {loading ? (
          <p className="text-xs text-gray-400">Loading links...</p>
        ) : links.length === 0 ? (
          <p className="text-xs text-gray-400">No links yet.</p>
        ) : (
          <ul className="space-y-2">
            {links.map(link => (
              <li key={link.id} className="flex items-start gap-2 rounded-md border border-gray-100 px-3 py-2">
                <a href={link.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                    <ExternalLink size={12} className="text-gray-400" /> {link.title}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-gray-400">{link.url}</p>
                </a>
                <button onClick={() => remove(link)} className="p-1 text-gray-300 hover:text-red-500">
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

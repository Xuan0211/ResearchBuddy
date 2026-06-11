"use client"
import { useEffect, useState } from "react"
import { ExternalLink, Plus, Trash2 } from "lucide-react"
import { api } from "@/lib/api"
import type { SectionResourceLink, SectionResources } from "@/lib/types"

type SectionKey = "papers" | "meetings" | "coding" | "workspace" | "writing" | "docs" | "design" | "prototype"

type Props = {
  projectId: string
  section: SectionKey
  title: string
  kind: "figma" | "github" | "overleaf" | "link"
  labelPlaceholder: string
  urlPlaceholder: string
  scope?: string
}

function titleFromUrl(url: string, kind: Props["kind"]) {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, "")
    const parts = parsed.pathname.split("/").filter(Boolean).map(part => decodeURIComponent(part))

    if (kind === "figma" || host === "figma.com") {
      const figmaTitle = parts.find((part, index) =>
        index >= 2 && !["branch", "proto", "design", "file", "board", "slides"].includes(part)
      )
      if (figmaTitle) return figmaTitle.replace(/[-_]+/g, " ").trim()
      const fileKey = parts[1] || parts[0]
      return fileKey ? `Figma ${fileKey}` : "Figma link"
    }

    const lastPart = parts.at(-1)
    if (lastPart) return lastPart.replace(/[-_]+/g, " ").trim()
    return host || url
  } catch {
    return url
  }
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
    return `/api/projects/${projectId}/module-resources/${section}${path}${qs}`
  }

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<SectionResources>(resourcePath(""))
      setLinks((res.links ?? []).filter(link => kind === "link" ? (link.kind === "link" || !link.kind) : link.kind === kind))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [projectId, section, scope, kind])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    const url = form.url.trim()
    const title = form.title.trim() || titleFromUrl(url, kind)
    await api.post<SectionResourceLink>(resourcePath("/links"), {
      kind,
      title,
      url,
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

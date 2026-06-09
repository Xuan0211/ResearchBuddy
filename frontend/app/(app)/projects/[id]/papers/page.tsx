"use client"
import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { RefreshCw, Settings, Download, Search, Image } from "lucide-react"
import { api } from "@/lib/api"
import type { Paper, Project } from "@/lib/types"
import SectionResourcesPanel from "@/components/SectionResourcesPanel"
import ModuleLinksPanel from "@/components/ModuleLinksPanel"

export default function PapersPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const router = useRouter()
  const [papers, setPapers] = useState<Paper[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [arxivInput, setArxivInput] = useState("")
  const [importing, setImporting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [exportingBib, setExportingBib] = useState(false)
  const [syncMsg, setSyncMsg] = useState("")
  const [showZoteroConfig, setShowZoteroConfig] = useState(false)

  // Filters
  const [search, setSearch] = useState("")
  const [filterTag, setFilterTag] = useState("")
  const [filterVenue, setFilterVenue] = useState("")
  const [filterYear, setFilterYear] = useState("")
  const [groupBy, setGroupBy] = useState<"none" | "year" | "venue" | "tag">("none")
  const [hideNoPreview, setHideNoPreview] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.get<Paper[]>(`/api/projects/${projectId}/papers`)
      .then(paps => setPapers(paps.filter(p => p.title)))
      .finally(() => setLoading(false))
    api.get<Project>(`/api/projects/${projectId}`)
      .then(setProject)
      .catch(() => {})
  }, [projectId])

  // Derived filter options
  const allTags = useMemo(() => [...new Set(papers.flatMap(p => p.tags ?? []))].sort(), [papers])
  const allVenues = useMemo(() => [...new Set(papers.map(p => p.venue).filter(Boolean))].sort(), [papers])
  const allYears = useMemo(() => [...new Set(papers.map(p => p.year).filter(Boolean))].sort((a, b) => (b ?? 0) - (a ?? 0)), [papers])

  const filtered = useMemo(() => papers.filter(p => {
    if (search) {
      const q = search.toLowerCase()
      const hit = p.title?.toLowerCase().includes(q)
        || p.authors?.some(a => a.toLowerCase().includes(q))
        || p.id?.toLowerCase().includes(q)
      if (!hit) return false
    }
    if (filterTag && !p.tags?.includes(filterTag)) return false
    if (filterVenue && p.venue !== filterVenue) return false
    if (filterYear && String(p.year) !== filterYear) return false
    if (hideNoPreview && !p.preview_image) return false
    return true
  }), [papers, search, filterTag, filterVenue, filterYear, hideNoPreview])

  // Group
  const grouped = useMemo(() => {
    if (groupBy === "none") return { "": filtered }
    const g: Record<string, Paper[]> = {}
    filtered.forEach(p => {
      let key = ""
      if (groupBy === "year") key = String(p.year ?? "Unknown")
      else if (groupBy === "venue") key = p.venue || "Unknown"
      else if (groupBy === "tag") {
        const t = p.tags?.[0] || "Untagged"
        key = t
      }
      if (!g[key]) g[key] = []
      g[key].push(p)
    })
    // Sort group keys
    return Object.fromEntries(
      Object.entries(g).sort(([a], [b]) =>
        groupBy === "year" ? (Number(b) || 0) - (Number(a) || 0) : a.localeCompare(b)
      )
    )
  }, [filtered, groupBy])

  async function importFromArxiv(e: React.FormEvent) {
    e.preventDefault()
    setImporting(true)
    try {
      await api.post(`/api/projects/${projectId}/papers`, { arxiv_id: arxivInput })
      setArxivInput("")
      const updated = await api.get<Paper[]>(`/api/projects/${projectId}/papers`)
      setPapers(updated.filter(p => p.title))
    } finally {
      setImporting(false)
    }
  }

  async function syncZotero() {
    if (!project?.zotero_configured) { setShowZoteroConfig(true); return }
    setSyncing(true); setSyncMsg("")
    try {
      const stats = await api.post<{ created: number; updated: number; skipped: number; total: number }>(
        `/api/projects/${projectId}/zotero/sync`
      )
      const updated = await api.get<Paper[]>(`/api/projects/${projectId}/papers`)
      setPapers(updated.filter(p => p.title))
      setProject(await api.get<Project>(`/api/projects/${projectId}`))
      setSyncMsg(`${stats.total} items — ${stats.created} new · ${stats.updated} updated · ${stats.skipped} skipped`)
    } catch (err: any) {
      setSyncMsg(err.message)
    } finally {
      setSyncing(false)
    }
  }

  async function exportBibtex() {
    setExportingBib(true)
    setSyncMsg("")
    try {
      const blob = await api.download(`/api/projects/${projectId}/papers/export/bib`)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "library.bib"
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setSyncMsg(err.message || "Could not export BibTeX")
    } finally {
      setExportingBib(false)
    }
  }

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading…</div>

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Toolbar ── */}
      <div className="border-b bg-white px-4 py-3 flex-shrink-0 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search title, author…"
            className="border rounded-lg px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-black"
          />

          {/* Tag filter */}
          <select value={filterTag} onChange={e => setFilterTag(e.target.value)}
            className="border rounded-lg px-2 py-1.5 text-sm text-gray-600 focus:outline-none">
            <option value="">All tags</option>
            {allTags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          {/* Venue filter */}
          <select value={filterVenue} onChange={e => setFilterVenue(e.target.value)}
            className="border rounded-lg px-2 py-1.5 text-sm text-gray-600 focus:outline-none">
            <option value="">All venues</option>
            {allVenues.map(v => <option key={v} value={v}>{v}</option>)}
          </select>

          {/* Year filter */}
          <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
            className="border rounded-lg px-2 py-1.5 text-sm text-gray-600 focus:outline-none">
            <option value="">All years</option>
            {allYears.map(y => <option key={y} value={String(y)}>{y}</option>)}
          </select>

          {/* Group by */}
          <select value={groupBy} onChange={e => setGroupBy(e.target.value as any)}
            className="border rounded-lg px-2 py-1.5 text-sm text-gray-600 focus:outline-none">
            <option value="none">No grouping</option>
            <option value="year">Group by year</option>
            <option value="venue">Group by venue</option>
            <option value="tag">Group by tag</option>
          </select>

          <button onClick={() => setHideNoPreview(v => !v)}
            title={hideNoPreview ? "Show all papers" : "Show only papers with preview image"}
            className={`p-1.5 rounded border ${hideNoPreview ? "bg-black text-white" : "text-gray-500 hover:bg-gray-100"}`}>
            <Image size={14} />
          </button>

          {(search || filterTag || filterVenue || filterYear) && (
            <button onClick={() => { setSearch(""); setFilterTag(""); setFilterVenue(""); setFilterYear("") }}
              className="text-xs text-gray-400 hover:text-black">Clear</button>
          )}

          <span className="text-xs text-gray-400 ml-1">{filtered.length} papers</span>

          {/* Right actions */}
          <div className="ml-auto flex items-center gap-2">
            <form onSubmit={importFromArxiv} className="flex gap-2">
              <input value={arxivInput} onChange={e => setArxivInput(e.target.value)}
                placeholder="ArXiv ID" className="border rounded-lg px-2 py-1.5 text-sm w-32 focus:outline-none" />
              <button type="submit" disabled={importing || !arxivInput}
                className="bg-black text-white text-sm px-3 py-1.5 rounded-lg disabled:opacity-50">
                {importing ? "…" : "Import"}
              </button>
            </form>
            <button onClick={syncZotero} disabled={syncing} title="Sync from Zotero"
              className="p-1.5 rounded border hover:bg-gray-50 disabled:opacity-50 relative text-gray-600">
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
              {!project?.zotero_configured && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400" />
              )}
            </button>
            <button
              onClick={exportBibtex}
              disabled={exportingBib}
              title="Export BibTeX library"
              className="p-1.5 rounded border hover:bg-gray-50 text-gray-600 flex items-center disabled:opacity-50"
            >
              <Download size={14} className={exportingBib ? "animate-pulse" : ""} />
            </button>
            <button onClick={() => setShowZoteroConfig(true)} title="Zotero settings"
              className="p-1.5 rounded border hover:bg-gray-50 text-gray-600">
              <Settings size={14} />
            </button>
          </div>
        </div>

        {syncMsg && (
          <p className={`text-xs ${syncMsg.includes("new") ? "text-green-600" : "text-red-600"}`}>{syncMsg}</p>
        )}
      </div>

      {/* ── Gallery ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-4 space-y-3">
          <ModuleLinksPanel
            projectId={projectId}
            section="papers"
            kind="link"
            title="Paper links"
            labelPlaceholder="GitHub / Figma / Overleaf"
            urlPlaceholder="https://..."
          />
          <SectionResourcesPanel projectId={projectId} section="papers" title="Papers docs and skills" />
          <AIPapersPanel projectId={projectId} />
        </div>
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-500">No papers match your filters.</p>
        ) : (
          Object.entries(grouped).map(([group, items]) => (
            <div key={group} className="mb-6">
              {groupBy !== "none" && (
                <h3 className="text-sm font-semibold text-gray-700 mb-3 sticky top-0 bg-white/90 py-1 backdrop-blur">{group}</h3>
              )}
              <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5 gap-3">
                {items.map(p => (
                  <PaperCard key={p.id} paper={p} projectId={projectId} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {showZoteroConfig && (
        <ZoteroConfigModal
          projectId={projectId}
          onClose={() => setShowZoteroConfig(false)}
          onSaved={async () => {
            setShowZoteroConfig(false)
            setProject(await api.get<Project>(`/api/projects/${projectId}`))
          }}
        />
      )}
    </div>
  )
}

// ── AI Generated Papers section ───────────────────────────────────────────────

interface AIEntry { key: string; title: string; author: string; year: string; writing_id: string; bib_path: string }

export function AIPapersPanel({ projectId }: { projectId: string }) {
  const [entries, setEntries] = useState<AIEntry[]>([])
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    api.get<AIEntry[]>(`/api/projects/${projectId}/papers/ai-generated`)
      .then(setEntries).catch(() => {})
  }, [open, projectId])

  async function confirm(e: AIEntry) {
    setConfirming(e.key)
    try {
      await api.post(`/api/projects/${projectId}/papers/ai-generated/confirm`, { writing_id: e.writing_id, key: e.key })
      setEntries(prev => prev.filter(x => x.key !== e.key))
    } catch (err: any) { alert(err.message) }
    finally { setConfirming(null) }
  }

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="text-xs text-gray-400 hover:text-black underline underline-offset-2">
      Show AI-generated references
    </button>
  )

  return (
    <div className="border border-yellow-200 rounded-xl bg-yellow-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-yellow-800">AI Generated References ({entries.length})</p>
        <button onClick={() => setOpen(false)} className="text-yellow-600 hover:text-yellow-900 text-xs">Hide</button>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-yellow-700">No AI-generated references found. AI agents write to <code>ai-generated.bib</code> in writing projects.</p>
      ) : (
        <div className="space-y-2">
          {entries.map(e => (
            <div key={e.key} className="bg-white rounded-lg px-3 py-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{e.title || e.key}</p>
                <p className="text-[10px] text-gray-500">{e.author}{e.year ? ` · ${e.year}` : ""} · <code className="font-mono">@{e.key}</code></p>
              </div>
              <button onClick={() => confirm(e)} disabled={confirming === e.key}
                className="flex-shrink-0 text-xs bg-green-600 text-white px-2 py-1 rounded-md hover:bg-green-700 disabled:opacity-50">
                {confirming === e.key ? "…" : "Confirm"}
              </button>
            </div>
          ))}
          <p className="text-[10px] text-yellow-700">Confirming moves the entry to <code>reference.bib</code> in the writing project.</p>
        </div>
      )}
    </div>
  )
}

const HCI_VENUES = new Set(["CHI", "UIST", "DIS", "CSCW", "SIGCHI"])
const ML_VENUES = new Set(["ICLR", "ACL", "NEURIPS", "EMNLP", "NAACL", "CVPR", "ICCV", "ECCV", "ICML"])
const WEB_VENUES = new Set(["WWW"])

function getVenueBadge(venue: string | undefined): { label: string; cls: string } | null {
  if (!venue) return null
  const up = venue.toUpperCase()
  for (const kw of [...HCI_VENUES]) {
    if (up.includes(kw)) return { label: kw, cls: "bg-violet-50 text-violet-700 border border-violet-200" }
  }
  for (const kw of [...ML_VENUES]) {
    if (up.includes(kw)) return { label: kw, cls: "bg-blue-50 text-blue-700 border border-blue-200" }
  }
  for (const kw of [...WEB_VENUES]) {
    if (up.includes(kw)) return { label: kw, cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" }
  }
  return null
}

function PaperCard({ paper, projectId }: { paper: Paper; projectId: string }) {
  const router = useRouter()
  const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
  const [copied, setCopied] = useState(false)
  const cleanKey = paper.id.replace(/[^\x00-\x7Fa-zA-Z0-9_-]/g, "")

  function copyKey(e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(cleanKey || paper.id)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="mb-3 break-inside-avoid border rounded-lg overflow-hidden hover:shadow-md transition-shadow cursor-pointer group bg-white"
      onClick={() => router.push(`/projects/${projectId}/papers/${paper.id}`)}>
      {paper.preview_image && (
        <div className="bg-gray-50 overflow-hidden">
          <img src={`${BASE}${paper.preview_image}`} alt="" className="w-full max-h-72 object-cover" />
        </div>
      )}
      <div className="p-2.5 space-y-1">
        <p className="text-xs font-medium line-clamp-2 leading-tight">{paper.title}</p>
        <p className="text-xs text-gray-500 truncate">
          {paper.authors?.[0]?.split(",")[0]}{paper.year ? ` · ${paper.year}` : ""}
        </p>
        {(() => {
          const badge = getVenueBadge(paper.venue)
          return badge ? (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badge.cls}`}>{badge.label}</span>
          ) : null
        })()}

        {/* Link chips */}
        <div className="flex items-center gap-1 flex-wrap">
          {paper.arxiv_id && (
            <a href={paper.links?.arxiv || `https://arxiv.org/abs/${paper.arxiv_id}`} target="_blank" rel="noreferrer"
               onClick={e => e.stopPropagation()}
               className="text-[10px] bg-red-50 text-red-700 px-1 py-0.5 rounded font-medium">arXiv</a>
          )}
          {paper.links?.url && (
            <a href={paper.links.url} target="_blank" rel="noreferrer"
               onClick={e => e.stopPropagation()}
               className="text-[10px] bg-emerald-50 text-emerald-700 px-1 py-0.5 rounded font-medium">URL</a>
          )}
          {paper.doi && (
            <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noreferrer"
               onClick={e => e.stopPropagation()}
               className="text-[10px] bg-blue-50 text-blue-700 px-1 py-0.5 rounded font-medium">DOI</a>
          )}
          {paper.links?.zotero_web && (
            <a href={paper.links.zotero_web} target="_blank" rel="noreferrer"
               onClick={e => e.stopPropagation()}
               className="text-[10px] bg-amber-50 text-amber-700 px-1 py-0.5 rounded font-medium">Zotero</a>
          )}
          <button onClick={copyKey}
            className="ml-auto text-[10px] text-gray-400 hover:text-gray-700 font-mono hidden group-hover:inline">
            {copied ? "✓" : `@${(cleanKey || paper.id).slice(0, 10)}`}
          </button>
        </div>

        {paper.tags?.length > 0 && (
          <div className="flex flex-wrap gap-0.5">
            {paper.tags.slice(0, 2).map(t => (
              <span key={t} className="text-[10px] bg-gray-100 px-1 py-0.5 rounded-full text-gray-500">{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ZoteroConfigModal({ projectId, onClose, onSaved }: { projectId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ api_key: "", library_id: "", library_type: "user" })
  const [apiKeySet, setApiKeySet] = useState(false)
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    api.get<{ library_id: string; library_type: string; api_key_set: boolean }>(
      `/api/projects/${projectId}/zotero`
    ).then(cfg => {
      setForm({ api_key: "", library_id: cfg.library_id, library_type: cfg.library_type })
      setApiKeySet(cfg.api_key_set)
    }).catch(() => {}).finally(() => setLoadingConfig(false))
  }, [projectId])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!apiKeySet && !form.api_key) { setError("API key is required"); return }
    setSaving(true); setError("")
    try {
      await api.put(`/api/projects/${projectId}/zotero`, form)
      onSaved()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h3 className="font-semibold">Project Zotero Settings</h3>
        <p className="text-sm text-gray-500">
          Each project can point at a different Zotero personal or group library. Get your API key from{" "}
          <a href="https://www.zotero.org/settings/keys" target="_blank" rel="noreferrer" className="underline">zotero.org/settings/keys</a>.
        </p>
        {loadingConfig ? <p className="text-sm text-gray-400">Loading…</p> : (
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1">
                API Key {apiKeySet && <span className="text-green-600 font-normal">(already set)</span>}
              </label>
              <input value={form.api_key} onChange={e => setForm({ ...form, api_key: e.target.value })}
                placeholder={apiKeySet ? "Leave blank to keep existing key" : "your-zotero-api-key"}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black font-mono" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Library / Group ID</label>
              <input value={form.library_id} onChange={e => setForm({ ...form, library_id: e.target.value })}
                placeholder="e.g. group id 1234567" required
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Library Type</label>
              <select value={form.library_type} onChange={e => setForm({ ...form, library_type: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none">
                <option value="user">Personal library</option>
                <option value="group">Group library</option>
              </select>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving}
                className="flex-1 bg-black text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-black">Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

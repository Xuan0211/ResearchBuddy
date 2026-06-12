"use client"

import { useEffect, useState } from "react"
import { Bug, ChevronDown, ChevronUp, Plus, Sparkles, Trash2, X } from "lucide-react"
import { api } from "@/lib/api"
import type { RoadmapItem, RoadmapItemPriority, RoadmapItemStatus, RoadmapItemType } from "@/lib/types"

const STATUS_LABELS: Record<RoadmapItemStatus, string> = {
  "todo": "待处理",
  "in-progress": "进行中",
  "scheduled": "已排期",
  "rejected": "已拒绝",
  "long-term": "远期",
  "done": "已完成",
}

const STATUS_COLORS: Record<RoadmapItemStatus, string> = {
  "todo": "bg-gray-100 text-gray-700",
  "in-progress": "bg-blue-100 text-blue-700",
  "scheduled": "bg-purple-100 text-purple-700",
  "rejected": "bg-red-100 text-red-600",
  "long-term": "bg-yellow-100 text-yellow-700",
  "done": "bg-green-100 text-green-700",
}

const PRIORITY_COLORS: Record<RoadmapItemPriority, string> = {
  P0: "bg-red-500 text-white",
  P1: "bg-orange-400 text-white",
  P2: "bg-gray-300 text-gray-700",
}

const STATUS_ORDER: RoadmapItemStatus[] = ["in-progress", "todo", "scheduled", "long-term", "done", "rejected"]

interface FormState {
  type: RoadmapItemType
  priority: RoadmapItemPriority
  status: RoadmapItemStatus
  title: string
  description: string
}

const EMPTY_FORM: FormState = { type: "feature", priority: "P1", status: "todo", title: "", description: "" }

export default function RoadmapBoard() {
  const [items, setItems] = useState<RoadmapItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<FormState>>({})
  const [error, setError] = useState("")

  useEffect(() => {
    api.get<RoadmapItem[]>("/api/roadmap")
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function submitNew(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSubmitting(true)
    setError("")
    try {
      const created = await api.post<RoadmapItem>("/api/roadmap", form)
      setItems(prev => [...prev, created])
      setForm(EMPTY_FORM)
      setShowForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add item")
    } finally {
      setSubmitting(false)
    }
  }

  async function updateItem(id: string, patch: Partial<FormState>) {
    try {
      const updated = await api.patch<RoadmapItem>(`/api/roadmap/${id}`, patch)
      setItems(prev => prev.map(i => i.id === id ? updated : i))
    } catch {
      setError("Failed to update item")
    }
  }

  async function deleteItem(id: string) {
    try {
      await api.delete(`/api/roadmap/${id}`)
      setItems(prev => prev.filter(i => i.id !== id))
    } catch {
      setError("Failed to delete item")
    }
  }

  function saveEdit(id: string) {
    if (Object.keys(editForm).length) updateItem(id, editForm)
    setEditingId(null)
    setEditForm({})
  }

  const grouped = STATUS_ORDER.reduce<Record<string, RoadmapItem[]>>((acc, s) => {
    acc[s] = items.filter(i => i.status === s)
    return acc
  }, {} as Record<string, RoadmapItem[]>)

  const activeCount = items.filter(i => i.status === "in-progress" || i.status === "todo").length

  return (
    <div className="rounded-lg border bg-white shadow-sm">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">开发团队 Roadmap</span>
          {activeCount > 0 && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
              {activeCount} 进行中
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setShowForm(v => !v); setExpanded(true) }}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            title="Add item"
          >
            <Plus size={15} />
          </button>
          {expanded ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t px-4 pb-4">
          {/* Add form */}
          {showForm && (
            <form onSubmit={submitNew} className="mt-3 rounded-md border bg-gray-50 p-3">
              <div className="mb-2 flex flex-wrap gap-2">
                <select
                  value={form.type}
                  onChange={e => setForm({ ...form, type: e.target.value as RoadmapItemType })}
                  className="rounded border px-2 py-1 text-xs"
                >
                  <option value="feature">Feature</option>
                  <option value="bug">Bug</option>
                </select>
                <select
                  value={form.priority}
                  onChange={e => setForm({ ...form, priority: e.target.value as RoadmapItemPriority })}
                  className="rounded border px-2 py-1 text-xs"
                >
                  <option value="P0">P0</option>
                  <option value="P1">P1</option>
                  <option value="P2">P2</option>
                </select>
                <select
                  value={form.status}
                  onChange={e => setForm({ ...form, status: e.target.value as RoadmapItemStatus })}
                  className="rounded border px-2 py-1 text-xs"
                >
                  {STATUS_ORDER.map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              <input
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="标题"
                required
                className="mb-2 w-full rounded border px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-black"
              />
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="描述（可选）"
                rows={2}
                className="mb-2 w-full resize-y rounded border px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-black"
              />
              {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={submitting || !form.title.trim()}
                  className="rounded bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">
                  {submitting ? "Adding..." : "Add"}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setError("") }}
                  className="rounded border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100">
                  Cancel
                </button>
              </div>
            </form>
          )}

          {loading && <p className="mt-3 text-xs text-gray-400">Loading...</p>}

          {!loading && (
            <div className="mt-3 space-y-4">
              {STATUS_ORDER.map(status => {
                const group = grouped[status] || []
                if (group.length === 0) return null
                return (
                  <div key={status}>
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      {STATUS_LABELS[status as RoadmapItemStatus]} · {group.length}
                    </h3>
                    <div className="space-y-1.5">
                      {group.map(item => (
                        <div key={item.id}
                          className={`group relative rounded-md border p-3 text-sm ${status === "done" || status === "rejected" ? "opacity-60" : ""}`}
                        >
                          {editingId === item.id ? (
                            <div className="space-y-2">
                              <div className="flex flex-wrap gap-2">
                                <select defaultValue={item.type}
                                  onChange={e => setEditForm(f => ({ ...f, type: e.target.value as RoadmapItemType }))}
                                  className="rounded border px-1.5 py-1 text-xs">
                                  <option value="feature">Feature</option>
                                  <option value="bug">Bug</option>
                                </select>
                                <select defaultValue={item.priority}
                                  onChange={e => setEditForm(f => ({ ...f, priority: e.target.value as RoadmapItemPriority }))}
                                  className="rounded border px-1.5 py-1 text-xs">
                                  <option value="P0">P0</option>
                                  <option value="P1">P1</option>
                                  <option value="P2">P2</option>
                                </select>
                                <select defaultValue={item.status}
                                  onChange={e => setEditForm(f => ({ ...f, status: e.target.value as RoadmapItemStatus }))}
                                  className="rounded border px-1.5 py-1 text-xs">
                                  {STATUS_ORDER.map(s => (
                                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                                  ))}
                                </select>
                              </div>
                              <input defaultValue={item.title}
                                onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                                className="w-full rounded border px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-black" />
                              <textarea defaultValue={item.description} rows={2}
                                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                                className="w-full resize-y rounded border px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-black" />
                              <div className="flex gap-2">
                                <button onClick={() => saveEdit(item.id)}
                                  className="rounded bg-black px-2 py-1 text-xs text-white">Save</button>
                                <button onClick={() => { setEditingId(null); setEditForm({}) }}
                                  className="rounded border px-2 py-1 text-xs text-gray-600">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-start gap-2">
                                <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${PRIORITY_COLORS[item.priority]}`}>
                                  {item.priority}
                                </span>
                                <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs ${item.type === "bug" ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"}`}>
                                  {item.type === "bug" ? <Bug size={11} className="inline mr-0.5" /> : <Sparkles size={11} className="inline mr-0.5" />}
                                  {item.type}
                                </span>
                                <span
                                  className="flex-1 cursor-pointer font-medium leading-snug"
                                  onClick={() => { setEditingId(item.id); setEditForm({}) }}
                                >
                                  {item.title}
                                </span>
                                <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                  <button onClick={() => deleteItem(item.id)}
                                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500">
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                              {item.description && (
                                <p className="mt-1.5 pl-[4.5rem] text-xs leading-relaxed text-gray-500">
                                  {item.description}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
              {items.length === 0 && (
                <p className="text-xs text-gray-400">暂无 roadmap 条目。点击 + 添加第一个。</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

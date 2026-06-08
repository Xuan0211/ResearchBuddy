"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import dynamic from "next/dynamic"
import type { DocumentTab } from "@/lib/types"

const NotionEditor = dynamic(() => import("@/components/editor/NotionEditor"), { ssr: false })

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

type PublicDocShare = {
  project: { id: string; name: string }
  document: {
    id: string
    title: string
    tags?: string[]
    _body?: string
    tabs?: DocumentTab[]
  }
  created_at: string
}

export default function PublicDocSharePage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<PublicDocShare | null>(null)
  const [activeTabId, setActiveTabId] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    fetch(`${BASE}/api/public/docs/${token}`)
      .then(async res => {
        if (!res.ok) throw new Error(res.status === 404 ? "This share link is not available." : "Could not load shared document.")
        return res.json()
      })
      .then((next: PublicDocShare) => {
        if (cancelled) return
        setData(next)
        setActiveTabId(next.document.tabs?.[0]?.id ?? "main")
      })
      .catch(err => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [token])

  if (loading) {
    return <div className="min-h-screen bg-white p-8 text-sm text-gray-500">Loading shared document...</div>
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-gray-50 px-6 py-16">
        <div className="mx-auto max-w-lg rounded-xl border bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-gray-900">Share link unavailable</p>
          <p className="mt-2 text-sm text-gray-500">{error || "This document could not be loaded."}</p>
        </div>
      </main>
    )
  }

  const tabs = data.document.tabs?.length
    ? data.document.tabs
    : [{ id: "main", title: "Main", content: data.document._body ?? "" }]
  const activeTab = tabs.find(tab => tab.id === activeTabId) ?? tabs[0]

  return (
    <main className="min-h-screen bg-white text-gray-950">
      <header className="border-b bg-white px-6 py-4">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-medium text-gray-400">Shared with ResearchBuddy</p>
          <h1 className="mt-1 text-xl font-semibold">{data.document.title}</h1>
          <p className="mt-1 text-sm text-gray-500">{data.project.name}</p>
        </div>
      </header>

      <div className="mx-auto max-w-5xl">
        {tabs.length > 1 && (
          <div className="border-b bg-white px-6 py-2">
            <div className="flex items-center gap-1 overflow-x-auto">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTabId(tab.id)}
                  className={`rounded-md px-3 py-1.5 text-xs whitespace-nowrap ${
                    activeTab.id === tab.id ? "bg-black text-white" : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {tab.title}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="min-h-[70vh]">
          <NotionEditor
            key={activeTab.id}
            content={activeTab.content ?? ""}
            readOnly
            placeholder=""
          />
        </div>
      </div>
    </main>
  )
}

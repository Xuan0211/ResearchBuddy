"use client"
import { useParams } from "next/navigation"
import SectionResourcesPanel from "@/components/SectionResourcesPanel"

export default function PrototypePage() {
  const { id: projectId } = useParams<{ id: string }>()

  return (
    <div className="p-6 max-w-6xl space-y-4">
      <div>
        <h2 className="text-base font-semibold">Prototype</h2>
      </div>
      <SectionResourcesPanel projectId={projectId} section="prototype" title="Prototype docs & skills" />
    </div>
  )
}

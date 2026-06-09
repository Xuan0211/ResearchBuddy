"use client"
import { useParams } from "next/navigation"
import SectionResourcesPanel from "@/components/SectionResourcesPanel"
import ModuleLinksPanel from "@/components/ModuleLinksPanel"

export default function PrototypePage() {
  const { id: projectId } = useParams<{ id: string }>()

  return (
    <div className="p-6 max-w-6xl space-y-4">
      <div>
        <h2 className="text-base font-semibold">Prototype</h2>
      </div>
      <SectionResourcesPanel projectId={projectId} section="prototype" />
      <ModuleLinksPanel
        projectId={projectId}
        section="prototype"
        kind="github"
        title="GitHub links"
        labelPlaceholder="Repository or branch"
        urlPlaceholder="https://github.com/..."
      />
    </div>
  )
}

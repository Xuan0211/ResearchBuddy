"use client"
import { useParams } from "next/navigation"
import ModuleLinksPanel from "@/components/ModuleLinksPanel"
import ModuleResourcesPanel from "@/components/ModuleResourcesPanel"

export default function DesignPage() {
  const { id: projectId } = useParams<{ id: string }>()

  return (
    <div className="p-6 max-w-6xl space-y-4">
      <div>
        <h2 className="text-base font-semibold">Design</h2>
      </div>
      <ModuleResourcesPanel projectId={projectId} section="design" canEdit={true} />
      <ModuleLinksPanel
        projectId={projectId}
        section="design"
        kind="figma"
        title="Figma links"
        labelPlaceholder="Figma file or frame"
        urlPlaceholder="https://figma.com/..."
      />
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, BarChart3 } from 'lucide-react'
import AgentNav from '@/components/shared/AgentNav'
import FormAnalyticsDashboard from '@/components/analytics/FormanalyticalDashboard'
import { formAPI } from '@/lib/api'

export default function FormAnalyticsPage() {
  const { formId } = useParams() as { formId: string }
  const router = useRouter()
  const [formTitle, setFormTitle] = useState('')

  useEffect(() => {
    formAPI.get(formId).then((f) => setFormTitle(f?.form_title ?? '')).catch(() => {})
  }, [formId])

  return (
    <div className="min-h-screen bg-woven grain">
      <AgentNav />

      {/* Sub-header */}
      <div className="pt-8 sticky top-16 z-40 bg-white/90 backdrop-blur-md border-b border-teal/8">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-4">
          <button onClick={() => router.back()} className="btn-ghost btn-sm">
            <ArrowLeft size={14} /> Back
          </button>
          <div className="w-px h-5 bg-teal/12" />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <BarChart3 size={18} className="text-teal flex-shrink-0" />
            <span className="font-display text-lg text-teal truncate">
              {formTitle || 'Form'} · Detailed insights
            </span>
          </div>
          <button
            onClick={() => router.push(`/agent/form/${formId}`)}
            className="btn-ghost btn-sm flex-shrink-0"
          >
            View form summary
          </button>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-8 pb-20 pt-20">
        <FormAnalyticsDashboard formId={formId} />
      </main>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Download, Copy, Users, Clock,
  CheckCircle, Circle, RefreshCw, Link2, Eye
} from 'lucide-react'
import { formAPI, fillbackAPI, sessionAPI } from '@/lib/api'
import clsx from 'clsx'

interface SessionSummary {
  session_id: string
  created_at: string
  status: string
  progress_pct: number
  filled_fields: number
  total_fields: number
}

export default function FormDetailPage() {
  const params = useParams()
  const router = useRouter()
  const formId = params.formId as string

  const [form, setForm] = useState<any>(null)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = async () => {
    try {
      const [formData, sessionData] = await Promise.all([
        formAPI.getForm(formId),
        formAPI.getFormSessions(formId),
      ])
      setForm(formData)
      setSessions(sessionData)
    } catch {
      toast.error('Could not load form data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [formId])

  const handleDownload = async (sessionId: string) => {
    setDownloadingId(sessionId)
    try {
      const blob = await fillbackAPI.fill(sessionId)
      fillbackAPI.downloadPDF(blob, `filled_${formId}.pdf`)
      toast.success('Form downloaded!')
    } catch {
      toast.error('Download failed')
    } finally {
      setDownloadingId(null)
    }
  }

  const handleCopyLink = () => {
    const link = `${window.location.origin}/chat/${formId}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    toast.success('Link copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-paper-texture flex items-center justify-center">
        <div className="flex gap-1.5">
          <div className="typing-dot" />
          <div className="typing-dot" />
          <div className="typing-dot" />
        </div>
      </div>
    )
  }

  const completedCount = sessions.filter(s => s.status === 'completed').length
  const activeCount = sessions.filter(s => s.status === 'active').length

  return (
    <div className="min-h-screen bg-paper-texture">

      {/* Top bar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-navy/95 backdrop-blur-sm border-b border-slate/40">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="btn-ghost p-2"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="w-px h-6 bg-steel/30" />
          <div className="flex-1 min-w-0">
            <p className="font-display text-paper truncate">{form?.form_title || 'Form Detail'}</p>
            <p className="text-mist text-xs">{form?.original_filename}</p>
          </div>
          <button onClick={handleCopyLink} className="btn-primary text-sm">
            <Link2 size={14} />
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
      </nav>

      <div className="pt-16 max-w-6xl mx-auto px-6 pb-16">

        {/* Stats header */}
        <div className="py-10 border-b border-steel/15 mb-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { label: 'Fields detected', value: form?.field_count || 0, unit: '' },
              { label: 'Total sessions', value: sessions.length, unit: '' },
              { label: 'Completed', value: completedCount, unit: '', highlight: true },
              { label: 'Active now', value: activeCount, unit: '' },
            ].map(({ label, value, highlight }) => (
              <div key={label} className="card p-5">
                <p className="label-caps text-mist mb-2">{label}</p>
                <p className={clsx(
                  'font-display text-display-md',
                  highlight ? 'text-amber' : 'text-ink'
                )}>
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr,320px] gap-8">

          {/* Sessions table */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl text-ink">Sessions</h2>
              <button onClick={load} className="btn-ghost text-sm">
                <RefreshCw size={14} />
                Refresh
              </button>
            </div>

            {sessions.length === 0 ? (
              <div className="card p-12 text-center">
                <Users size={28} className="text-mist mx-auto mb-3" />
                <p className="font-display text-lg text-ink mb-1">No sessions yet</p>
                <p className="text-mist text-sm">Share the link to start collecting.</p>
              </div>
            ) : (
              <div className="card overflow-hidden">
                <div className="grid grid-cols-[auto,1fr,120px,80px,100px] gap-4 px-5 py-3 border-b border-steel/15">
                  {['Status', 'Session', 'Progress', 'Fields', 'Action'].map(h => (
                    <span key={h} className="label-caps text-mist">{h}</span>
                  ))}
                </div>

                <div className="divide-y divide-steel/8">
                  {sessions.map((session, i) => (
                    <motion.div
                      key={session.session_id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="grid grid-cols-[auto,1fr,120px,80px,100px] gap-4 px-5 py-4 items-center hover:bg-paper/40 transition-colors"
                    >
                      {/* Status */}
                      <div>
                        {session.status === 'completed'
                          ? <CheckCircle size={16} className="text-success" />
                          : <Circle size={16} className="text-mist" />
                        }
                      </div>

                      {/* Session ID + time */}
                      <div>
                        <p className="font-mono text-xs text-ink">{session.session_id.slice(0, 8)}…</p>
                        <p className="text-mist text-xs mt-0.5">
                          {new Date(session.created_at).toLocaleDateString('en-IN', {
                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                          })}
                        </p>
                      </div>

                      {/* Progress bar */}
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-xs text-mist">{session.progress_pct}%</span>
                        </div>
                        <div className="h-1.5 bg-steel/15 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber rounded-full transition-all"
                            style={{ width: `${session.progress_pct}%` }}
                          />
                        </div>
                      </div>

                      {/* Fields */}
                      <p className="font-mono text-xs text-steel">
                        {session.filled_fields}/{session.total_fields}
                      </p>

                      {/* Action */}
                      {session.status === 'completed' ? (
                        <button
                          onClick={() => handleDownload(session.session_id)}
                          disabled={downloadingId === session.session_id}
                          className="btn-primary text-xs px-3 py-2"
                        >
                          {downloadingId === session.session_id
                            ? <RefreshCw size={12} className="animate-spin" />
                            : <Download size={12} />
                          }
                          PDF
                        </button>
                      ) : (
                        <span className="badge badge-active text-xs">Active</span>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: form field list */}
          <div>
            <h2 className="font-display text-xl text-ink mb-4">Form fields</h2>
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-steel/15">
                <p className="label-caps text-mist">{form?.field_count} fields</p>
              </div>
              <div className="overflow-y-auto max-h-[500px]">
                {(form?.fields || []).map((field: any, i: number) => (
                  <div key={i} className="px-4 py-3 border-b border-steel/8 flex items-start gap-3">
                    <span className="font-mono text-[10px] w-5 h-5 rounded bg-navy/8 border border-steel/20 flex items-center justify-center text-mist flex-shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-ink text-sm truncate">{field.semantic_label}</p>
                      <p className="text-mist text-xs">{field.field_type}</p>
                    </div>
                    {field.is_required && (
                      <span className="text-amber text-xs font-mono mt-0.5">*</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

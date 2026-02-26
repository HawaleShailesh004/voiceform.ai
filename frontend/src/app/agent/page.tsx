'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { FileText, Plus, Users, CheckCircle, Clock, ChevronRight, BarChart2, Inbox } from 'lucide-react'
import AgentNav from '@/components/shared/AgentNav'
import { formAPI, type AgentForm } from '@/lib/api'
import clsx from 'clsx'

function StatCard({ label, value, sub, accent = false }: { label: string; value: number | string; sub?: string; accent?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-5"
    >
      <p className="label-xs mb-3">{label}</p>
      <p className={clsx('font-display text-3xl font-semibold leading-none', accent ? 'text-saffron' : 'text-teal')}>
        {value}
      </p>
      {sub && <p className="text-ink-faint text-xs font-body mt-1.5">{sub}</p>}
    </motion.div>
  )
}

function FormCard({ form, delay }: { form: AgentForm; delay: number }) {
  const completion = form.session_count > 0
    ? Math.round(form.completed_count / form.session_count * 100)
    : 0

  const sourceLabel: Record<string, string> = {
    acroform: 'AcroForm',
    scanned_image: 'Scanned',
    image_pdf: 'Image PDF',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring', stiffness: 260, damping: 22 }}
    >
      <Link href={`/agent/form/${form.form_id}`}>
        <div className="card p-5 hover:shadow-lift transition-all duration-200 group cursor-pointer">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-teal/8 border border-teal/12 flex items-center justify-center group-hover:bg-teal group-hover:border-teal transition-all duration-200">
                <FileText size={17} className="text-teal group-hover:text-cream transition-colors duration-200" />
              </div>
              <div>
                <h3 className="font-body font-semibold text-ink text-sm leading-tight">{form.form_title}</h3>
                <p className="text-ink-faint text-xs mt-0.5 truncate max-w-36">{form.original_filename}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="badge badge-muted">{sourceLabel[form.source_type] || form.source_type}</span>
              <ChevronRight size={14} className="text-ink-faint group-hover:text-teal group-hover:translate-x-0.5 transition-all duration-150" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center p-2.5 bg-cream rounded-md">
              <p className="font-display text-lg text-ink font-semibold">{form.field_count}</p>
              <p className="label-xs mt-0.5">Fields</p>
            </div>
            <div className="text-center p-2.5 bg-cream rounded-md">
              <p className="font-display text-lg text-ink font-semibold">{form.session_count}</p>
              <p className="label-xs mt-0.5">Users</p>
            </div>
            <div className="text-center p-2.5 bg-saffron/8 rounded-md">
              <p className="font-display text-lg text-saffron-dark font-semibold">{form.completed_count}</p>
              <p className="label-xs mt-0.5 text-saffron-dark/70">Done</p>
            </div>
          </div>

          {form.session_count > 0 ? (
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="label-xs">Completion rate</span>
                <span className="font-mono text-[11px] text-ink-muted">{completion}%</span>
              </div>
              <div className="h-1.5 bg-cream-dark rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-saffron rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${completion}%` }}
                  transition={{ delay: delay + 0.3, duration: 0.8, ease: 'easeOut' }}
                />
              </div>
            </div>
          ) : (
            <p className="text-ink-faint text-xs font-body italic">No sessions yet — share the link to start</p>
          )}
        </div>
      </Link>
    </motion.div>
  )
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="col-span-full"
    >
      <div className="card p-16 text-center max-w-lg mx-auto">
        <div className="relative w-20 h-20 mx-auto mb-6">
          <div className="absolute inset-0 bg-teal/6 rounded-2xl animate-breathe" />
          <div className="relative w-20 h-20 bg-teal/10 rounded-2xl flex items-center justify-center">
            <Inbox size={32} className="text-teal/60" />
          </div>
        </div>
        <h3 className="font-display text-2xl text-teal font-semibold mb-2">Start with your first form</h3>
        <p className="text-ink-muted font-body text-sm mb-8 leading-relaxed">
          Upload any PDF or scanned form — Vaarta detects all the fields and creates a shareable conversation link instantly.
        </p>
        <Link href="/agent/upload" className="btn-primary btn-lg mx-auto">
          <Plus size={16} />
          Upload a form
        </Link>
      </div>
    </motion.div>
  )
}

export default function AgentDashboard() {
  const [forms, setForms] = useState<AgentForm[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    formAPI.list()
      .then(setForms)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const totalSessions   = forms.reduce((a, f) => a + f.session_count, 0)
  const totalCompleted  = forms.reduce((a, f) => a + f.completed_count, 0)
  const activeNow       = forms.reduce((a, f) => a + (f.session_count - f.completed_count), 0)

  return (
    <div className="min-h-screen bg-woven grain">
      <AgentNav />
      <main className="pt-16 max-w-7xl mx-auto px-6 pb-20">

        {/* Page header */}
        <div className="py-10">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <p className="label-xs text-saffron mb-2">Agent Dashboard</p>
            <h1 className="font-display text-4xl text-teal font-semibold leading-tight">
              Your forms, <em className="text-saffron not-italic">at a glance.</em>
            </h1>
            <p className="text-ink-muted font-body mt-2">
              Every form you upload. Every conversation you've started.
            </p>
          </motion.div>
        </div>

        {/* Stats */}
        {forms.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            <StatCard label="Forms uploaded" value={forms.length} />
            <StatCard label="Total sessions" value={totalSessions} />
            <StatCard label="Active now" value={activeNow} sub="filling in progress" />
            <StatCard label="Completed" value={totalCompleted} accent sub="ready to download" />
          </div>
        )}

        {/* Header row */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-xl text-teal font-semibold">
            {loading ? 'Loading…' : `${forms.length} form${forms.length !== 1 ? 's' : ''}`}
          </h2>
          <Link href="/agent/upload" className="btn-primary">
            <Plus size={15} />
            Upload new form
          </Link>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {[1,2,3].map(i => (
              <div key={i} className="card p-5 space-y-4">
                <div className="flex gap-3">
                  <div className="w-10 h-10 skeleton rounded-md" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 skeleton rounded w-3/4" />
                    <div className="h-2.5 skeleton rounded w-1/2" />
                  </div>
                </div>
                <div className="h-2 skeleton rounded w-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {forms.length === 0
              ? <EmptyState />
              : forms.map((f, i) => <FormCard key={f.form_id} form={f} delay={i * 0.07} />)
            }
          </div>
        )}

      </main>
    </div>
  )
}

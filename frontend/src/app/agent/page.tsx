'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { FileText, Plus, ChevronRight, Inbox, TrendingUp, Users, CheckCircle, Activity } from 'lucide-react'
import AgentNav from '@/components/shared/AgentNav'
import { formAPI, type AgentForm } from '@/lib/api'
import clsx from 'clsx'

/* ── Stat card ─────────────────────────────────────── */
function StatCard({ label, value, sub, icon: Icon, accent = false, delay = 0 }: {
  label: string; value: number | string; sub?: string
  icon: any; accent?: boolean; delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring', stiffness: 260, damping: 22 }}
      className="card p-5 flex items-start gap-4"
    >
      <div className={clsx(
        'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
        accent ? 'bg-saffron/10' : 'bg-teal/8'
      )}>
        <Icon size={18} className={accent ? 'text-saffron-dark' : 'text-teal'} />
      </div>
      <div>
        <p className="label-xs mb-1">{label}</p>
        <p className={clsx('font-display text-2xl font-semibold leading-none', accent ? 'text-saffron-dark' : 'text-teal')}>
          {value}
        </p>
        {sub && <p className="text-ink-faint text-xs font-body mt-1">{sub}</p>}
      </div>
    </motion.div>
  )
}

/* ── Health grade badge ────────────────────────────── */
function GradeBadge({ grade }: { grade: string }) {
  const styles: Record<string, string> = {
    A: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    B: 'bg-teal-50 text-teal-700 border-teal-200',
    C: 'bg-amber-50 text-amber-700 border-amber-200',
    D: 'bg-orange-50 text-orange-700 border-orange-200',
    F: 'bg-red-50 text-red-700 border-red-200',
  }
  return (
    <span className={clsx(
      'inline-flex items-center justify-center w-6 h-6 rounded text-[11px] font-mono font-bold border',
      styles[grade] || styles.F
    )}>
      {grade}
    </span>
  )
}

/* ── Source pill ───────────────────────────────────── */
function SourcePill({ type }: { type: string }) {
  const map: Record<string, { label: string; color: string }> = {
    acroform:      { label: 'AcroForm', color: 'bg-teal/8 text-teal-600' },
    scanned_image: { label: 'Scanned',  color: 'bg-amber-50 text-amber-700' },
    image_pdf:     { label: 'Image PDF', color: 'bg-sand/40 text-ink-muted' },
  }
  const { label, color } = map[type] || { label: type, color: 'bg-sand/40 text-ink-muted' }
  return (
    <span className={clsx('text-[10px] font-body font-semibold px-2 py-0.5 rounded-full', color)}>
      {label}
    </span>
  )
}

/* ── Form card ─────────────────────────────────────── */
function FormCard({ form, delay }: { form: AgentForm; delay: number }) {
  const completion = form.session_count > 0
    ? Math.round((form.completed_count / form.session_count) * 100) : 0
  const hasActivity = form.session_count > 0
  const activeCount = form.session_count - form.completed_count

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring', stiffness: 260, damping: 22 }}
    >
      <Link href={`/agent/form/${form.form_id}`}>
        <div className="card p-5 hover:shadow-lift transition-all duration-200 group cursor-pointer border border-teal/8 hover:border-teal/16">
          {/* Top row */}
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-teal/7 border border-teal/10 flex items-center justify-center flex-shrink-0 group-hover:bg-teal group-hover:border-teal transition-all duration-200">
              <FileText size={16} className="text-teal group-hover:text-cream transition-colors duration-200" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-body font-semibold text-ink text-sm leading-snug line-clamp-1 group-hover:text-teal transition-colors duration-150">
                {form.form_title}
              </h3>
              <p className="text-ink-faint text-[11px] font-body mt-0.5 truncate">{form.original_filename}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {form.health_score && <GradeBadge grade={form.health_score.grade} />}
              <ChevronRight size={14} className="text-ink-faint/50 group-hover:text-teal group-hover:translate-x-0.5 transition-all duration-150" />
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="rounded-lg p-2.5 text-center" style={{ background: '#FAF6EF' }}>
              <p className="font-display text-base font-semibold text-ink">{form.field_count}</p>
              <p className="label-xs mt-0.5">Fields</p>
            </div>
            <div className="rounded-lg p-2.5 text-center" style={{ background: '#FAF6EF' }}>
              <p className="font-display text-base font-semibold text-ink">{form.session_count}</p>
              <p className="label-xs mt-0.5">Users</p>
            </div>
            <div className="rounded-lg p-2.5 text-center" style={{ background: 'rgba(232,135,58,0.07)' }}>
              <p className="font-display text-base font-semibold" style={{ color: '#C06A22' }}>{form.completed_count}</p>
              <p className="label-xs mt-0.5" style={{ color: 'rgba(192,106,34,0.7)' }}>Done</p>
            </div>
          </div>

          {/* Progress / status */}
          {hasActivity ? (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="label-xs">Completion</span>
                  {activeCount > 0 && (
                    <span className="flex items-center gap-1 text-[9px] font-body font-semibold px-1.5 py-0.5 rounded-full bg-teal/8 text-teal">
                      <span className="w-1 h-1 rounded-full bg-teal inline-block animate-pulse" />
                      {activeCount} active
                    </span>
                  )}
                </div>
                <span className="font-mono text-[11px] text-ink-muted">{completion}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#EDE8E0' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: completion >= 80 ? '#2D7A4F' : '#E8873A' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${completion}%` }}
                  transition={{ delay: delay + 0.25, duration: 0.8, ease: 'easeOut' }}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <SourcePill type={form.source_type} />
              <p className="text-ink-faint text-[11px] font-body italic">Share the link to get started</p>
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  )
}

/* ── Empty state ───────────────────────────────────── */
function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.1 }}
      className="col-span-full flex items-center justify-center py-10"
    >
      <div className="card p-14 text-center max-w-md w-full">
        <div className="relative w-20 h-20 mx-auto mb-7">
          <div className="absolute inset-0 rounded-2xl animate-breathe" style={{ background: 'rgba(13,61,58,0.05)' }} />
          <div className="relative w-20 h-20 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(13,61,58,0.08)' }}>
            <Inbox size={30} className="text-teal/50" />
          </div>
        </div>
        <h3 className="font-display text-2xl text-teal font-semibold mb-2">Upload your first form</h3>
        <p className="text-ink-muted font-body text-sm leading-relaxed mb-8">
          Upload any PDF or scanned form — Vaarta extracts every field and creates a shareable chat link in seconds.
        </p>
        <Link href="/agent/upload" className="btn-primary btn-lg inline-flex mx-auto">
          <Plus size={16} />
          Upload a form
        </Link>
      </div>
    </motion.div>
  )
}

/* ── Loading skeleton ──────────────────────────────── */
function SkeletonCard() {
  return (
    <div className="card p-5 space-y-4">
      <div className="flex gap-3">
        <div className="w-10 h-10 skeleton rounded-lg flex-shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-3 skeleton rounded w-3/4" />
          <div className="h-2.5 skeleton rounded w-1/2" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[1,2,3].map(i => <div key={i} className="h-14 skeleton rounded-lg" />)}
      </div>
      <div className="h-1.5 skeleton rounded-full" />
    </div>
  )
}

/* ══════════════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════════════ */
export default function AgentDashboard() {
  const [forms, setForms] = useState<AgentForm[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    formAPI.list().then(setForms).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const totalSessions  = forms.reduce((a, f) => a + f.session_count, 0)
  const totalCompleted = forms.reduce((a, f) => a + f.completed_count, 0)
  const activeNow      = forms.reduce((a, f) => a + Math.max(0, f.session_count - f.completed_count), 0)
  const completionRate = totalSessions > 0 ? Math.round((totalCompleted / totalSessions) * 100) : 0

  return (
    <div className="min-h-screen bg-woven grain">
      <AgentNav />

      <main className="pt-16 max-w-7xl mx-auto px-4 sm:px-6 pb-24">

        {/* ── Page header ── */}
        <div className="py-10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <p className="label-xs text-saffron mb-2">Agent Dashboard</p>
            <h1 className="font-display text-3xl sm:text-4xl text-teal font-semibold leading-tight">
              Your forms,{' '}
              <em className="text-saffron not-italic">at a glance.</em>
            </h1>
            <p className="text-ink-muted font-body text-sm mt-2">
              Every form you upload. Every conversation you've started.
            </p>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
            <Link href="/agent/upload" className="btn-primary btn-lg">
              <Plus size={16} />
              Upload new form
            </Link>
          </motion.div>
        </div>

        {/* ── Stats ── */}
        {!loading && forms.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
            <StatCard label="Forms" value={forms.length} icon={FileText} delay={0} />
            <StatCard label="Total sessions" value={totalSessions} icon={Users} delay={0.05} />
            <StatCard label="Active now" value={activeNow} sub="in progress" icon={Activity} delay={0.1} />
            <StatCard label="Completed" value={totalCompleted} sub={`${completionRate}% rate`} icon={CheckCircle} accent delay={0.15} />
          </div>
        )}

        {/* ── Section header ── */}
        {!loading && (
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-display text-lg text-teal font-semibold">
              {forms.length === 0 ? 'No forms yet' : `${forms.length} form${forms.length !== 1 ? 's' : ''}`}
            </h2>
            {forms.length > 0 && (
              <Link href="/agent/upload" className="btn-ghost text-sm">
                <Plus size={14} />
                Add form
              </Link>
            )}
          </div>
        )}

        {/* ── Grid ── */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {forms.length === 0
              ? <EmptyState />
              : forms.map((f, i) => <FormCard key={f.form_id} form={f} delay={i * 0.06} />)
            }
          </div>
        )}

      </main>
    </div>
  )
}
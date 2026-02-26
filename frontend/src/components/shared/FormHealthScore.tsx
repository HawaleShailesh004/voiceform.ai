'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Clock, Lightbulb, Zap } from 'lucide-react'
import clsx from 'clsx'

// ── Types ──────────────────────────────────────────────────────────────────

export interface HealthScore {
  overall_score: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  grade_label: string
  estimated_minutes: number
  total_fields: number
  required_fields: number
  score_breakdown: {
    field_clarity: number
    required_ratio: number
    field_type_variety: number
    confusion_risk: number
    completion_time: number
  }
  issues: string[]
  suggestions: string[]
  positives: string[]
}

// ── Grade colours ──────────────────────────────────────────────────────────

const GRADE_CONFIG = {
  A: { ring: 'ring-emerald-400',  bg: 'bg-emerald-50',  text: 'text-emerald-700',  bar: 'bg-emerald-400',  badge: 'bg-emerald-100 text-emerald-700' },
  B: { ring: 'ring-teal-400',     bg: 'bg-teal-50',     text: 'text-teal-700',     bar: 'bg-teal-400',     badge: 'bg-teal-100 text-teal-700' },
  C: { ring: 'ring-amber-400',    bg: 'bg-amber-50',    text: 'text-amber-700',    bar: 'bg-amber-400',    badge: 'bg-amber-100 text-amber-700' },
  D: { ring: 'ring-orange-400',   bg: 'bg-orange-50',   text: 'text-orange-700',   bar: 'bg-orange-400',   badge: 'bg-orange-100 text-orange-700' },
  F: { ring: 'ring-red-400',      bg: 'bg-red-50',      text: 'text-red-700',      bar: 'bg-red-400',      badge: 'bg-red-100 text-red-700' },
}

// ── Sub-score row ──────────────────────────────────────────────────────────

function ScoreRow({ label, pts, max }: { label: string; pts: number; max: number }) {
  const pct = Math.round(pts / max * 100)
  const color = pct >= 80 ? 'bg-emerald-400' : pct >= 55 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-ink-muted font-body w-36 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-cream-dark rounded-full overflow-hidden">
        <motion.div
          className={clsx('h-full rounded-full', color)}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
        />
      </div>
      <span className="text-xs font-mono text-ink-faint w-10 text-right">{pts}/{max}</span>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

interface Props {
  health: HealthScore
  /** Compact mode: used in upload success banner */
  compact?: boolean
  /** Show "View full report" toggle in compact mode */
  expandable?: boolean
  className?: string
}

export default function FormHealthScore({ health, compact = false, expandable = true, className }: Props) {
  const [expanded, setExpanded] = useState(!compact)
  const g = GRADE_CONFIG[health.grade]

  if (compact && !expanded) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className={clsx('flex items-center gap-3 p-3 rounded-lg border', g.bg, 'border-current/10', className)}
      >
        {/* Mini grade circle */}
        <div className={clsx('w-10 h-10 rounded-full ring-2 flex items-center justify-center flex-shrink-0', g.ring, g.bg)}>
          <span className={clsx('font-display text-lg font-bold', g.text)}>{health.grade}</span>
        </div>

        <div className="flex-1 min-w-0">
          <p className={clsx('text-sm font-semibold font-body', g.text)}>{health.grade_label}</p>
          <p className="text-xs text-ink-faint font-body mt-0.5">
            {health.total_fields} fields · {health.estimated_minutes} min est. · {health.overall_score}/100
          </p>
        </div>

        {expandable && (
          <button
            onClick={() => setExpanded(true)}
            className="btn-ghost btn-sm flex-shrink-0 text-xs"
          >
            Full report
            <ChevronRight size={12} />
          </button>
        )}
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx('card overflow-hidden', className)}
    >
      {/* Header */}
      <div className={clsx('p-5 flex items-center gap-4', g.bg, 'border-b border-current/8')}>
        {/* Grade circle */}
        <div className={clsx('w-16 h-16 rounded-full ring-4 flex flex-col items-center justify-center flex-shrink-0', g.ring, 'bg-white')}>
          <span className={clsx('font-display text-2xl font-bold leading-none', g.text)}>{health.grade}</span>
          <span className="text-[10px] font-mono text-ink-faint leading-none mt-0.5">{health.overall_score}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className={clsx('font-body font-semibold text-base', g.text)}>Form Health Score</h3>
            <span className={clsx('text-[11px] font-mono px-1.5 py-0.5 rounded', g.badge)}>
              {health.overall_score}/100
            </span>
          </div>
          <p className={clsx('text-sm font-body', g.text, 'opacity-80')}>{health.grade_label}</p>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-ink-faint font-body">
              <Clock size={11} />
              ~{health.estimated_minutes} min to complete
            </span>
            <span className="text-xs text-ink-faint font-body">
              {health.required_fields} required / {health.total_fields} total fields
            </span>
          </div>
        </div>

        {compact && expandable && (
          <button
            onClick={() => setExpanded(false)}
            className="btn-ghost btn-sm flex-shrink-0"
            title="Collapse"
          >
            <ChevronDown size={14} />
          </button>
        )}
      </div>

      {/* Score breakdown */}
      <div className="p-5 border-b border-teal/6 space-y-3">
        <p className="label-xs mb-3">Score breakdown</p>
        <ScoreRow label="Field clarity"      pts={health.score_breakdown.field_clarity}      max={30} />
        <ScoreRow label="Required ratio"     pts={health.score_breakdown.required_ratio}     max={20} />
        <ScoreRow label="Field type variety" pts={health.score_breakdown.field_type_variety} max={15} />
        <ScoreRow label="Confusion risk"     pts={health.score_breakdown.confusion_risk}     max={20} />
        <ScoreRow label="Completion time"    pts={health.score_breakdown.completion_time}    max={15} />
      </div>

      {/* Positives */}
      {health.positives.length > 0 && (
        <div className="px-5 py-4 border-b border-teal/6">
          <p className="label-xs mb-2.5">What's working</p>
          <div className="space-y-1.5">
            {health.positives.map((p, i) => (
              <div key={i} className="flex items-start gap-2">
                <CheckCircle2 size={13} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                <span className="text-xs text-ink-muted font-body">{p}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Issues */}
      {health.issues.length > 0 && (
        <div className="px-5 py-4 border-b border-teal/6">
          <p className="label-xs mb-2.5">Issues found</p>
          <div className="space-y-1.5">
            {health.issues.map((issue, i) => (
              <div key={i} className="flex items-start gap-2">
                <AlertTriangle size={13} className="text-amber-500 mt-0.5 flex-shrink-0" />
                <span className="text-xs text-ink-muted font-body">{issue}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggestions */}
      {health.suggestions.length > 0 && (
        <div className="px-5 py-4">
          <p className="label-xs mb-2.5">Suggestions</p>
          <div className="space-y-2">
            {health.suggestions.map((s, i) => (
              <div key={i} className="flex items-start gap-2 p-2.5 bg-saffron/5 border border-saffron/12 rounded-lg">
                <Lightbulb size={13} className="text-saffron mt-0.5 flex-shrink-0" />
                <span className="text-xs text-ink font-body leading-relaxed">{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {health.issues.length === 0 && health.grade === 'A' && (
        <div className="px-5 py-4 flex items-center gap-2">
          <Zap size={14} className="text-emerald-500" />
          <span className="text-sm text-emerald-600 font-body font-medium">
            This form is optimised for high completion rates!
          </span>
        </div>
      )}
    </motion.div>
  )
}
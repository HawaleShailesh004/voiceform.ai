'use client'

/**
 * FormAnalyticsDashboard
 * Used on /agent/form/[formId]/analytics page.
 * Shows: completion funnel, field-level drop-off, language split, avg time.
 */

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { formAPI, type FormAnalytics, type FieldAnalytic } from '@/lib/api'

function avg(n: number | null): string {
  if (n === null) return '—'
  if (n < 60) return `${n}s`
  const m = Math.floor(n / 60), s = n % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

const LANG_LABELS: Record<string, string> = {
  en: '🇬🇧 English',
  hi: '🇮🇳 Hindi',
  ta: '🌟 Tamil',
  te: '🌟 Telugu',
  bn: '🌟 Bengali',
  gu: '🌟 Gujarati',
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white border border-sand rounded-xl p-4 flex flex-col gap-1">
      <span className="text-xs text-ink/50 uppercase tracking-wide font-medium">{label}</span>
      <span className="text-2xl font-bold text-ink font-display">{value}</span>
      {sub && <span className="text-xs text-ink/40">{sub}</span>}
    </div>
  )
}

function FunnelBar({ label, pct, count, total }: { label: string; pct: number; count: number; total: number }) {
  const color = pct >= 70 ? '#16a34a' : pct >= 40 ? '#d97706' : '#dc2626'
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="text-xs text-ink/60 w-36 truncate shrink-0" title={label}>{label}</span>
      <div className="flex-1 bg-sand/40 rounded-full h-2.5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-medium text-ink/70 w-16 text-right shrink-0">
        {count}/{total} ({pct}%)
      </span>
    </div>
  )
}

function DropOffTable({ fields }: { fields: FieldAnalytic[] }) {
  const sorted = [...fields].sort((a, b) => b.drop_off_pct - a.drop_off_pct)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-sand text-left">
            <th className="pb-2 text-xs uppercase tracking-wide text-ink/40 font-medium pr-4">Field</th>
            <th className="pb-2 text-xs uppercase tracking-wide text-ink/40 font-medium text-center">Reached</th>
            <th className="pb-2 text-xs uppercase tracking-wide text-ink/40 font-medium text-center">Filled</th>
            <th className="pb-2 text-xs uppercase tracking-wide text-ink/40 font-medium text-center">Skipped</th>
            <th className="pb-2 text-xs uppercase tracking-wide text-ink/40 font-medium text-center">Abandoned</th>
            <th className="pb-2 text-xs uppercase tracking-wide text-ink/40 font-medium text-right">Fill Rate</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((f) => {
            const rateColor =
              f.fill_rate_pct >= 70 ? 'text-green-600' :
              f.fill_rate_pct >= 40 ? 'text-amber-600' : 'text-red-500'
            return (
              <tr key={f.field_name} className="border-b border-sand/50 hover:bg-cream/40 transition-colors">
                <td className="py-2.5 pr-4">
                  <div className="font-medium text-ink">{f.semantic_label}</div>
                  <div className="text-xs text-ink/40 font-mono">{f.field_name}</div>
                </td>
                <td className="py-2.5 text-center text-ink/70">{f.reached}</td>
                <td className="py-2.5 text-center text-ink/70">{f.filled}</td>
                <td className="py-2.5 text-center text-ink/40">{f.skipped}</td>
                <td className="py-2.5 text-center">
                  {f.abandoned_here > 0 ? (
                    <span className="text-red-500 font-medium">{f.abandoned_here}</span>
                  ) : (
                    <span className="text-ink/30">0</span>
                  )}
                </td>
                <td className={`py-2.5 text-right font-semibold ${rateColor}`}>
                  {f.reached > 0 ? `${f.fill_rate_pct}%` : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CollapsibleSection({
  title,
  subtitle,
  count,
  expanded,
  onToggle,
  children,
}: {
  title: string
  subtitle?: string
  count: number
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-sand rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-cream/40 transition-colors border-b border-sand/50"
      >
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {subtitle && <span className="text-xs text-ink/40 hidden sm:inline">{subtitle}</span>}
          <span className="text-xs text-ink/50">({count})</span>
        </div>
        <span className="flex items-center gap-1.5 text-xs font-medium text-teal flex-shrink-0">
          {expanded ? 'Collapse' : 'Expand to view all'}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>
      {expanded && <div className="p-4">{children}</div>}
    </div>
  )
}

function FormAnalyticsDashboard({ formId }: { formId: string }) {
  const [data, setData]       = useState<FormAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [funnelOpen, setFunnelOpen]   = useState(false)
  const [dropOffOpen, setDropOffOpen] = useState(false)

  useEffect(() => {
    formAPI.analytics(formId)
      .then(setData)
      .catch(e => setError(e?.response?.data?.detail || 'Could not load analytics'))
      .finally(() => setLoading(false))
  }, [formId])

  if (loading) {
    return (
      <div className="py-12 flex items-center justify-center gap-2 text-ink/40">
        <div className="w-4 h-4 rounded-full border-2 border-teal border-t-transparent animate-spin" />
        <span className="text-sm">Loading analytics…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-8 text-center text-sm text-red-500">{error}</div>
    )
  }

  if (!data || data.total_sessions === 0) {
    return (
      <div className="py-12 text-center">
        <div className="text-3xl mb-2">📊</div>
        <p className="text-ink/50 text-sm">No sessions yet. Share the form link to start collecting responses.</p>
      </div>
    )
  }

  const langEntries = Object.entries(data.language_distribution).sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Sessions" value={data.total_sessions} />
        <StatCard
          label="Completed"
          value={data.completed_sessions}
          sub={`${data.completion_rate}% completion rate`}
        />
        <StatCard
          label="Avg Time"
          value={avg(data.avg_completion_time_seconds)}
          sub="to complete"
        />
        <StatCard
          label="Drop-off Rate"
          value={`${100 - data.completion_rate}%`}
          sub={`${data.total_sessions - data.completed_sessions} incomplete`}
        />
      </div>

      {langEntries.length > 1 && (
        <div className="bg-white border border-sand rounded-xl p-4">
          <h3 className="text-sm font-semibold text-ink mb-3">Language Distribution</h3>
          <div className="flex flex-wrap gap-2">
            {langEntries.map(([lang, count]) => (
              <div key={lang} className="flex items-center gap-1.5 bg-cream px-3 py-1.5 rounded-full text-sm">
                <span>{LANG_LABELS[lang] || lang.toUpperCase()}</span>
                <span className="font-semibold text-teal">{count}</span>
                <span className="text-ink/40">({Math.round(count / data.total_sessions * 100)}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <CollapsibleSection
        title="Completion Funnel"
        subtitle="% of sessions that filled each field"
        count={data.funnel.length}
        expanded={funnelOpen}
        onToggle={() => setFunnelOpen((o) => !o)}
      >
        <div className="space-y-1.5">
          {data.funnel.map((step) => (
            <FunnelBar
              key={step.field}
              label={step.field}
              pct={step.pct}
              count={step.count}
              total={data.total_sessions}
            />
          ))}
        </div>
        <p className="text-xs text-ink/40 mt-3">
          Percentage of all sessions that filled each field.
        </p>
      </CollapsibleSection>

      <CollapsibleSection
        title="Field Drop-off Analysis"
        subtitle="Sorted by worst drop-off"
        count={data.field_analytics.length}
        expanded={dropOffOpen}
        onToggle={() => setDropOffOpen((o) => !o)}
      >
        <DropOffTable fields={data.field_analytics} />
      </CollapsibleSection>
    </div>
  )
}

export default FormAnalyticsDashboard

'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  Upload, FileText, Image, Layers, ArrowLeft,
  Sparkles, CheckCircle, ArrowRight, RefreshCw, AlertCircle
} from 'lucide-react'
import AgentNav from '@/components/shared/AgentNav'
import FormHealthScore, { type HealthScore } from '@/components/shared/FormHealthScore'
import { formAPI } from '@/lib/api'
import clsx from 'clsx'

type Stage = 'idle' | 'uploading' | 'extracting' | 'done' | 'error'

/* ── Stage progress ────────────────────────────────── */
function StageProgress({ stage, pct }: { stage: Stage; pct: number }) {
  const steps = [
    { id: 'uploading',  label: 'Uploading' },
    { id: 'extracting', label: 'Reading fields' },
    { id: 'done',       label: 'Done!' },
  ]
  const currentIdx = steps.findIndex(s => s.id === stage)

  return (
    <div className="w-full max-w-sm mx-auto space-y-8">
      {/* Step indicators */}
      <div className="flex items-center">
        {steps.map((s, i) => {
          const isDone   = currentIdx > i
          const isActive = currentIdx === i
          return (
            <div key={s.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1.5">
                <div className={clsx(
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-body font-bold transition-all duration-300 flex-shrink-0',
                  isDone   ? 'bg-success text-white shadow-[0_0_0_3px_rgba(45,122,79,0.15)]' :
                  isActive ? 'bg-teal text-cream ring-4 ring-teal/15' :
                             'bg-cream-dark text-ink-faint'
                )}>
                  {isDone ? <CheckCircle size={15} /> : i + 1}
                </div>
                <p className={clsx('text-[10px] font-body font-medium text-center leading-none',
                  isActive ? 'text-teal' : isDone ? 'text-success' : 'text-ink-faint')}>
                  {s.label}
                </p>
              </div>
              {i < steps.length - 1 && (
                <div className={clsx('flex-1 h-px mx-3 mb-4 transition-all duration-500',
                  isDone ? 'bg-success' : 'bg-cream-dark'
                )} />
              )}
            </div>
          )
        })}
      </div>

      {/* Upload progress bar */}
      {stage === 'uploading' && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
          <div className="h-2 bg-cream-dark rounded-full overflow-hidden">
            <motion.div className="h-full bg-teal rounded-full"
              initial={{ width: 0 }} animate={{ width: `${pct}%` }}
              transition={{ duration: 0.3 }} />
          </div>
          <div className="flex justify-between items-center">
            <p className="text-ink-faint text-xs font-body">Uploading securely…</p>
            <p className="font-mono text-xs text-ink-muted">{pct}%</p>
          </div>
        </motion.div>
      )}

      {/* Extracting indicator */}
      {stage === 'extracting' && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-xl p-4 flex items-center gap-4"
          style={{ background: 'rgba(13,61,58,0.04)', border: '1px solid rgba(13,61,58,0.1)' }}>
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-teal/8 flex items-center justify-center">
              <Sparkles size={16} className="text-teal animate-pulse" />
            </div>
            <div className="absolute inset-0 rounded-full bg-teal/10 animate-ping" />
          </div>
          <div className="flex-1">
            <p className="text-teal text-sm font-body font-semibold">Claude is reading your form</p>
            <p className="text-ink-faint text-xs mt-0.5">Detecting fields, labels, bounding boxes…</p>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            {[0,1,2].map(i => (
              <div key={i} className={`w-1.5 h-1.5 rounded-full bg-teal animate-dot${i+1}`} />
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}

/* ── Result card ───────────────────────────────────── */
function ResultCard({ file, fieldCount, formTitle, formId, health, onProceed }: {
  file: File; fieldCount: number; formTitle: string
  formId: string; health: HealthScore | null; onProceed: () => void
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="card p-6">
        {/* Success header */}
        <div className="flex items-start gap-4 mb-5">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(45,122,79,0.1)', border: '1px solid rgba(45,122,79,0.2)' }}>
            <CheckCircle size={20} className="text-success" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-body font-semibold text-ink text-base leading-snug">{formTitle}</h3>
            <p className="text-ink-faint text-xs font-body mt-0.5 truncate">{file.name}</p>
          </div>
          <span className="badge badge-teal flex-shrink-0">{fieldCount} fields</span>
        </div>

        {/* Accuracy note */}
        <div className="rounded-lg p-3 mb-5 flex items-start gap-2.5"
          style={{ background: 'rgba(232,135,58,0.06)', border: '1px solid rgba(232,135,58,0.15)' }}>
          <Sparkles size={13} className="text-saffron-dark flex-shrink-0 mt-0.5" />
          <p className="text-xs font-body leading-relaxed" style={{ color: '#6B5E4E' }}>
            AI extracted <strong>{fieldCount} fields</strong>. Review the editor to verify bounding box positions — you can drag to reposition any field.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button onClick={onProceed} className="btn-primary flex-1 justify-center">
            Review & edit fields
            <ArrowRight size={15} />
          </button>
          <button
            onClick={() => window.location.href = `/agent/form/${formId}`}
            className="btn-secondary"
          >
            Skip to sessions
          </button>
        </div>
      </div>

      {health && <FormHealthScore health={health} compact={false} />}
    </motion.div>
  )
}

/* ══════════════════════════════════════════════════════
   UPLOAD PAGE
══════════════════════════════════════════════════════ */
export default function UploadPage() {
  const router = useRouter()
  const [stage, setStage]   = useState<Stage>('idle')
  const [pct, setPct]       = useState(0)
  const [file, setFile]     = useState<File | null>(null)
  const [error, setError]   = useState<string | null>(null)
  const [result, setResult] = useState<{
    formId: string; fieldCount: number; formTitle: string; health: HealthScore | null
  } | null>(null)

  const runUpload = useCallback(async (f: File) => {
    setFile(f); setStage('uploading'); setResult(null); setError(null); setPct(0)
    try {
      const res = await formAPI.upload(f, p => {
        setPct(p)
        if (p >= 100) setStage('extracting')
      })
      setResult({ formId: res.form_id, fieldCount: res.field_count, formTitle: res.form_title, health: res.health_score ?? null })
      setStage('done')
      toast.success(`${res.field_count} fields found!`)
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Extraction failed. Please try again.'
      setError(msg); setStage('error'); toast.error(msg)
    }
  }, [])

  const onDrop = useCallback((files: File[]) => { if (files[0]) runUpload(files[0]) }, [runUpload])

  const handleRetry = useCallback(() => {
    if (file) runUpload(file)
    else { setError(null); setStage('idle') }
  }, [file, runUpload])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'] },
    maxFiles: 1,
    disabled: stage !== 'idle' && stage !== 'error',
  })

  return (
    <div className="min-h-screen bg-woven grain">
      <AgentNav />

      <main className="pt-16 min-h-screen flex flex-col">
        {/* Back button */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 w-full">
          <button onClick={() => router.back()} className="btn-ghost">
            <ArrowLeft size={14} />
            Back to dashboard
          </button>
        </div>

        <div className="flex-1 flex items-start justify-center px-4 sm:px-6 pb-20 pt-2">
          <div className="w-full max-w-2xl">

            {/* Page header */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              className="text-center mb-10">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-body font-semibold bg-saffron/10 text-saffron-dark mb-4">
                Step 1 of 2
              </span>
              <h1 className="font-display text-3xl sm:text-4xl text-teal font-semibold mb-3">
                Upload your form
              </h1>
              <p className="text-ink-muted font-body text-sm leading-relaxed">
                Vaarta reads any form — digital PDF, scanned paper, or photo.<br />
                AI detects every field automatically.
              </p>
            </motion.div>

            <AnimatePresence mode="wait">

              {/* ── Dropzone ── */}
              {stage === 'idle' && (
                <motion.div key="dropzone" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}>
                  <div
                    {...getRootProps()}
                    className={clsx(
                      'relative rounded-xl border-2 border-dashed p-12 sm:p-16 text-center cursor-pointer transition-all duration-300',
                      isDragActive
                        ? 'border-saffron scale-[1.01]'
                        : 'border-teal/20 bg-white hover:border-teal/40'
                    )}
                    style={isDragActive ? { background: 'rgba(232,135,58,0.04)' } : {}}
                  >
                    <input {...getInputProps()} />

                    {/* Icon */}
                    <div className="relative w-20 h-20 mx-auto mb-6">
                      <div className={clsx('absolute inset-0 rounded-2xl transition-all duration-300',
                        isDragActive ? 'scale-110' : 'animate-breathe'
                      )}
                        style={{ background: isDragActive ? 'rgba(232,135,58,0.14)' : 'rgba(13,61,58,0.07)' }} />
                      <div className="relative w-20 h-20 flex items-center justify-center">
                        <Upload size={26} className={isDragActive ? 'text-saffron' : 'text-teal'} />
                      </div>
                    </div>

                    <h3 className="font-display text-xl text-teal font-semibold mb-2">
                      {isDragActive ? 'Drop it here!' : 'Drop your form here'}
                    </h3>
                    <p className="text-ink-muted text-sm font-body mb-8">
                      or{' '}
                      <span className="text-teal font-medium underline underline-offset-2 cursor-pointer">
                        browse files
                      </span>
                    </p>

                    {/* Format chips */}
                    <div className="flex items-center justify-center gap-4 flex-wrap">
                      {[
                        { icon: FileText, label: 'Digital PDF',   sub: 'AcroForm · ~100% accuracy' },
                        { icon: Image,    label: 'Scanned image', sub: 'PNG, JPG · 50–70% accuracy' },
                        { icon: Layers,   label: 'Image PDF',     sub: 'No fillable fields' },
                      ].map(({ icon: Icon, label, sub }) => (
                        <div key={label} className="flex items-center gap-2.5 text-left">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: 'rgba(13,61,58,0.06)' }}>
                            <Icon size={14} className="text-teal" />
                          </div>
                          <div>
                            <p className="text-ink text-xs font-body font-semibold leading-tight">{label}</p>
                            <p className="text-ink-faint text-[10px] leading-tight">{sub}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <p className="text-ink-faint text-xs mt-8 font-body">Max 16 MB · Processed securely · Not stored longer than needed</p>
                  </div>
                </motion.div>
              )}

              {/* ── Progress ── */}
              {(stage === 'uploading' || stage === 'extracting') && (
                <motion.div key="progress" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className="card p-10 space-y-8">
                  {/* File chip */}
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl mx-auto max-w-xs"
                    style={{ background: '#FAF6EF', border: '1px solid rgba(13,61,58,0.08)' }}>
                    <div className="w-8 h-8 rounded-lg bg-teal/8 flex items-center justify-center flex-shrink-0">
                      <FileText size={15} className="text-teal" />
                    </div>
                    <p className="text-ink text-sm font-body truncate">{file?.name}</p>
                  </div>
                  <StageProgress stage={stage} pct={pct} />
                </motion.div>
              )}

              {/* ── Error ── */}
              {stage === 'error' && (
                <motion.div key="error" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className="card p-10 text-center space-y-5">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
                    style={{ background: 'rgba(176,58,46,0.08)', border: '1px solid rgba(176,58,46,0.2)' }}>
                    <AlertCircle size={22} className="text-error" />
                  </div>
                  <div>
                    <h3 className="font-body font-semibold text-ink mb-1.5">Extraction failed</h3>
                    <p className="text-ink-muted text-sm font-body leading-relaxed max-w-sm mx-auto">{error}</p>
                  </div>
                  <div className="flex flex-wrap gap-3 justify-center">
                    <button onClick={handleRetry} className="btn-primary">
                      <RefreshCw size={15} />
                      Try again
                    </button>
                    <button onClick={() => { setError(null); setStage('idle'); setFile(null) }} className="btn-secondary">
                      Choose another file
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ── Done ── */}
              {stage === 'done' && result && (
                <motion.div key="result" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <ResultCard
                    file={file!}
                    fieldCount={result.fieldCount}
                    formTitle={result.formTitle}
                    formId={result.formId}
                    health={result.health}
                    onProceed={() => router.push(`/agent/form/${result.formId}/edit`)}
                  />
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  )
}
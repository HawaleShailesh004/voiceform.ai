'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { Upload, FileText, Image, Layers, ArrowLeft, Sparkles, CheckCircle, ArrowRight } from 'lucide-react'
import AgentNav from '@/components/shared/AgentNav'
import FormHealthScore, { type HealthScore } from '@/components/shared/FormHealthScore'
import { formAPI } from '@/lib/api'
import clsx from 'clsx'

type Stage = 'idle' | 'uploading' | 'extracting' | 'done'

const STAGES = [
  { id: 'uploading',  label: 'Uploading your form',     sub: 'Sending securely to Vaarta…' },
  { id: 'extracting', label: 'AI is reading your form', sub: 'Detecting fields, labels, and structure…' },
  { id: 'done',       label: 'Fields detected!',        sub: 'Ready to review…' },
]

function StageProgress({ stage, pct }: { stage: Stage; pct: number }) {
  const current = STAGES.findIndex(s => s.id === stage)
  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      <div className="flex items-center gap-2">
        {STAGES.map((s, i) => {
          const done   = current > i
          const active = current === i
          return (
            <div key={s.id} className="flex items-center gap-2 flex-1">
              <div className={clsx(
                'w-6 h-6 rounded-full flex items-center justify-center text-xs font-body font-bold transition-all duration-300 flex-shrink-0',
                done   ? 'bg-success text-white' :
                active ? 'bg-teal text-cream ring-4 ring-teal/20' :
                         'bg-cream-dark text-ink-faint'
              )}>
                {done ? <CheckCircle size={14} /> : i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className={clsx('text-xs font-body font-medium truncate',
                  active ? 'text-teal' : done ? 'text-success' : 'text-ink-faint')}>
                  {s.label}
                </p>
              </div>
              {i < STAGES.length - 1 && (
                <div className={clsx('h-px flex-shrink-0 w-6 transition-all duration-500', done ? 'bg-success' : 'bg-cream-dark')} />
              )}
            </div>
          )
        })}
      </div>
      {stage === 'uploading' && (
        <div className="space-y-2">
          <div className="h-2 bg-cream-dark rounded-full overflow-hidden">
            <motion.div className="h-full bg-teal rounded-full" initial={{ width: 0 }}
              animate={{ width: `${pct}%` }} transition={{ duration: 0.3 }} />
          </div>
          <p className="text-ink-faint text-xs text-right font-mono">{pct}%</p>
        </div>
      )}
      {stage === 'extracting' && (
        <div className="flex items-center gap-3 p-4 bg-teal/5 border border-teal/12 rounded-lg">
          <div className="relative flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-teal/10 flex items-center justify-center">
              <Sparkles size={14} className="text-teal animate-pulse" />
            </div>
            <div className="absolute inset-0 rounded-full bg-teal/15 animate-ping" />
          </div>
          <div>
            <p className="text-teal text-sm font-body font-medium">Claude is analysing your form</p>
            <p className="text-ink-faint text-xs mt-0.5">This usually takes 10–30 seconds…</p>
          </div>
          <div className="ml-auto flex gap-1">
            {[0,1,2].map(i => (
              <div key={i} className={clsx('w-1.5 h-1.5 rounded-full bg-teal', `animate-dot${i+1}`)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Result card shown after extraction ────────────────────────────────────

function ResultCard({
  file, fieldCount, formTitle, formId, health, onProceed,
}: {
  file: File
  fieldCount: number
  formTitle: string
  formId: string
  health: HealthScore | null
  onProceed: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Success banner */}
      <div className="card p-5">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-10 h-10 bg-success/10 rounded-lg flex items-center justify-center flex-shrink-0">
            <CheckCircle size={20} className="text-success" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-body font-semibold text-ink text-base">{formTitle}</h3>
            <p className="text-ink-faint text-xs font-body mt-0.5">{file.name}</p>
          </div>
          <span className="badge badge-muted">{fieldCount} fields</span>
        </div>

        <div className="flex gap-3">
          <button onClick={onProceed} className="btn-primary flex-1">
            Edit field positions
            <ArrowRight size={15} />
          </button>
          <button
            onClick={() => window.location.href = `/agent/form/${formId}`}
            className="btn-secondary"
          >
            Skip to dashboard
          </button>
        </div>
      </div>

      {/* Health score */}
      {health && (
        <FormHealthScore
          health={health}
          compact={false}
        />
      )}
    </motion.div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function UploadPage() {
  const router = useRouter()
  const [stage, setStage]         = useState<Stage>('idle')
  const [pct, setPct]             = useState(0)
  const [file, setFile]           = useState<File | null>(null)
  const [result, setResult]       = useState<{
    formId: string; fieldCount: number; formTitle: string; health: HealthScore | null
  } | null>(null)

  const onDrop = useCallback(async (files: File[]) => {
    const f = files[0]
    if (!f) return
    setFile(f)
    setStage('uploading')
    setResult(null)

    try {
      const res = await formAPI.upload(f, p => {
        setPct(p)
        if (p === 100) setStage('extracting')
      })
      setResult({
        formId:     res.form_id,
        fieldCount: res.field_count,
        formTitle:  res.form_title,
        health:     res.health_score ?? null,
      })
      setStage('done')
      toast.success(`${res.field_count} fields found in "${res.form_title}"`)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Upload failed — please try again.')
      setStage('idle')
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'] },
    maxFiles: 1,
    disabled: stage !== 'idle',
  })

  const handleProceed = () => {
    if (result) router.push(`/agent/form/${result.formId}/edit`)
  }

  return (
    <div className="min-h-screen bg-woven grain">
      <AgentNav />
      <main className="pt-16 min-h-screen flex flex-col">

        <div className="max-w-7xl mx-auto px-6 py-6 w-full">
          <button onClick={() => router.back()} className="btn-ghost">
            <ArrowLeft size={15} />
            Back to dashboard
          </button>
        </div>

        <div className="flex-1 flex items-start justify-center px-6 pb-20 pt-4">
          <div className="w-full max-w-2xl">

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="text-center mb-10">
              <p className="label-xs text-saffron mb-3">Step 1 of 2</p>
              <h1 className="font-display text-4xl text-teal font-semibold mb-3">Upload your form</h1>
              <p className="text-ink-muted font-body">
                Vaarta reads any form — digital PDF, scanned paper, or image.<br />
                AI detects every field automatically.
              </p>
            </motion.div>

            <AnimatePresence mode="wait">
              {stage === 'idle' ? (
                <motion.div key="dropzone" initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}>
                  <div
                    {...getRootProps()}
                    className={clsx(
                      'relative rounded-xl border-2 border-dashed p-16 text-center cursor-pointer transition-all duration-300',
                      isDragActive
                        ? 'border-saffron bg-saffron/4 scale-[1.01]'
                        : 'border-teal/25 bg-white hover:border-teal/50 hover:bg-teal/2'
                    )}
                  >
                    <input {...getInputProps()} />
                    <div className="relative w-20 h-20 mx-auto mb-6">
                      <div className={clsx('absolute inset-0 rounded-2xl transition-all duration-300',
                        isDragActive ? 'bg-saffron/15 scale-110' : 'bg-teal/8 animate-breathe')} />
                      <div className="relative w-20 h-20 flex items-center justify-center">
                        <Upload size={28} className={isDragActive ? 'text-saffron' : 'text-teal'} />
                      </div>
                    </div>
                    <h3 className="font-display text-xl text-teal font-semibold mb-2">
                      {isDragActive ? 'Drop it here!' : 'Drop your form here'}
                    </h3>
                    <p className="text-ink-muted text-sm font-body mb-6">
                      or <span className="text-teal underline underline-offset-2 cursor-pointer">browse your files</span>
                    </p>
                    <div className="flex items-center justify-center gap-6 flex-wrap">
                      {[
                        { icon: FileText, label: 'Digital PDF',    sub: 'AcroForm fields' },
                        { icon: Image,    label: 'Scanned image',  sub: 'PNG, JPG' },
                        { icon: Layers,   label: 'Image PDF',      sub: 'No AcroForm' },
                      ].map(({ icon: Icon, label, sub }) => (
                        <div key={label} className="flex items-center gap-2 text-left">
                          <div className="w-8 h-8 rounded-md bg-teal/6 flex items-center justify-center flex-shrink-0">
                            <Icon size={14} className="text-teal" />
                          </div>
                          <div>
                            <p className="text-ink text-xs font-body font-medium">{label}</p>
                            <p className="text-ink-faint text-[10px]">{sub}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-ink-faint text-xs mt-6 font-body">Max 16 MB · Processed securely</p>
                  </div>
                </motion.div>

              ) : stage === 'done' && result ? (
                <motion.div key="result" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                  <ResultCard
                    file={file!}
                    fieldCount={result.fieldCount}
                    formTitle={result.formTitle}
                    formId={result.formId}
                    health={result.health}
                    onProceed={handleProceed}
                  />
                </motion.div>

              ) : (
                <motion.div key="progress" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  className="card p-10 text-center space-y-6">
                  <div className="flex items-center gap-3 p-3 bg-cream rounded-lg mx-auto max-w-xs">
                    <div className="w-8 h-8 bg-teal/10 rounded flex items-center justify-center flex-shrink-0">
                      <FileText size={16} className="text-teal" />
                    </div>
                    <p className="text-ink text-sm font-body truncate">{file?.name}</p>
                  </div>
                  <StageProgress stage={stage} pct={pct} />
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        </div>
      </main>
    </div>
  )
}
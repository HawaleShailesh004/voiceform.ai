'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { Upload, FileText, Image, Layers, ArrowLeft, Sparkles, CheckCircle } from 'lucide-react'
import AgentNav from '@/components/shared/AgentNav'
import { formAPI } from '@/lib/api'
import clsx from 'clsx'

type Stage = 'idle' | 'uploading' | 'extracting' | 'done'

const STAGES = [
  { id: 'uploading',   label: 'Uploading your form',        sub: 'Sending securely to Vaarta…' },
  { id: 'extracting',  label: 'AI is reading your form',    sub: 'Detecting fields, labels, and structure…' },
  { id: 'done',        label: 'Fields detected!',           sub: 'Redirecting to the editor…' },
]

function StageProgress({ stage, pct }: { stage: Stage; pct: number }) {
  const current = STAGES.findIndex(s => s.id === stage)

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      {/* Stage indicators */}
      <div className="flex items-center gap-2">
        {STAGES.map((s, i) => {
          const done = current > i
          const active = current === i
          return (
            <div key={s.id} className="flex items-center gap-2 flex-1">
              <div className={clsx(
                'w-6 h-6 rounded-full flex items-center justify-center text-xs font-body font-bold transition-all duration-300 flex-shrink-0',
                done    ? 'bg-success text-white' :
                active  ? 'bg-teal text-cream ring-4 ring-teal/20' :
                          'bg-cream-dark text-ink-faint'
              )}>
                {done ? <CheckCircle size={14} /> : i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className={clsx('text-xs font-body font-medium truncate', active ? 'text-teal' : done ? 'text-success' : 'text-ink-faint')}>
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

      {/* Progress bar */}
      {stage === 'uploading' && (
        <div className="space-y-2">
          <div className="h-2 bg-cream-dark rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-teal rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.3 }}
            />
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
            <div className="w-1.5 h-1.5 rounded-full bg-teal animate-dot1" />
            <div className="w-1.5 h-1.5 rounded-full bg-teal animate-dot2" />
            <div className="w-1.5 h-1.5 rounded-full bg-teal animate-dot3" />
          </div>
        </div>
      )}
    </div>
  )
}

export default function UploadPage() {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('idle')
  const [pct, setPct] = useState(0)
  const [file, setFile] = useState<File | null>(null)

  const onDrop = useCallback(async (files: File[]) => {
    const f = files[0]
    if (!f) return
    setFile(f)
    setStage('uploading')

    try {
      const result = await formAPI.upload(f, p => {
        setPct(p)
        if (p === 100) setStage('extracting')
      })
      setStage('done')
      toast.success(`${result.field_count} fields found in "${result.form_title}"`)
      setTimeout(() => router.push(`/agent/form/${result.form_id}/edit`), 800)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Upload failed — please try again.')
      setStage('idle')
    }
  }, [router])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'] },
    maxFiles: 1,
    disabled: stage !== 'idle',
  })

  return (
    <div className="min-h-screen bg-woven grain">
      <AgentNav />
      <main className="pt-16 min-h-screen flex flex-col">

        {/* Back */}
        <div className="max-w-7xl mx-auto px-6 py-6 w-full">
          <button onClick={() => router.back()} className="btn-ghost">
            <ArrowLeft size={15} />
            Back to dashboard
          </button>
        </div>

        {/* Centered content */}
        <div className="flex-1 flex items-center justify-center px-6 pb-20">
          <div className="w-full max-w-2xl">

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mb-10"
            >
              <p className="label-xs text-saffron mb-3">Step 1 of 2</p>
              <h1 className="font-display text-4xl text-teal font-semibold mb-3">
                Upload your form
              </h1>
              <p className="text-ink-muted font-body">
                Vaarta reads any form — digital PDF, scanned paper, or image. <br />
                AI detects every field automatically.
              </p>
            </motion.div>

            <AnimatePresence mode="wait">
              {stage === 'idle' ? (
                <motion.div
                  key="dropzone"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                >
                  {/* Dropzone */}
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

                    {/* Animated upload icon */}
                    <div className="relative w-20 h-20 mx-auto mb-6">
                      <div className={clsx(
                        'absolute inset-0 rounded-2xl transition-all duration-300',
                        isDragActive ? 'bg-saffron/15 scale-110' : 'bg-teal/8 animate-breathe'
                      )} />
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

                    {/* Supported types */}
                    <div className="flex items-center justify-center gap-6 flex-wrap">
                      {[
                        { icon: FileText, label: 'Digital PDF', sub: 'AcroForm fields' },
                        { icon: Image,    label: 'Scanned image', sub: 'PNG, JPG' },
                        { icon: Layers,   label: 'Image PDF', sub: 'No AcroForm' },
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
              ) : (
                <motion.div
                  key="progress"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="card p-10 text-center space-y-6"
                >
                  {/* File info */}
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

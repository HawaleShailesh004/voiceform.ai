'use client'

import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  Upload, FileText, CheckSquare, Link2, Copy,
  Clock, Users, ChevronRight, AlertCircle,
  BarChart2, MessageSquare, Download, RefreshCw, Eye
} from 'lucide-react'
import { formAPI, fillbackAPI, type UploadResult, type AgentForm, type FormField } from '@/lib/api'
import clsx from 'clsx'

// ── Subcomponents ────────────────────────────────────────────────────

function NavBar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-navy/95 backdrop-blur-sm border-b border-slate/40">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-amber flex items-center justify-center">
            <FileText size={15} className="text-white" />
          </div>
          <span className="font-display text-lg text-paper tracking-tight">FormFlow</span>
          <span className="label-caps text-steel ml-2 hidden sm:block">Agent Portal</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="label-caps text-steel">v1.0</span>
          <div className="w-2 h-2 rounded-full bg-success animate-pulse-slow" />
        </div>
      </div>
    </nav>
  )
}

function UploadZone({ onResult }: { onResult: (r: UploadResult) => void }) {
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const [stage, setStage] = useState<'idle' | 'uploading' | 'extracting'>('idle')

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0]
    if (!file) return

    setUploading(true)
    setStage('uploading')

    try {
      const result = await formAPI.uploadForm(file, (pct) => {
        setUploadPct(pct)
        if (pct === 100) setStage('extracting')
      })
      toast.success(`${result.field_count} fields detected`)
      onResult(result)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
      setStage('idle')
      setUploadPct(0)
    }
  }, [onResult])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
    },
    maxFiles: 1,
    disabled: uploading,
  })

  return (
    <div
      {...getRootProps()}
      className={clsx(
        'relative border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-all duration-300',
        isDragActive
          ? 'border-amber bg-amber/5 scale-[1.01]'
          : 'border-steel/40 hover:border-amber/60 hover:bg-amber/3',
        uploading && 'pointer-events-none opacity-80'
      )}
    >
      <input {...getInputProps()} />

      <AnimatePresence mode="wait">
        {stage === 'idle' && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            <div className="w-16 h-16 rounded-lg bg-navy/8 border border-steel/20 flex items-center justify-center mx-auto">
              <Upload size={24} className="text-steel" />
            </div>
            <div>
              <p className="font-display text-xl text-ink">Drop your form here</p>
              <p className="text-mist text-sm mt-1">PDF, PNG, or JPG — scanned or digital</p>
            </div>
            <div className="flex items-center gap-6 justify-center">
              {['AcroForm PDF', 'Scanned Image', 'Image PDF'].map(t => (
                <div key={t} className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber" />
                  <span className="text-xs text-steel">{t}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {stage === 'uploading' && (
          <motion.div
            key="uploading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <div className="w-16 h-16 rounded-full border-2 border-amber/30 border-t-amber flex items-center justify-center mx-auto animate-spin" />
            <p className="font-body text-ink">Uploading… {uploadPct}%</p>
            <div className="w-48 mx-auto h-1 bg-steel/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber rounded-full transition-all duration-300"
                style={{ width: `${uploadPct}%` }}
              />
            </div>
          </motion.div>
        )}

        {stage === 'extracting' && (
          <motion.div
            key="extracting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <div className="relative w-16 h-16 mx-auto">
              <div className="absolute inset-0 rounded-full border-2 border-amber/20 animate-ping" />
              <div className="w-16 h-16 rounded-full bg-amber/10 border border-amber/30 flex items-center justify-center">
                <FileText size={22} className="text-amber" />
              </div>
            </div>
            <div>
              <p className="font-display text-lg text-ink">Analysing with AI</p>
              <p className="text-mist text-sm mt-1">Detecting fields, labels, and structure…</p>
            </div>
            <div className="flex gap-1.5 justify-center">
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function FieldTypeIcon({ type }: { type: string }) {
  const map: Record<string, string> = {
    text: 'T', checkbox: '☑', date: '📅', signature: '✍',
    radio: '◉', select: '▾', number: '#', email: '@',
  }
  return (
    <span className="font-mono text-[10px] w-6 h-6 rounded bg-navy/8 border border-steel/20 flex items-center justify-center text-steel flex-shrink-0">
      {map[type] || 'T'}
    </span>
  )
}

function FormPreview({ result }: { result: UploadResult }) {
  const [copied, setCopied] = useState(false)
  const [activeField, setActiveField] = useState<number | null>(null)
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 })

  const handleCopy = () => {
    navigator.clipboard.writeText(result.chat_link)
    setCopied(true)
    toast.success('Link copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  const sourceLabels: Record<string, string> = {
    acroform: 'Digital AcroForm',
    scanned_image: 'Scanned Image',
    image_pdf: 'Image-based PDF',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="grid grid-cols-1 xl:grid-cols-[1fr,380px] gap-6"
    >
      {/* Left: form image with field overlays */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-steel/15 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg text-ink">{result.form_title}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="badge badge-active">{sourceLabels[result.source_type]}</span>
              <span className="label-caps text-mist">{result.field_count} fields detected</span>
            </div>
          </div>
          <Eye size={18} className="text-mist" />
        </div>

        {result.preview_image ? (
          <div className="relative overflow-auto max-h-[600px] bg-paper">
            <img
              src={result.preview_image}
              alt="Form preview"
              className="w-full"
              onLoad={e => {
                const img = e.target as HTMLImageElement
                setImgSize({ w: img.naturalWidth, h: img.naturalHeight })
              }}
            />
            {/* Bounding box overlays */}
            {result.fields.map((field, i) => {
              const bb = field.bounding_box
              if (!bb) return null
              return (
                <div
                  key={i}
                  className={clsx(
                    'absolute cursor-pointer transition-all duration-150 rounded-sm border-2',
                    activeField === i
                      ? 'border-amber bg-amber/15 z-10'
                      : 'border-amber/40 bg-amber/5 hover:border-amber hover:bg-amber/10'
                  )}
                  style={{
                    left:   `${bb.xmin / 10}%`,
                    top:    `${bb.ymin / 10}%`,
                    width:  `${(bb.xmax - bb.xmin) / 10}%`,
                    height: `${(bb.ymax - bb.ymin) / 10}%`,
                    minWidth: '20px',
                    minHeight: '12px',
                  }}
                  onMouseEnter={() => setActiveField(i)}
                  onMouseLeave={() => setActiveField(null)}
                  title={field.semantic_label}
                />
              )
            })}
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center text-mist bg-paper">
            No preview available
          </div>
        )}
      </div>

      {/* Right: fields list + share */}
      <div className="flex flex-col gap-4">

        {/* Share card */}
        <div className="card-navy p-5 space-y-4">
          <div>
            <p className="label-caps text-mist mb-1">Share with user</p>
            <p className="font-display text-xl text-paper">Collection link ready</p>
          </div>

          <div className="bg-slate/60 border border-steel/30 rounded p-3 flex items-center gap-3">
            <Link2 size={14} className="text-amber flex-shrink-0" />
            <span className="text-paper/70 text-xs font-mono truncate flex-1">
              {result.chat_link}
            </span>
            <button onClick={handleCopy} className="flex-shrink-0">
              <Copy size={14} className={copied ? 'text-amber' : 'text-mist hover:text-paper'} />
            </button>
          </div>

          <button onClick={handleCopy} className="btn-primary w-full justify-center text-sm">
            {copied ? '✓ Copied' : 'Copy Chat Link'}
          </button>

          {result.whatsapp_link && (
            <a
              href={result.whatsapp_link}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary w-full justify-center text-sm"
            >
              <MessageSquare size={14} />
              Share via WhatsApp
            </a>
          )}

          {result.warnings.length > 0 && (
            <div className="border border-warning/30 rounded p-3 flex gap-2">
              <AlertCircle size={14} className="text-warning mt-0.5 flex-shrink-0" />
              <div className="text-xs text-warning/80 space-y-1">
                {result.warnings.map((w, i) => <p key={i}>{w}</p>)}
              </div>
            </div>
          )}
        </div>

        {/* Fields list */}
        <div className="card flex-1 overflow-hidden">
          <div className="px-4 py-3 border-b border-steel/15 flex items-center justify-between">
            <p className="label-caps text-mist">Detected fields</p>
            <span className="font-mono text-xs text-amber">{result.field_count}</span>
          </div>
          <div className="overflow-y-auto max-h-80">
            {result.fields.map((field, i) => (
              <div
                key={i}
                className={clsx(
                  'px-4 py-3 border-b border-steel/8 flex items-start gap-3 transition-colors cursor-default',
                  activeField === i ? 'bg-amber/5' : 'hover:bg-paper/50'
                )}
                onMouseEnter={() => setActiveField(i)}
                onMouseLeave={() => setActiveField(null)}
              >
                <FieldTypeIcon type={field.field_type} />
                <div className="flex-1 min-w-0">
                  <p className="text-ink text-sm font-medium truncate">{field.semantic_label}</p>
                  <p className="text-mist text-xs truncate">{field.question_template}</p>
                </div>
                {field.is_required && (
                  <span className="text-amber text-xs font-mono mt-0.5 flex-shrink-0">*</span>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </motion.div>
  )
}

function FormCard({ form, onSelect }: { form: AgentForm; onSelect: () => void }) {
  const progress = form.session_count > 0
    ? Math.round(form.completed_count / form.session_count * 100)
    : 0

  return (
    <motion.div
      whileHover={{ y: -2, transition: { duration: 0.15 } }}
      onClick={onSelect}
      className="card p-5 cursor-pointer hover:shadow-deep transition-shadow"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-navy/8 border border-steel/20 flex items-center justify-center">
            <FileText size={18} className="text-navy" />
          </div>
          <div>
            <p className="font-body font-medium text-ink text-sm">{form.form_title}</p>
            <p className="text-mist text-xs">{form.original_filename}</p>
          </div>
        </div>
        <ChevronRight size={16} className="text-mist mt-1" />
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <p className="label-caps text-mist mb-1">Fields</p>
          <p className="font-mono text-ink font-medium">{form.field_count}</p>
        </div>
        <div>
          <p className="label-caps text-mist mb-1">Sessions</p>
          <p className="font-mono text-ink font-medium">{form.session_count}</p>
        </div>
        <div>
          <p className="label-caps text-mist mb-1">Done</p>
          <p className="font-mono text-amber font-medium">{form.completed_count}</p>
        </div>
      </div>

      {form.session_count > 0 && (
        <div>
          <div className="flex justify-between mb-1">
            <span className="label-caps text-mist">Completion</span>
            <span className="font-mono text-xs text-steel">{progress}%</span>
          </div>
          <div className="h-1 bg-steel/15 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </motion.div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────

export default function AgentDashboard() {
  const [view, setView] = useState<'upload' | 'result' | 'forms'>('upload')
  const [result, setResult] = useState<UploadResult | null>(null)
  const [forms, setForms] = useState<AgentForm[]>([])
  const [loadingForms, setLoadingForms] = useState(false)

  const loadForms = async () => {
    setLoadingForms(true)
    try {
      const data = await formAPI.listForms()
      setForms(data)
    } catch {
      // ignore if backend not up
    } finally {
      setLoadingForms(false)
    }
  }

  useEffect(() => {
    loadForms()
  }, [])

  const handleResult = (r: UploadResult) => {
    setResult(r)
    setView('result')
    loadForms()
  }

  return (
    <div className="min-h-screen bg-paper-texture">
      <NavBar />

      <div className="pt-16 max-w-7xl mx-auto px-6 pb-16">

        {/* Hero header */}
        <div className="py-12 border-b border-steel/15 mb-8">
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div className="stagger">
              <p className="label-caps text-amber mb-3">FormFlow · Agent Portal</p>
              <h1 className="font-display text-display-lg text-ink text-balance">
                Turn any form into<br />
                <em className="text-amber not-italic">a conversation.</em>
              </h1>
              <p className="text-steel mt-3 max-w-lg">
                Upload a form. Share a link. Let your users fill it naturally by chat or voice.
                Receive a completed form.
              </p>
            </div>

            {/* Stats row */}
            {forms.length > 0 && (
              <div className="flex gap-6 flex-wrap">
                {[
                  { label: 'Forms', value: forms.length },
                  { label: 'Sessions', value: forms.reduce((a, f) => a + f.session_count, 0) },
                  { label: 'Completed', value: forms.reduce((a, f) => a + f.completed_count, 0) },
                ].map(({ label, value }) => (
                  <div key={label} className="text-right">
                    <p className="font-display text-display-md text-amber">{value}</p>
                    <p className="label-caps text-mist">{label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-8 border-b border-steel/15">
          {[
            { key: 'upload', label: 'Upload Form', icon: Upload },
            { key: 'forms',  label: `My Forms (${forms.length})`, icon: BarChart2 },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => { setView(key as any); if (key === 'forms') loadForms() }}
              className={clsx(
                'flex items-center gap-2 px-5 py-3 text-sm font-body font-medium transition-all border-b-2 -mb-px',
                view === key || (key === 'upload' && view === 'result')
                  ? 'border-amber text-amber'
                  : 'border-transparent text-mist hover:text-steel'
              )}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">

          {(view === 'upload') && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="max-w-xl mx-auto"
            >
              <UploadZone onResult={handleResult} />
              <p className="text-center text-mist text-xs mt-4">
                Your files are processed securely and never stored permanently.
              </p>
            </motion.div>
          )}

          {view === 'result' && result && (
            <motion.div
              key="result"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-display text-xl text-ink">Extraction complete</h2>
                <button
                  onClick={() => setView('upload')}
                  className="btn-ghost text-sm"
                >
                  <Upload size={14} />
                  Upload another
                </button>
              </div>
              <FormPreview result={result} />
            </motion.div>
          )}

          {view === 'forms' && (
            <motion.div
              key="forms"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-display text-xl text-ink">Your forms</h2>
                <button onClick={loadForms} className="btn-ghost text-sm">
                  <RefreshCw size={14} className={loadingForms ? 'animate-spin' : ''} />
                  Refresh
                </button>
              </div>

              {loadingForms ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {[1,2,3].map(i => (
                    <div key={i} className="card p-5 space-y-3">
                      <div className="h-4 shimmer rounded w-3/4" />
                      <div className="h-3 shimmer rounded w-1/2" />
                      <div className="h-2 shimmer rounded w-full mt-4" />
                    </div>
                  ))}
                </div>
              ) : forms.length === 0 ? (
                <div className="card p-16 text-center">
                  <FileText size={32} className="text-mist mx-auto mb-4" />
                  <p className="font-display text-lg text-ink mb-2">No forms yet</p>
                  <p className="text-mist text-sm mb-6">Upload your first form to get started.</p>
                  <button onClick={() => setView('upload')} className="btn-primary mx-auto">
                    Upload a form
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger">
                  {forms.map(form => (
                    <FormCard
                      key={form.form_id}
                      form={form}
                      onSelect={() => {
                        window.location.href = `/agent/form/${form.form_id}`
                      }}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  )
}

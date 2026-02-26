'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Save, Share2, Eye, CheckCircle,
  Pencil, Check, AlertCircle, Sparkles, FileImage, Type,
  Undo2, Redo2,
} from 'lucide-react'
import AgentNav from '@/components/shared/AgentNav'
import FieldEditor from '@/components/editor/FieldEditor'
import ShareModal from '@/components/shared/ShareModal'
import { formAPI, type FormField } from '@/lib/api'
import clsx from 'clsx'

const FONT_SIZES = [10, 12, 14, 16, 18, 20, 22, 24]
const FONT_STYLES = [
  { value: 'normal', label: 'Normal' },
  { value: 'italic', label: 'Italic' },
  { value: 'bold', label: 'Bold' },
]
const ALIGN_H = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
]
const ALIGN_V = [
  { value: 'top', label: 'Top' },
  { value: 'middle', label: 'Middle' },
  { value: 'bottom', label: 'Bottom' },
]

export default function EditFormPage() {
  const { formId } = useParams() as { formId: string }
  const router = useRouter()

  // ── Data state ────────────────────────────────────────
  const [fields, setFields] = useState<FormField[]>([])
  const [title, setTitle] = useState('')
  const [preview, setPreview] = useState<string | null>(null)

  // ── UI state ──────────────────────────────────────────
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [published, setPublished] = useState(false)
  const [saveError, setSaveError] = useState(false)

  // ── Live preview (values on same editor image) ─────────
  const [livePreview, setLivePreview] = useState(false)
  const [sampleValues, setSampleValues] = useState<Record<string, string>>({})
  const [generatingSamples, setGeneratingSamples] = useState(false)
  const [previewFontSize, setPreviewFontSize] = useState(14)
  const [previewFontStyle, setPreviewFontStyle] = useState('normal')
  const [previewAlignH, setPreviewAlignH] = useState<'left' | 'center' | 'right'>('left')
  const [previewAlignV, setPreviewAlignV] = useState<'top' | 'middle' | 'bottom'>('top')
  const [previewStyleModalOpen, setPreviewStyleModalOpen] = useState(false)

  const titleInputRef = useRef<HTMLInputElement>(null)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>()
  const savedFields = useRef<FormField[]>([])
  const savedTitle = useRef('')
  const bboxDragRef = useRef(false)

  // ── Undo / redo (max 50 steps) ─────────────────────────
  const MAX_UNDO = 50
  const [undoStack, setUndoStack] = useState<FormField[][]>([])
  const [redoStack, setRedoStack] = useState<FormField[][]>([])

  // ── Load ──────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      formAPI.get(formId),
      formAPI.preview(formId).catch(() => null),
    ])
      .then(([data, img]) => {
        const f = (data.fields || []) as FormField[]
        setTitle(data.form_title || 'Untitled Form')
        setPreview(img)
        const sv = data.sample_values || {}
        setSampleValues(sv)
        if (Object.keys(sv).length > 0) setLivePreview(true)
        // Use first field as "saved default" and init dropdown from it
        const defSize = f[0]?.font_size ?? 14
        const defStyle = f[0]?.font_style ?? 'normal'
        const defH = (f[0]?.text_align_h ?? 'left') as 'left' | 'center' | 'right'
        const defV = (f[0]?.text_align_v ?? 'top') as 'top' | 'middle' | 'bottom'
        if (f.length > 0) {
          setPreviewFontSize(defSize)
          setPreviewFontStyle(defStyle)
          setPreviewAlignH(defH)
          setPreviewAlignV(defV)
        }
        // Clear font/style/align on fields that match default so preview uses global dropdown for them
        const normalized = f.map((field) => ({
          ...field,
          font_size: field.font_size === defSize ? undefined : field.font_size,
          font_style: field.font_style === defStyle ? undefined : field.font_style,
          text_align_h: field.text_align_h === defH ? undefined : field.text_align_h,
          text_align_v: field.text_align_v === defV ? undefined : field.text_align_v,
        }))
        setFields(normalized)
        savedFields.current = normalized
        savedTitle.current = data.form_title || 'Untitled Form'
      })
      .catch(() => toast.error('Could not load form'))
      .finally(() => setLoading(false))
  }, [formId])

  // ── Dirty tracking ────────────────────────────────────
  const handleFieldsChange = (next: FormField[]) => {
    if (!bboxDragRef.current) {
      setUndoStack((s) => {
        const nextStack = [...s, JSON.parse(JSON.stringify(fields)) as FormField[]]
        return nextStack.slice(-MAX_UNDO)
      })
      setRedoStack([])
    }
    setFields(next)
    setDirty(true)
    setSaved(false)
    setSaveError(false)
    clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => doSave(next, title), 30_000)
  }

  const onEditorActionStart = useCallback(() => {
    setUndoStack((s) => {
      const nextStack = [...s, JSON.parse(JSON.stringify(fields)) as FormField[]]
      return nextStack.slice(-MAX_UNDO)
    })
    setRedoStack([])
    bboxDragRef.current = true
  }, [fields])

  const onEditorCommit = useCallback(() => {
    bboxDragRef.current = false
  }, [])

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return
    const prev = undoStack[undoStack.length - 1]
    setUndoStack((s) => s.slice(0, -1))
    setRedoStack((s) => [...s, JSON.parse(JSON.stringify(fields)) as FormField[]])
    setFields(prev)
    setDirty(true)
    setSaved(false)
    setSaveError(false)
    clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => doSave(prev, title), 30_000)
  }, [undoStack, fields, title])

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return
    const next = redoStack[redoStack.length - 1]
    setRedoStack((s) => s.slice(0, -1))
    setUndoStack((s) => [...s, JSON.parse(JSON.stringify(fields)) as FormField[]].slice(-MAX_UNDO))
    setFields(next)
    setDirty(true)
    setSaved(false)
    setSaveError(false)
    clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => doSave(next, title), 30_000)
  }, [redoStack, fields, title])

  const handleTitleChange = (next: string) => {
    setTitle(next)
    setDirty(next !== savedTitle.current)
    setSaved(false)
  }

  // ── Save ──────────────────────────────────────────────
  // Merge: global "Font & alignment" as default; per-field values from coordinates modal override
  const doSave = useCallback(async (f = fields, t = title) => {
    const merged = f.map((field) => ({
      ...field,
      font_size: field.font_size ?? previewFontSize,
      font_style: field.font_style ?? previewFontStyle,
      text_align_h: field.text_align_h ?? previewAlignH,
      text_align_v: field.text_align_v ?? previewAlignV,
    }))
    setSaving(true)
    setSaveError(false)
    try {
      await formAPI.update(formId, merged, t)
      savedFields.current = merged
      savedTitle.current = t
      setDirty(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setSaveError(true)
      toast.error('Save failed — check connection')
    } finally {
      setSaving(false)
    }
  }, [formId, fields, title, previewFontSize, previewFontStyle, previewAlignH, previewAlignV])

  // When global "Font & alignment" changes, mark unsaved and schedule auto-save (same as field edits)
  const scheduleSave = useCallback(() => {
    setDirty(true)
    setSaved(false)
    setSaveError(false)
    clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => doSave(), 30_000)
  }, [doSave])

  const handleGlobalPreviewChange = useCallback(<T,>(setter: (v: T) => void, value: T) => {
    setter(value)
    scheduleSave()
  }, [scheduleSave])

  const handleSave = () => doSave()

  const handlePublish = async () => {
    await doSave()
    setPublished(true)
    setShareOpen(true)
  }

  const handleGenerateSamples = async () => {
    setGeneratingSamples(true)
    try {
      const values = await formAPI.sampleValues(formId, fields)
      setSampleValues(values)
      setLivePreview(true)
      const count = Object.keys(values).filter(k => values[k] != null && values[k] !== '').length
      toast.success(count ? `${count} sample values loaded` : 'Sample values generated')
    } catch {
      toast.error('Could not generate samples — check API')
    } finally {
      setGeneratingSamples(false)
    }
  }

  // ── Keyboard shortcuts ────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) handleRedo()
        else handleUndo()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [fields, title, handleUndo, handleRedo])

  useEffect(() => () => clearTimeout(autoSaveTimer.current), [])

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  // ── Loading screen ────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-woven grain flex items-center justify-center">
      <div className="flex gap-1.5">
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full bg-teal/50"
            animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
            transition={{ duration: 1.2, delay: i * 0.2, repeat: Infinity }}
          />
        ))}
      </div>
    </div>
  )

  const chatLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/chat/${formId}`
  const whatsappLink = `https://wa.me/?text=${encodeURIComponent(`Fill "${title}" easily by chat: ${chatLink}`)}`

  return (
    <div className="min-h-screen bg-woven grain flex flex-col">
      <AgentNav />

      {/* ─── Sub-header ─── */}
      <div className="pt-4 sticky top-16 z-40 bg-white/95 backdrop-blur-md border-b border-teal/8 shadow-[0_1px_0_rgba(13,61,58,0.04)]">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center gap-3">

          <button onClick={() => router.back()} className="btn-ghost btn-sm">
            <ArrowLeft size={14} />
            Back
          </button>

          <div className="w-px h-5 bg-teal/12 flex-shrink-0" />

          {/* Editable title */}
          <div className="flex items-center gap-2 min-w-0 flex-1 max-w-xs">
            {editingTitle ? (
              <div className="flex items-center gap-1.5 flex-1">
                <input
                  ref={titleInputRef}
                  autoFocus
                  value={title}
                  onChange={e => handleTitleChange(e.target.value)}
                  onBlur={() => setEditingTitle(false)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') setEditingTitle(false)
                    if (e.key === 'Escape') { setTitle(savedTitle.current); setEditingTitle(false) }
                  }}
                  className="font-display text-base text-teal bg-transparent border-b-2 border-saffron outline-none min-w-0 flex-1"
                />
                <button onClick={() => setEditingTitle(false)} className="text-teal/50 hover:text-teal">
                  <Check size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditingTitle(true)}
                className="group flex items-center gap-1.5 min-w-0"
                title="Click to rename"
              >
                <span className="font-display text-base text-teal hover:text-saffron transition-colors truncate">
                  {title}
                </span>
                <Pencil size={11} className="text-ink-faint/0 group-hover:text-ink-faint/60 transition-all flex-shrink-0" />
              </button>
            )}
          </div>

          {/* Metadata */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[11px] font-body text-ink-faint/70 tabular-nums">
              {fields.length} field{fields.length !== 1 ? 's' : ''}
            </span>
            <AnimatePresence mode="wait">
              {saveError ? (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-1 text-[11px] text-error font-medium"
                >
                  <AlertCircle size={11} /> Not saved
                </motion.div>
              ) : dirty ? (
                <motion.div
                  key="dirty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-1 text-[11px] text-ink-faint"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-saffron/70" />
                  Unsaved
                </motion.div>
              ) : saved ? (
                <motion.div
                  key="saved"
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-1 text-[11px] text-success font-medium"
                >
                  <CheckCircle size={11} /> Saved
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => router.push(`/agent/form/${formId}`)}
              className="btn-ghost btn-sm"
            >
              <Eye size={14} />
              Analytics
            </button>
            <button
              onClick={handleSave}
              disabled={saving || (!dirty && !saveError)}
              className={clsx(
                'btn-secondary btn-sm transition-all',
                (!dirty && !saveError && !saving) && 'opacity-50 cursor-not-allowed'
              )}
              title="Save (⌘S)"
            >
              {saving
                ? <><Loader /> Saving…</>
                : <><Save size={14} /> Save</>
              }
            </button>
            <button onClick={handlePublish} className="btn-primary btn-sm">
              <Share2 size={14} />
              {published ? 'Share again' : 'Publish & Share'}
            </button>
          </div>
        </div>
      </div>

      {/* ─── Editor ─── */}
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-5 mt-14 w-full">

        {/* Tip bar + live preview controls */}
        <div className="mb-4 px-4 py-2.5 bg-teal/4 border border-teal/10 rounded-lg flex items-center gap-3 flex-wrap">
          <div className="w-1.5 h-1.5 rounded-full bg-saffron flex-shrink-0" />
          <p className="text-ink-muted text-xs font-body flex-1 min-w-0">
            <strong className="font-semibold text-teal">Drag</strong> boxes to reposition &nbsp;·&nbsp;
            <strong className="font-semibold text-teal">Resize</strong> with handles &nbsp;·&nbsp;
            <strong className="font-semibold text-teal">Double-click</strong> label to rename
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className="btn-ghost btn-sm"
              title="Undo (⌘Z)"
            >
              <Undo2 size={14} />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className="btn-ghost btn-sm"
              title="Redo (⌘⇧Z)"
            >
              <Redo2 size={14} />
            </button>
            {Object.keys(sampleValues).length === 0 && (
              <button
                type="button"
                onClick={handleGenerateSamples}
                disabled={generatingSamples || !fields.length}
                className="btn-secondary btn-sm flex items-center gap-1.5"
              >
                {generatingSamples ? (
                  <span className="w-3.5 h-3.5 border-2 border-teal/30 border-t-teal rounded-full animate-spin" />
                ) : (
                  <Sparkles size={14} />
                )}
                Generate samples
              </button>
            )}
            <button
              type="button"
              onClick={() => setLivePreview(!livePreview)}
              className={livePreview ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}
            >
              <FileImage size={14} />
              {livePreview ? 'Hide' : 'Show'} preview
            </button>
            {livePreview && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPreviewStyleModalOpen(v => !v)}
                  className={clsx(
                    'btn-sm flex items-center gap-1.5 border transition-colors',
                    previewStyleModalOpen
                      ? 'btn-primary border-teal'
                      : 'btn-ghost border-teal/15'
                  )}
                  title="Font size, style & alignment"
                >
                  <Type size={14} />
                  {previewStyleModalOpen ? 'Close' : 'Font & alignment'}
                </button>
                {previewStyleModalOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setPreviewStyleModalOpen(false)}
                      aria-hidden
                    />
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full left-0 mt-1.5 z-50 min-w-[220px] card p-4 shadow-lift border border-teal/12"
                    >
                      <div className="space-y-3">
                        <div>
                          <label className="label-xs text-ink-faint block mb-1">Font size</label>
                          <select
                            value={previewFontSize}
                            onChange={e => handleGlobalPreviewChange(setPreviewFontSize, Number(e.target.value))}
                            className="input text-xs py-1.5 w-full"
                          >
                            {FONT_SIZES.map(n => (<option key={n} value={n}>{n}px</option>))}
                          </select>
                        </div>
                        <div>
                          <label className="label-xs text-ink-faint block mb-1">Style</label>
                          <select
                            value={previewFontStyle}
                            onChange={e => handleGlobalPreviewChange(setPreviewFontStyle, e.target.value)}
                            className="input text-xs py-1.5 w-full"
                          >
                            {FONT_STYLES.map(({ value, label }) => (<option key={value} value={value}>{label}</option>))}
                          </select>
                        </div>
                        <div>
                          <label className="label-xs text-ink-faint block mb-1">Align H</label>
                          <select
                            value={previewAlignH}
                            onChange={e => handleGlobalPreviewChange(setPreviewAlignH, e.target.value as 'left' | 'center' | 'right')}
                            className="input text-xs py-1.5 w-full"
                          >
                            {ALIGN_H.map(({ value, label }) => (<option key={value} value={value}>{label}</option>))}
                          </select>
                        </div>
                        <div>
                          <label className="label-xs text-ink-faint block mb-1">Align V</label>
                          <select
                            value={previewAlignV}
                            onChange={e => handleGlobalPreviewChange(setPreviewAlignV, e.target.value as 'top' | 'middle' | 'bottom')}
                            className="input text-xs py-1.5 w-full"
                          >
                            {ALIGN_V.map(({ value, label }) => (<option key={value} value={value}>{label}</option>))}
                          </select>
                        </div>
                      </div>
                    </motion.div>
                  </>
                )}
              </div>
            )}
          </div>
          <span className="text-[10px] text-ink-faint/60 font-mono flex-shrink-0">Auto-saves every 30s</span>
        </div>

        <FieldEditor
          fields={fields}
          previewImage={preview}
          onChange={handleFieldsChange}
          sampleValues={sampleValues}
          livePreview={livePreview}
          previewFontSize={previewFontSize}
          previewFontStyle={previewFontStyle}
          previewAlignH={previewAlignH}
          previewAlignV={previewAlignV}
          onActionStart={onEditorActionStart}
          onCommit={onEditorCommit}
        />
      </main>

      <ShareModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        formTitle={title}
        chatLink={chatLink}
        whatsappLink={whatsappLink}
      />
    </div>
  )
}

function Loader() {
  return (
    <div className="w-3.5 h-3.5 border-2 border-teal/25 border-t-teal rounded-full animate-spin" />
  )
}

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  Send, Mic, MicOff, CheckCircle,
  MessageSquareText, Paperclip, X, FileText, Image as ImageIcon,
  Download, MessageCircle, Loader2, Volume2
} from 'lucide-react'
import { sessionAPI, chatAPI, fillAPI, whatsappAPI, audioAPI, type ChatResponse } from '@/lib/api'
import WhatsAppModal from '@/components/shared/WhatsAppModal'
import clsx from 'clsx'

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// ─── Palette (warm dark: #18120E base, saffron #E8873A accent) ────────────
const C = {
  base:        '#18120E',
  surface:     'rgba(255,255,255,0.05)',
  surfaceHov:  'rgba(255,255,255,0.08)',
  border:      'rgba(255,255,255,0.08)',
  borderHov:   'rgba(255,255,255,0.14)',
  saffron:     '#E8873A',
  saffronLight:'#F4A96A',
  saffronAlpha:'rgba(232,135,58,0.15)',
  saffronBorder:'rgba(232,135,58,0.3)',
  cream:       'rgba(250,246,239,0.92)',
  creamMuted:  'rgba(250,246,239,0.45)',
  creamFaint:  'rgba(250,246,239,0.22)',
  headerBg:    'rgba(22,16,11,0.92)',
  inputBg:     'rgba(16,11,7,0.95)',
  popupBg:     '#1E160F',
  overlay:     'rgba(0,0,0,0.6)',
}

/* ── Types ─────────────────────────────────────────── */
interface Message {
  id: string
  role: 'bot' | 'user'
  text: string
  ts: Date
  attachment?: { name: string; url?: string; extracted?: string; field_name?: string }
}
type Lang = 'en' | 'hi'

const OPENERS: Record<Lang, (title: string) => string> = {
  en: (t) => `Hi there! 👋 I'm here to help you fill out the *${t}* — don't worry, I'll make it easy.\n\nShall we start?`,
  hi: (t) => `नमस्ते! 🙏 मैं आपकी *${t}* भरने में मदद करूँगा — चिंता मत कीजिए, बस कुछ आसान सवाल पूछूँगा।\n\nक्या हम शुरू करें?`,
}

/* ── Voice hook ────────────────────────────────────── */
function useVoice(onResult: (t: string) => void, lang: Lang) {
  const [listening, setListening] = useState(false)
  const [supported, setSupported] = useState(false)
  const recRef = useRef<any>(null)

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    setSupported(true)
    const rec = new SR()
    rec.continuous = false; rec.interimResults = false
    rec.lang = lang === 'hi' ? 'hi-IN' : 'en-IN'
    rec.onresult = (e: any) => { onResult(e.results[0][0].transcript); setListening(false) }
    rec.onerror = () => setListening(false)
    rec.onend   = () => setListening(false)
    recRef.current = rec
  }, [lang, onResult])

  const toggle = () => {
    if (!recRef.current) return
    if (listening) { recRef.current.stop(); setListening(false) }
    else           { recRef.current.start(); setListening(true) }
  }
  return { listening, supported, toggle }
}

/* ── Attachment bubble ─────────────────────────────── */
function AttachmentBubble({ att }: { att: NonNullable<Message['attachment']> }) {
  const isImage = att.url && att.name.match(/\.(png|jpg|jpeg|webp)$/i)
  return (
    <div className="mt-2 rounded-xl overflow-hidden max-w-[200px]"
      style={{ background: C.surface, border: `1px solid ${C.border}` }}>
      {isImage && att.url
        ? <img src={att.url} alt={att.name} className="w-full max-h-32 object-cover" />
        : (
          <div className="flex items-center gap-2 px-3 py-2.5">
            <FileText size={13} style={{ color: C.saffron, flexShrink: 0 }} />
            <span className="text-xs truncate" style={{ color: C.creamMuted }}>{att.name}</span>
          </div>
        )}
      {att.extracted && !['SIGNATURE_UPLOADED', 'PHOTO_UPLOADED'].includes(att.extracted) && (
        <div className="px-3 py-1.5"
          style={{ borderTop: `1px solid ${C.border}`, background: C.saffronAlpha }}>
          <p className="text-[10px]" style={{ color: C.saffronLight }}>
            Extracted: <span className="font-mono font-bold">{att.extracted}</span>
          </p>
        </div>
      )}
    </div>
  )
}

/* ── Message bubble ────────────────────────────────── */
function Bubble({ msg }: { msg: Message }) {
  const isBot = msg.role === 'bot'
  const rendered = msg.text
    .replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>')

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 340, damping: 28 }}
      className={clsx('flex gap-2.5', !isBot && 'flex-row-reverse')}
    >
      {isBot && (
        <div className="flex-shrink-0 mt-auto mb-0.5 w-7 h-7 rounded-full flex items-center justify-center"
          style={{ background: C.saffronAlpha, border: `1.5px solid ${C.saffronBorder}` }}>
          <MessageSquareText size={13} style={{ color: C.saffron }} />
        </div>
      )}

      <div className={clsx('flex flex-col gap-1 max-w-[78%]', isBot ? 'items-start' : 'items-end')}>
        <div
          className="px-4 py-3 text-sm font-body leading-relaxed"
          style={isBot
            ? {
                background: 'rgba(255,255,255,0.07)',
                border: `1px solid rgba(255,255,255,0.09)`,
                backdropFilter: 'blur(8px)',
                borderRadius: '18px 18px 18px 4px',
                color: C.cream,
              }
            : {
                background: C.saffron,
                borderRadius: '18px 4px 18px 18px',
                color: 'white',
                boxShadow: `0 2px 20px rgba(232,135,58,0.25)`,
              }
          }
          dangerouslySetInnerHTML={{ __html: rendered }}
        />
        {msg.attachment && <AttachmentBubble att={msg.attachment} />}
        <span className="text-[10px] px-1" style={{ color: C.creamFaint }}>
          {msg.ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </motion.div>
  )
}

/* ── Typing indicator ──────────────────────────────── */
function Typing() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className="flex gap-2.5 items-end"
    >
      <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
        style={{ background: C.saffronAlpha, border: `1.5px solid ${C.saffronBorder}` }}>
        <MessageSquareText size={13} style={{ color: C.saffron }} />
      </div>
      <div className="px-4 py-3.5 flex gap-1.5 items-center"
        style={{
          background: 'rgba(255,255,255,0.07)',
          border: `1px solid rgba(255,255,255,0.09)`,
          borderRadius: '18px 18px 18px 4px',
        }}>
        {[0, 1, 2].map(i => (
          <div key={i} className={`w-1.5 h-1.5 rounded-full animate-dot${i + 1}`}
            style={{ background: C.creamMuted }} />
        ))}
      </div>
    </motion.div>
  )
}

/* ── File picker ───────────────────────────────────── */
function FilePicker({ onFile, onClose, lang }: {
  onFile: (file: File, fieldName: string) => void
  onClose: () => void
  lang: Lang
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fieldName, setFieldName] = useState('')
  const isHi = lang === 'hi'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      className="absolute bottom-full left-0 mb-2 w-72 rounded-2xl p-4 shadow-2xl z-50"
      style={{ background: C.popupBg, border: `1px solid ${C.borderHov}` }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold font-body" style={{ color: C.cream }}>
          {isHi ? 'दस्तावेज़ अपलोड करें' : 'Upload a document'}
        </p>
        <button onClick={onClose} className="p-1 transition-colors" style={{ color: C.creamFaint }}>
          <X size={14} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {['aadhaar_number', 'pan_number', 'signature', 'photo'].map(f => (
          <button key={f} onClick={() => setFieldName(f)}
            className="px-2 py-1 rounded-lg text-[10px] font-mono border transition-all"
            style={fieldName === f
              ? { background: C.saffron, color: 'white', borderColor: C.saffron }
              : { background: C.surface, color: C.creamMuted, borderColor: C.border }
            }>
            {f}
          </button>
        ))}
      </div>

      <input
        type="text" value={fieldName} onChange={e => setFieldName(e.target.value)}
        placeholder={isHi ? 'कौन सा फ़ील्ड?' : 'Field name (e.g. aadhaar_number)'}
        className="w-full rounded-lg px-3 py-2 text-xs font-mono focus:outline-none mb-3"
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          color: C.cream,
        }}
      />

      <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f && fieldName.trim()) { onFile(f, fieldName.trim()); onClose() }
          else if (f) toast.error('Enter a field name first')
        }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={!fieldName.trim()}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all"
        style={fieldName.trim()
          ? { background: C.saffron, color: 'white' }
          : { background: C.surface, color: C.creamFaint, cursor: 'not-allowed' }
        }>
        <ImageIcon size={14} />
        {isHi ? 'फ़ाइल चुनें' : 'Choose file'}
      </button>
      <p className="text-center mt-2 text-[10px]" style={{ color: C.creamFaint }}>
        PDF, PNG, JPG · max 10 MB
      </p>
    </motion.div>
  )
}

/* ── Get PDF Modal ─────────────────────────────────── */
function GetPDFModal({ isOpen, onClose, sessionId, lang, isPartial, onSent, onDownloadInstead }: {
  isOpen: boolean; onClose: () => void; sessionId: string; lang: Lang
  isPartial?: boolean; onSent?: () => void; onDownloadInstead?: () => void
}) {
  const [phone, setPhone] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const isHi = lang === 'hi'

  const handleSend = async () => {
    const digits = phone.replace(/\D/g, '')
    const clean = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits
    if (!/^[6-9]\d{9}$/.test(clean)) {
      setError(isHi ? 'कृपया 10 अंकों का सही मोबाइल नंबर डालें' : 'Enter a valid 10-digit Indian mobile number')
      return
    }
    setError(''); setSending(true)
    try {
      await fillAPI.fill(sessionId, isPartial ?? false)
      const res = await whatsappAPI.send(sessionId, clean, lang)
      toast.success(res.status === 'sent' ? (isHi ? 'भेज दिया! ✅' : 'Sent! ✅') : 'Queued!')
      onSent?.(); onClose()
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Something went wrong')
    } finally { setSending(false) }
  }

  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [isOpen])

  if (!isOpen) return null
  const content = (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="fixed inset-0 z-[100]"
        style={{ background: C.overlay, backdropFilter: 'blur(4px)' }} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 340, damping: 28 }}
        className="fixed inset-x-3 bottom-3 z-[101] sm:left-1/2 sm:right-auto sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-sm"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden mx-auto max-w-sm"
          style={{ border: '1px solid rgba(13,61,58,0.1)' }}>
          <div className="px-5 py-4 flex items-center justify-between" style={{ background: '#25D366' }}>
            <div className="flex items-center gap-2.5">
              <MessageCircle size={20} className="text-white" />
              <span className="font-body font-semibold text-white text-sm">
                {isHi ? 'WhatsApp पर PDF भेजें' : 'Send PDF to WhatsApp'}
              </span>
            </div>
            <button onClick={onClose} className="text-white/75 hover:text-white p-1.5 -mr-1 touch-manipulation">
              <X size={18} />
            </button>
          </div>
          <div className="p-5">
            <p className="text-sm font-body mb-4 leading-relaxed" style={{ color: '#6B5E4E' }}>
              {isHi
                ? 'वह नंबर डालें जिस पर भरा हुआ फ़ॉर्म WhatsApp पर भेजना है।'
                : 'Enter the WhatsApp number to receive the completed form.'}
            </p>
            <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 mb-3"
              style={{ background: '#FAF6EF', border: '1.5px solid rgba(13,61,58,0.14)' }}>
              <span className="text-sm font-mono font-medium" style={{ color: '#9E8E7E' }}>+91</span>
              <div className="w-px h-5 flex-shrink-0" style={{ background: 'rgba(26,18,8,0.1)' }} />
              <input
                type="tel" inputMode="numeric" autoComplete="tel-national"
                value={phone}
                onChange={e => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setError('') }}
                placeholder="98765 43210"
                className="flex-1 bg-transparent text-base font-body outline-none placeholder:text-ink-faint"
                style={{ color: '#1A1208' }}
              />
            </div>
            {error && <p className="text-xs font-body mb-3 px-1" style={{ color: '#B03A2E' }}>{error}</p>}
            <button
              onClick={handleSend}
              disabled={sending || phone.replace(/\D/g, '').length < 10}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white font-semibold text-sm transition-all min-h-[48px] disabled:opacity-50"
              style={{ background: '#25D366' }}
            >
              {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={16} />}
              {sending ? (isHi ? 'भेज रहे हैं…' : 'Sending…') : (isHi ? 'भेजें' : 'Send via WhatsApp')}
            </button>
            <button
              onClick={() => { onClose(); setPhone(''); setError(''); onDownloadInstead?.() }}
              className="w-full mt-2.5 py-3 text-sm font-body transition-colors min-h-[44px]"
              style={{ color: '#9E8E7E' }}
            >
              {isHi ? 'डिवाइस पर डाउनलोड करें' : 'Download to device instead'}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
  return typeof document !== 'undefined' ? createPortal(content, document.body) : content
}

/* ── Done card ─────────────────────────────────────── */
function DoneCard({ collected, lang, waConfigured, onOpenGetPDF, onDownloadDirect }: {
  collected: Record<string, any>; lang: Lang
  waConfigured?: boolean; onOpenGetPDF?: () => void; onDownloadDirect?: () => void
}) {
  const [downloading, setDownloading] = useState(false)
  const entries = Object.entries(collected).filter(([, v]) => v && v !== 'N/A').slice(0, 5)
  const isHi = lang === 'hi'

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      className="mx-1 rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.06)',
        border: `1px solid ${C.borderHov}`,
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-4 flex items-center gap-3.5">
        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: C.saffronAlpha, border: `1.5px solid ${C.saffronBorder}` }}>
          <CheckCircle size={18} style={{ color: C.saffronLight }} />
        </div>
        <div>
          <p className="font-display text-lg font-semibold" style={{ color: C.cream }}>
            {isHi ? 'बधाई हो! 🎉' : 'All done! 🎉'}
          </p>
          <p className="text-[13px] font-body mt-0.5" style={{ color: C.creamMuted }}>
            {isHi ? 'आपका फ़ॉर्म तैयार है।' : 'Your form is ready.'}
          </p>
        </div>
      </div>

      {/* Summary */}
      {entries.length > 0 && (
        <div className="mx-4 mb-4 rounded-xl p-4 space-y-2.5"
          style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          {entries.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 text-xs font-body">
              <span className="capitalize" style={{ color: C.creamFaint }}>{k.replace(/_/g, ' ')}</span>
              <span className="text-right truncate max-w-[55%]" style={{ color: C.cream }}>
                {typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="px-4 pb-5 flex flex-col gap-2.5">
        <button
          onClick={() => waConfigured
            ? onOpenGetPDF?.()
            : (setDownloading(true), Promise.resolve(onDownloadDirect?.()).finally(() => setDownloading(false)))
          }
          disabled={downloading}
          className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-semibold text-sm text-white transition-all"
          style={{
            background: waConfigured ? '#25D366' : C.saffron,
            boxShadow: waConfigured ? '0 2px 20px rgba(37,211,102,0.22)' : `0 2px 20px rgba(232,135,58,0.28)`,
          }}
        >
          {downloading ? <Loader2 size={16} className="animate-spin" />
            : waConfigured ? <MessageCircle size={16} /> : <Download size={16} />}
          {waConfigured
            ? (isHi ? 'WhatsApp पर भेजें' : 'Send to WhatsApp')
            : (isHi ? 'भरा हुआ फ़ॉर्म डाउनलोड करें' : 'Download filled form')}
        </button>
        {waConfigured && (
          <button
            onClick={() => { setDownloading(true); Promise.resolve(onDownloadDirect?.()).finally(() => setDownloading(false)) }}
            className="w-full py-2.5 rounded-xl text-sm font-body transition-colors"
            style={{ color: C.creamFaint, border: `1px solid ${C.border}` }}
          >
            {isHi ? 'या डिवाइस पर डाउनलोड करें' : 'Or download to device'}
          </button>
        )}
      </div>
    </motion.div>
  )
}

/* ══════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════ */
export default function ChatPage() {
  const { formId }      = useParams() as { formId: string }
  const searchParams    = useSearchParams()
  const incomingSession = searchParams.get('session')

  const [sessionId, setSessionId]     = useState<string | null>(incomingSession)
  const [formTitle, setFormTitle]     = useState('')
  const [totalFields, setTotalFields] = useState(0)
  const [msgs, setMsgs]               = useState<Message[]>([])
  const [input, setInput]             = useState('')
  const [sending, setSending]         = useState(false)
  const [uploading, setUploading]     = useState(false)
  const [progress, setProgress]       = useState(0)
  const [filledCount, setFilledCount] = useState(0)
  const [collected, setCollected]     = useState<Record<string, any>>({})
  const [done, setDone]               = useState(false)
  const [lang, setLang]               = useState<Lang>('en')
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [showFilePicker, setShowFilePicker] = useState(false)
  const [partialDl, setPartialDl]     = useState(false)
  const [waConfigured, setWaConfigured] = useState(false)
  const [waOpen, setWaOpen]           = useState(false)
  const [getPDFOpen, setGetPDFOpen]   = useState(false)
  const [getPDFPartial, setGetPDFPartial] = useState(false)
  const [ttsAvailable, setTtsAvailable] = useState(false)
  const [ttsEnabled, setTtsEnabled]   = useState(false)

  const scrollRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)
  const sessionRef = useRef<string | null>(incomingSession)
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, sending])

  useEffect(() => { whatsappAPI.isConfigured().then(setWaConfigured) }, [])
  useEffect(() => {
    audioAPI.status().then(s => setTtsAvailable(s.tts_available)).catch(() => {})
  }, [])

  useEffect(() => {
    async function init() {
      try {
        if (incomingSession) {
          const r = await sessionAPI.resume(incomingSession)
          setSessionId(r.session_id); sessionRef.current = r.session_id
          setFormTitle(r.form_title); setTotalFields(r.total_fields)
          setProgress(r.progress_pct); setCollected(r.collected)
          setFilledCount(r.filled_fields); setLang(r.lang as Lang)
          const history: Message[] = r.chat_history.map((m: any, i: number) => ({
            id: `resume-${i}`, role: m.role === 'assistant' ? 'bot' : 'user',
            text: m.content, ts: new Date(),
          }))
          setMsgs([...history, {
            id: 'resume-notice', role: 'bot', ts: new Date(),
            text: `Welcome back! 👋 You've filled *${r.filled_fields} of ${r.total_fields}* fields. Let's continue.`,
          }])
        } else {
          const s = await sessionAPI.create(formId)
          setSessionId(s.session_id); sessionRef.current = s.session_id
          setFormTitle(s.form_title); setTotalFields(s.field_count)
          const { message } = await chatAPI.opening(s.session_id, 'en')
          setTimeout(() => setMsgs([{ id: 'open', role: 'bot', text: message, ts: new Date() }]), 400)
        }
      } catch { setError('This link seems invalid or has expired.') }
      finally { setLoading(false) }
    }
    init()
  }, [formId, incomingSession])

  const switchLang = (l: Lang) => {
    setLang(l)
    if (msgs.length <= 1) setMsgs([{ id: 'open', role: 'bot', text: OPENERS[l](formTitle), ts: new Date() }])
  }

  const send = async (text: string) => {
    const sid = sessionRef.current
    if (!text.trim() || !sid || sending || done) return
    setMsgs(p => [...p, { id: Date.now().toString(), role: 'user', text: text.trim(), ts: new Date() }])
    setInput(''); setSending(true)
    try {
      const res: ChatResponse = await chatAPI.send(sid, text.trim(), lang)
      if (res.lang && res.lang !== lang) setLang(res.lang as Lang)
      setMsgs(p => [...p, { id: (Date.now()+1).toString(), role: 'bot', text: res.reply, ts: new Date() }])
      setProgress(res.progress); setCollected(res.collected)
      setFilledCount(Object.values(res.collected).filter(v => v && v !== 'N/A').length)
      if (res.is_complete) setDone(true)
      if (ttsEnabled && ttsAvailable && res.reply) playTts(res.reply)
    } catch {
      setMsgs(p => [...p, {
        id: Date.now().toString(), role: 'bot', ts: new Date(),
        text: lang === 'hi' ? 'माफ़ करें, कुछ गड़बड़ हो गई। फिर से कोशिश करें?' : 'Sorry, something went wrong. Try again?',
      }])
    }
    setSending(false)
    inputRef.current?.focus()
  }

  const handleFileUpload = async (file: File, fieldName: string) => {
    const sid = sessionRef.current; if (!sid) return
    setUploading(true)
    const objectUrl = URL.createObjectURL(file)
    const userMsg: Message = {
      id: Date.now().toString(), role: 'user', ts: new Date(),
      text: `Uploading ${file.name}…`,
      attachment: { name: file.name, url: objectUrl, field_name: fieldName },
    }
    setMsgs(p => [...p, userMsg])
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch(
        `${BASE}/api/sessions/${sid}/upload-file?field_name=${encodeURIComponent(fieldName)}`,
        { method: 'POST', body: fd }
      )
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setMsgs(p => p.map(m => m.id === userMsg.id
        ? { ...m, text: file.name, attachment: { ...m.attachment!, extracted: data.extracted_value } }
        : m
      ))
      setCollected(data.collected); setProgress(data.progress)
      setFilledCount(Object.values(data.collected as any).filter((v: any) => v && v !== 'N/A').length)
      const botReply = data.extracted_value && !['SIGNATURE_UPLOADED', 'PHOTO_UPLOADED'].includes(data.extracted_value)
        ? (lang === 'hi' ? `✓ मिला: ${data.extracted_value}` : `✓ Got it! Extracted: ${data.extracted_value}`)
        : (lang === 'hi' ? '✓ फ़ाइल अपलोड हो गई।' : '✓ File uploaded successfully.')
      setMsgs(p => [...p, {
        id: (Date.now()+1).toString(), role: 'bot', ts: new Date(),
        text: botReply,
      }])
      if (ttsEnabled && ttsAvailable) playTts(botReply)
      toast.success('File uploaded!')
    } catch {
      toast.error('Upload failed — please try again')
      setMsgs(p => p.filter(m => m.id !== userMsg.id))
    }
    finally { setUploading(false) }
  }

  const handlePartialDownload = async () => {
    const sid = sessionRef.current; if (!sid) return
    setPartialDl(true)
    try { const b = await fillAPI.fill(sid, true); fillAPI.download(b, 'vaarta-partial.pdf'); toast.success('Downloaded!') }
    catch { toast.error('Download failed') } finally { setPartialDl(false) }
  }

  const handleDownloadDirect = async () => {
    if (!sessionId) return
    try { const b = await fillAPI.fill(sessionId, false); fillAPI.download(b, 'vaarta-filled.pdf'); toast.success('Downloaded!') }
    catch { toast.error('Download failed') }
  }

  const handleVoice = useCallback((t: string) => { setInput(t); inputRef.current?.focus() }, [])
  const { listening, supported, toggle } = useVoice(handleVoice, lang)

  const playTts = useCallback(async (text: string) => {
    if (!ttsEnabled || !ttsAvailable || !text?.trim()) return
    const plain = text.replace(/\*([^*]*)\*/g, '$1').replace(/\n/g, ' ').trim()
    if (!plain) return
    try {
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause()
        ttsAudioRef.current = null
      }
      const blob = await audioAPI.synthesize(plain, lang)
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      ttsAudioRef.current = audio
      audio.onended = () => {
        URL.revokeObjectURL(url)
        ttsAudioRef.current = null
      }
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        ttsAudioRef.current = null
      }
      await audio.play()
    } catch {
      toast.error(lang === 'hi' ? 'आवाज़ चालू नहीं हो पाई' : 'Could not play voice')
    }
  }, [ttsEnabled, ttsAvailable, lang])

  const resumeLink = sessionId
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/chat/${formId}?session=${sessionId}`
    : ''

  /* ── Loading ── */
  if (loading) return (
    <div className="min-h-screen bg-teal-woven flex items-center justify-center">
      <div className="text-center space-y-5">
        <motion.div
          animate={{ scale: [1, 1.07, 1] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
          style={{ background: C.saffronAlpha, border: `1.5px solid ${C.saffronBorder}` }}
        >
          <MessageSquareText size={20} style={{ color: C.saffron }} />
        </motion.div>
        <div>
          <p className="font-display font-medium" style={{ color: C.cream }}>
            {incomingSession ? 'Picking up where you left off…' : 'Preparing your form…'}
          </p>
          <p className="text-xs font-body mt-1" style={{ color: C.creamFaint }}>Just a moment</p>
        </div>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-teal-woven flex items-center justify-center px-6">
      <div className="text-center">
        <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{ background: 'rgba(176,58,46,0.18)', border: '1.5px solid rgba(248,113,113,0.28)' }}>
          <X size={22} style={{ color: '#f87171' }} />
        </div>
        <p className="font-display text-xl font-semibold mb-2" style={{ color: C.cream }}>Link not found</p>
        <p className="text-sm font-body" style={{ color: C.creamMuted }}>{error}</p>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col bg-teal-woven" style={{ height: '100dvh', maxHeight: '100dvh' }}>

      {/* ══ HEADER ════════════════════════════════════════ */}
      <div className="flex-shrink-0"
        style={{
          paddingTop: 'max(env(safe-area-inset-top), 12px)',
          paddingBottom: '12px',
          paddingLeft: '16px',
          paddingRight: '16px',
          borderBottom: `1px solid ${C.border}`,
          background: C.headerBg,
          backdropFilter: 'blur(20px)',
        }}>
        <div className="max-w-xl mx-auto">
          <div className="flex items-center justify-between mb-3">

            {/* Brand */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: C.saffronAlpha, border: `1.5px solid ${C.saffronBorder}` }}>
                <MessageSquareText size={14} style={{ color: C.saffron }} />
              </div>
              <div className="min-w-0">
                <p className="font-display font-semibold text-sm leading-none" style={{ color: C.cream }}>Vaarta</p>
                <p className="text-[10px] font-body mt-0.5 truncate max-w-[150px] sm:max-w-[220px]"
                  style={{ color: C.creamFaint }}>{formTitle}</p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {filledCount > 0 && (
                <button
                  onClick={() => {
                    if (waConfigured) { setGetPDFOpen(true); setGetPDFPartial(!done) }
                    else { if (done) handleDownloadDirect(); else handlePartialDownload() }
                  }}
                  disabled={partialDl}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-body font-medium transition-all"
                  style={done
                    ? { background: C.saffronAlpha, border: `1px solid ${C.saffronBorder}`, color: C.saffron }
                    : { background: C.surface, border: `1px solid ${C.border}`, color: C.creamMuted }
                  }
                >
                  {waConfigured ? <MessageCircle size={11} /> : <Download size={11} />}
                  <span className="hidden sm:inline">
                    {done ? (lang === 'hi' ? 'PDF लें' : 'Get PDF') : (lang === 'hi' ? 'आंशिक PDF' : 'Partial')}
                  </span>
                </button>
              )}

              {/* Language toggle */}
              <div className="flex rounded-lg p-0.5"
                style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                {(['en', 'hi'] as Lang[]).map(l => (
                  <button key={l} onClick={() => switchLang(l)}
                    className={clsx('px-2.5 py-1 rounded-md text-xs font-body font-semibold transition-all')}
                    style={lang === l
                      ? { background: C.saffron, color: 'white' }
                      : { color: C.creamFaint }
                    }>
                    {l === 'en' ? 'EN' : 'हि'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: C.surface }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: progress >= 100 ? C.saffronLight : C.saffron }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.65, ease: 'easeOut' }}
              />
            </div>
            <span className="text-[11px] font-body flex-shrink-0" style={{ color: C.creamFaint }}>
              {lang === 'hi' ? `${filledCount} / ${totalFields}` : `${filledCount} of ${totalFields}`}
            </span>
          </div>
        </div>
      </div>

      {/* ══ MESSAGES ══════════════════════════════════════ */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5"
        style={{ overscrollBehavior: 'contain' }}>
        <div className="max-w-xl mx-auto space-y-4">
          <AnimatePresence initial={false}>
            {msgs.map(m => <Bubble key={m.id} msg={m} />)}
            {(sending || uploading) && <Typing key="typing" />}
          </AnimatePresence>

          {done && (
            <>
              <DoneCard
                collected={collected} lang={lang}
                waConfigured={waConfigured}
                onOpenGetPDF={() => { setGetPDFOpen(true); setGetPDFPartial(false) }}
                onDownloadDirect={handleDownloadDirect}
              />
              <WhatsAppModal
                isOpen={waOpen} onClose={() => setWaOpen(false)}
                sessionId={sessionId!} formTitle={formTitle} lang={lang} alreadyFilled={true}
              />
            </>
          )}
        </div>
      </div>

      {/* Get PDF modal */}
      {sessionId && (
        <GetPDFModal
          isOpen={getPDFOpen} onClose={() => setGetPDFOpen(false)}
          sessionId={sessionId} lang={lang} isPartial={getPDFPartial}
          onDownloadInstead={() => {
            setGetPDFOpen(false)
            if (getPDFPartial) handlePartialDownload(); else handleDownloadDirect()
          }}
        />
      )}

      {/* ══ INPUT BAR ═════════════════════════════════════ */}
      {!done && (
        <div className="flex-shrink-0 px-4 pt-3"
          style={{
            paddingBottom: 'max(env(safe-area-inset-bottom), 14px)',
            borderTop: `1px solid ${C.border}`,
            background: C.inputBg,
            backdropFilter: 'blur(20px)',
          }}>
          <div className="max-w-xl mx-auto">

            {/* Listening indicator */}
            <AnimatePresence>
              {listening && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="flex items-center justify-center gap-2 mb-2.5">
                  <span className="inline-flex gap-1 items-end">
                    {[0, 1, 2].map(i => (
                      <span key={i} className={`w-0.5 rounded-full bg-saffron animate-dot${i + 1}`}
                        style={{ height: i === 1 ? '14px' : '8px' }} />
                    ))}
                  </span>
                  <span className="text-[11px] font-body" style={{ color: C.saffronLight }}>
                    {lang === 'hi' ? 'सुन रहा हूँ…' : 'Listening…'}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-end gap-2">
              {/* Attach */}
              <div className="relative flex-shrink-0">
                <button
                  onClick={() => setShowFilePicker(p => !p)}
                  className="w-11 h-11 rounded-xl flex items-center justify-center transition-all"
                  style={showFilePicker
                    ? { background: C.saffron, color: 'white' }
                    : { background: C.surface, border: `1px solid ${C.border}`, color: C.creamMuted }
                  }
                >
                  <Paperclip size={16} />
                </button>
                <AnimatePresence>
                  {showFilePicker && (
                    <FilePicker onFile={handleFileUpload} onClose={() => setShowFilePicker(false)} lang={lang} />
                  )}
                </AnimatePresence>
              </div>

              {/* Voice */}
              {supported && (
                <button onClick={toggle}
                  className={clsx('flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all', listening && 'animate-pulse')}
                  style={listening
                    ? { background: C.saffron, color: 'white', boxShadow: `0 0 0 4px ${C.saffronAlpha}` }
                    : { background: C.surface, border: `1px solid ${C.border}`, color: C.creamMuted }
                  }>
                  {listening ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
              )}

              {/* TTS: read aloud when enabled */}
              {ttsAvailable && (
                <button
                  type="button"
                  onClick={() => setTtsEnabled(e => !e)}
                  title={ttsEnabled ? (lang === 'hi' ? 'जोर से पढ़ना बंद करें' : 'Turn off read aloud') : (lang === 'hi' ? 'जोर से पढ़ें' : 'Read aloud')}
                  className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all"
                  style={ttsEnabled
                    ? { background: C.saffronAlpha, border: `1px solid ${C.saffronBorder}`, color: C.saffron }
                    : { background: C.surface, border: `1px solid ${C.border}`, color: C.creamMuted }
                  }
                >
                  <Volume2 size={16} />
                </button>
              )}

              {/* Text input */}
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send(input))}
                placeholder={lang === 'hi' ? 'अपना जवाब टाइप करें…' : 'Type your answer…'}
                disabled={sending || uploading}
                className="flex-1 rounded-xl px-4 py-3 text-sm font-body focus:outline-none transition-all"
                style={{
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  color: C.cream,
                  minHeight: '44px',
                }}
                onFocus={e => {
                  e.currentTarget.style.background = C.surfaceHov
                  e.currentTarget.style.border = `1px solid ${C.saffronBorder}`
                }}
                onBlur={e => {
                  e.currentTarget.style.background = C.surface
                  e.currentTarget.style.border = `1px solid ${C.border}`
                }}
              />

              {/* Send */}
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || sending || uploading}
                className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all active:scale-95"
                style={input.trim() && !sending && !uploading
                  ? { background: C.saffron, color: 'white', boxShadow: `0 2px 16px rgba(232,135,58,0.3)` }
                  : { background: C.surface, color: C.creamFaint, border: `1px solid ${C.border}`, cursor: 'not-allowed' }
                }
              >
                <Send size={15} />
              </button>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between mt-2 px-0.5">
              {resumeLink ? (
                <button
                  onClick={() => { navigator.clipboard.writeText(resumeLink); toast.success('Link copied!') }}
                  className="text-[10px] font-body underline underline-offset-2"
                  style={{ color: C.creamFaint }}
                >
                  {lang === 'hi' ? 'बाद में जारी रखें' : 'Continue later'}
                </button>
              ) : <span />}
              <p className="text-[10px] font-body" style={{ color: 'rgba(250,246,239,0.14)' }}>
                Vaarta · Secure
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
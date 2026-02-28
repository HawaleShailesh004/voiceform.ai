'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  Send, Mic, MicOff, CheckCircle, ChevronDown,
  MessageSquareText, Paperclip, X, FileText, Image as ImageIcon,
  Download, MessageCircle, Loader2
} from 'lucide-react'
import { sessionAPI, chatAPI, fillAPI, whatsappAPI, type ChatResponse } from '@/lib/api'
import WhatsAppModal from '@/components/shared/WhatsAppModal'
import clsx from 'clsx'

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

/* ── Types ─────────────────────────────────────────── */
interface Message {
  id: string
  role: 'bot' | 'user'
  text: string
  ts: Date
  attachment?: { name: string; url?: string; extracted?: string; field_name?: string }
}

type Lang = 'en' | 'hi'

/* ── Opening messages ──────────────────────────────── */
const OPENERS: Record<Lang, (title: string) => string> = {
  en: (t) => `Hi there! 👋 I'm here to help you fill out the *${t}* — don't worry, I'll make it easy. We'll just have a quick chat and I'll take care of everything.\n\nShall we start?`,
  hi: (t) => `नमस्ते! 🙏 मैं आपकी *${t}* भरने में मदद करने के लिए यहाँ हूँ — चिंता मत कीजिए, बस कुछ आसान सवाल पूछूँगा।\n\nक्या हम शुरू करें?`,
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
    rec.onerror  = () => setListening(false)
    rec.onend    = () => setListening(false)
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
  const isImage = att.url && (att.name.match(/\.(png|jpg|jpeg|webp)$/i))
  return (
    <div className="mt-1.5 bg-white/8 rounded-xl border border-white/10 overflow-hidden max-w-[200px]">
      {isImage && att.url ? (
        <img src={att.url} alt={att.name} className="w-full max-h-32 object-cover" />
      ) : (
        <div className="flex items-center gap-2 px-3 py-2">
          <FileText size={14} className="text-saffron/80 flex-shrink-0" />
          <span className="text-cream/70 text-xs truncate">{att.name}</span>
        </div>
      )}
      {att.extracted && att.extracted !== 'SIGNATURE_UPLOADED' && att.extracted !== 'PHOTO_UPLOADED' && (
        <div className="px-3 py-1.5 border-t border-white/8 bg-saffron/8">
          <p className="text-[10px] text-saffron/80">
            Extracted: <span className="font-mono font-semibold">{att.extracted}</span>
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
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      className={clsx('flex gap-3', !isBot && 'flex-row-reverse')}
    >
      {isBot && (
        <div className="w-8 h-8 rounded-full bg-saffron/15 border border-saffron/25 flex items-center justify-center flex-shrink-0 mt-auto mb-1">
          <MessageSquareText size={14} className="text-saffron" />
        </div>
      )}
      <div className={clsx('flex flex-col gap-1', isBot ? 'items-start' : 'items-end', 'max-w-[80%]')}>
        <div
          className={clsx(
            'px-4 py-3 rounded-2xl text-sm font-body leading-relaxed',
            isBot
              ? 'bg-white/12 text-cream rounded-tl-sm backdrop-blur-sm border border-white/8'
              : 'bg-saffron text-white rounded-tr-sm shadow-[0_2px_12px_rgba(232,135,58,0.35)]'
          )}
          dangerouslySetInnerHTML={{ __html: rendered }}
        />
        {msg.attachment && <AttachmentBubble att={msg.attachment} />}
        <span className="text-[10px] text-cream/30 font-body px-1">
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex gap-3 items-end"
    >
      <div className="w-8 h-8 rounded-full bg-saffron/15 border border-saffron/25 flex items-center justify-center flex-shrink-0">
        <MessageSquareText size={14} className="text-saffron" />
      </div>
      <div className="bg-white/12 backdrop-blur-sm border border-white/8 rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1.5 items-center">
        <div className="w-1.5 h-1.5 rounded-full bg-cream/60 animate-dot1" />
        <div className="w-1.5 h-1.5 rounded-full bg-cream/60 animate-dot2" />
        <div className="w-1.5 h-1.5 rounded-full bg-cream/60 animate-dot3" />
      </div>
    </motion.div>
  )
}

/* ── File picker popup ─────────────────────────────── */
function FilePicker({
  onFile,
  onClose,
  lang,
}: {
  onFile: (file: File, fieldName: string) => void
  onClose: () => void
  lang: Lang
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fieldName, setFieldName] = useState('')

  const labels = lang === 'hi'
    ? { title: 'दस्तावेज़ अपलोड करें', hint: 'कौन सा फ़ील्ड है? (जैसे: aadhaar_number)', upload: 'फ़ाइल चुनें', or: 'या' }
    : { title: 'Upload a document', hint: 'Field name (e.g. aadhaar_number)', upload: 'Choose file', or: 'or' }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f && fieldName.trim()) {
      onFile(f, fieldName.trim())
      onClose()
    } else if (f && !fieldName.trim()) {
      toast.error('Please enter the field name first')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      className="absolute bottom-full left-0 mb-2 w-72 bg-teal/95 backdrop-blur-xl border border-white/15 rounded-2xl p-4 shadow-2xl z-50"
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-cream text-sm font-semibold">{labels.title}</p>
        <button onClick={onClose} className="text-cream/40 hover:text-cream transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Quick field buttons */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {['aadhaar_number', 'pan_number', 'signature', 'photo', 'document'].map(f => (
          <button
            key={f}
            onClick={() => setFieldName(f)}
            className={clsx(
              'px-2 py-1 rounded-lg text-[10px] font-mono border transition-all',
              fieldName === f
                ? 'bg-saffron text-white border-saffron'
                : 'bg-white/8 text-cream/60 border-white/12 hover:border-white/25 hover:text-cream'
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={fieldName}
        onChange={e => setFieldName(e.target.value)}
        placeholder={labels.hint}
        className="w-full bg-white/8 border border-white/12 rounded-lg px-3 py-2 text-cream text-xs font-mono placeholder:text-cream/30 focus:outline-none focus:border-saffron/50 mb-3"
      />

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={!fieldName.trim()}
        className={clsx(
          'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all',
          fieldName.trim()
            ? 'bg-saffron text-white hover:bg-saffron/90'
            : 'bg-white/8 text-cream/30 cursor-not-allowed'
        )}
      >
        <ImageIcon size={14} />
        {labels.upload}
      </button>

      <p className="text-cream/30 text-[10px] text-center mt-2">
        PDF, PNG, JPG, WEBP · max 10 MB
      </p>
    </motion.div>
  )
}

/* ── Get PDF popup (mobile no → send via WhatsApp or download) ── */
function GetPDFModal({
  isOpen,
  onClose,
  sessionId,
  lang,
  isPartial,
  onSent,
  onDownloadInstead,
}: {
  isOpen: boolean
  onClose: () => void
  sessionId: string
  lang: Lang
  isPartial?: boolean
  onSent?: () => void
  onDownloadInstead?: () => void
}) {
  const [phone, setPhone] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const isHindi = lang === 'hi'

  const handleGetPDF = async () => {
    const digits = phone.replace(/\D/g, '')
    const clean = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits
    if (!/^[6-9]\d{9}$/.test(clean)) {
      setError(isHindi ? 'कृपया 10 अंकों का सही मोबाइल नंबर डालें' : 'Please enter a valid 10-digit Indian mobile number')
      return
    }
    setError('')
    setSending(true)
    try {
      await fillAPI.fill(sessionId, isPartial ?? false)
      const res = await whatsappAPI.send(sessionId, clean, lang)
      toast.success(res.status === 'sent' ? (isHindi ? 'भेज दिया! ✅' : 'Sent! ✅') : (isHindi ? 'नंबर सेव। जल्द भेजा जाएगा।' : 'Number saved. Will be sent shortly.'))
      onSent?.()
      onClose()
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message || 'Something went wrong')
    } finally {
      setSending(false)
    }
  }

  const handleDownloadInstead = () => {
    onClose()
    setPhone('')
    setError('')
    onDownloadInstead?.()
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
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="fixed left-0 right-0 bottom-0 z-[101] max-h-[85vh] overflow-auto p-4 pt-0 sm:left-1/2 sm:right-auto sm:bottom-auto sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-sm sm:max-h-none sm:p-4"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
      >
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-teal/10 mx-auto max-w-sm">
          <div className="px-4 py-3 sm:px-5 sm:py-4 border-b border-teal/8 flex items-center justify-between gap-2 min-h-[52px]" style={{ backgroundColor: '#25D366' }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <MessageCircle size={22} className="text-white flex-shrink-0" />
              <span className="font-body font-semibold text-white text-sm sm:text-base truncate">
                {isHindi ? 'किस नंबर पर भेजें?' : 'Send to which number?'}
              </span>
            </div>
            <button type="button" onClick={onClose} className="flex-shrink-0 text-white/90 hover:text-white p-2 -m-2 touch-manipulation" aria-label="Close">
              <X size={20} />
            </button>
          </div>
          <div className="p-4 sm:p-5">
            <p className="text-ink-muted text-sm font-body mb-4">
              {isHindi ? 'वह नंबर डालें जिस पर WhatsApp पर मैसेज भेजना है। (फ़ॉर्म का नंबर नहीं लिया जाता।)' : 'Enter the number to receive the message on WhatsApp. (We don’t use the number from the form.)'}
            </p>
            <div className="flex items-center gap-2 rounded-xl border border-teal/15 bg-cream/40 px-3 py-3 mb-3 min-h-[48px]">
              <span className="text-ink-faint text-sm font-mono">+91</span>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                value={phone}
                onChange={e => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setError('') }}
                placeholder="9876543210"
                className="flex-1 bg-transparent text-ink font-body text-base outline-none placeholder:text-ink-faint min-w-0"
                aria-label={isHindi ? 'मोबाइल नंबर' : 'Mobile number'}
              />
            </div>
            {error && <p className="text-error text-xs font-body mb-3">{error}</p>}
            <button
              type="button"
              onClick={handleGetPDF}
              disabled={sending || phone.replace(/\D/g, '').length < 10}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white font-semibold text-sm disabled:opacity-50 min-h-[48px] touch-manipulation"
              style={{ backgroundColor: '#25D366' }}
            >
              {sending ? <Loader2 size={20} className="animate-spin" /> : <Send size={18} />}
              {sending ? (isHindi ? 'भेज रहे हैं…' : 'Sending…') : (isHindi ? 'भेजें' : 'Send')}
            </button>
            <button
              type="button"
              onClick={handleDownloadInstead}
              className="w-full mt-3 py-3 text-ink-muted hover:text-teal text-sm font-body transition-colors touch-manipulation min-h-[44px]"
            >
              {isHindi ? 'डाउनलोड करें (डिवाइस पर)' : 'Download to device instead'}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
  return typeof document !== 'undefined' ? createPortal(content, document.body) : content
}

/* ── Completion card ───────────────────────────────── */
function DoneCard({
  collected,
  sessionId,
  lang,
  waConfigured,
  onOpenWhatsApp,
  onOpenGetPDF,
  onDownloadDirect,
}: {
  collected: Record<string, any>
  sessionId: string
  lang: Lang
  waConfigured?: boolean
  onOpenWhatsApp?: () => void
  onOpenGetPDF?: () => void
  onDownloadDirect?: () => void
}) {
  const [downloading, setDownloading] = useState(false)

  const entries = Object.entries(collected).filter(([, v]) => v && v !== 'N/A').slice(0, 6)
  const t = lang === 'hi'
    ? { title: 'बधाई हो! 🎉', sub: 'आपका फ़ॉर्म भर गया है।', dl: 'भरा हुआ फ़ॉर्म डाउनलोड करें' }
    : { title: 'All done! 🎉', sub: 'Your form is ready.', dl: 'Download filled form' }

  const handleDownloadClick = () => {
    console.log('[Vaarta] DoneCard Download clicked', { waConfigured, hasOnOpenGetPDF: !!onOpenGetPDF })
    if (waConfigured && onOpenGetPDF) {
      console.log('[Vaarta] Opening Get PDF modal from DoneCard')
      onOpenGetPDF()
    } else {
      console.log('[Vaarta] Direct download from DoneCard')
      setDownloading(true)
      Promise.resolve(onDownloadDirect?.()).finally(() => setDownloading(false))
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-5 mx-2"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-saffron/20 border border-saffron/30 flex items-center justify-center">
          <CheckCircle size={18} className="text-saffron" />
        </div>
        <div>
          <p className="font-display text-lg text-cream font-semibold">{t.title}</p>
          <p className="text-cream/60 text-xs font-body">{t.sub}</p>
        </div>
      </div>

      {entries.length > 0 && (
        <div className="bg-white/6 rounded-xl p-4 mb-4 space-y-2">
          {entries.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 text-xs font-body">
              <span className="text-cream/50 capitalize">{k.replace(/_/g, ' ')}</span>
              <span className="text-cream/80 text-right truncate max-w-[60%]">
                {typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        {waConfigured && onOpenWhatsApp && (
          <button
            type="button"
            onClick={onOpenWhatsApp}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold"
            style={{ backgroundColor: '#25D366' }}
          >
            <MessageCircle size={16} />
            Get PDF on WhatsApp
          </button>
        )}
        <button
          onClick={handleDownloadClick}
          disabled={downloading}
          className="btn-primary flex-1 justify-center"
        >
          {downloading
            ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <ChevronDown size={14} />
          }
          {t.dl}
        </button>
      </div>
    </motion.div>
  )
}

/* ── Main page ─────────────────────────────────────── */
export default function ChatPage() {
  const { formId }     = useParams() as { formId: string }
  const searchParams   = useSearchParams()
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
  const [waOpen, setWaOpen]           = useState(false)
  const [waConfigured, setWaConfigured] = useState(false)
  const [getPDFModalOpen, setGetPDFModalOpen] = useState(false)
  const [getPDFModalPartial, setGetPDFModalPartial] = useState(false)

  const scrollRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)
  const sessionRef = useRef<string | null>(incomingSession)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, sending])

  useEffect(() => {
    whatsappAPI.isConfigured().then((configured) => {
      console.log('[Vaarta] WhatsApp configured?', configured)
      setWaConfigured(configured)
    })
  }, [])

  // Init: resume or create
  useEffect(() => {
    async function init() {
      try {
        if (incomingSession) {
          // Resume existing session
          const resumed = await sessionAPI.resume(incomingSession)
          setSessionId(resumed.session_id)
          sessionRef.current = resumed.session_id
          setFormTitle(resumed.form_title)
          setTotalFields(resumed.total_fields)
          setProgress(resumed.progress_pct)
          setCollected(resumed.collected)
          setFilledCount(resumed.filled_fields)
          setLang(resumed.lang as Lang)

          const history: Message[] = resumed.chat_history.map((m, i) => ({
            id:   `resume-${i}`,
            role: m.role === 'assistant' ? 'bot' : 'user',
            text: m.content,
            ts:   new Date(),
          }))
          const resumeMsg: Message = {
            id:   'resume-notice',
            role: 'bot',
            text: `Welcome back! 👋 You've filled *${resumed.filled_fields} of ${resumed.total_fields}* fields. Let's pick up where we left off.`,
            ts:   new Date(),
          }
          setMsgs([...history, resumeMsg])
        } else {
          // Fresh session
          const s = await sessionAPI.create(formId)
          setSessionId(s.session_id)
          sessionRef.current = s.session_id
          setFormTitle(s.form_title)
          setTotalFields(s.field_count)

          const { message } = await chatAPI.opening(s.session_id, 'en')
          setTimeout(() => {
            setMsgs([{ id: 'open', role: 'bot', text: message, ts: new Date() }])
          }, 400)
        }
      } catch {
        setError('This link seems invalid or has expired.')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [formId, incomingSession])

  const switchLang = (l: Lang) => {
    setLang(l)
    if (msgs.length <= 1) {
      setMsgs([{ id: 'open', role: 'bot', text: OPENERS[l](formTitle), ts: new Date() }])
    }
  }

  const send = async (text: string) => {
    const sid = sessionRef.current
    if (!text.trim() || !sid || sending || done) return

    setMsgs(p => [...p, { id: Date.now().toString(), role: 'user', text: text.trim(), ts: new Date() }])
    setInput('')
    setSending(true)

    try {
      const res: ChatResponse = await chatAPI.send(sid, text.trim(), lang)
      if (res.lang && res.lang !== lang) setLang(res.lang as Lang)
      setMsgs(p => [...p, { id: (Date.now()+1).toString(), role: 'bot', text: res.reply, ts: new Date() }])
      setProgress(res.progress)
      setCollected(res.collected)
      setFilledCount(Object.values(res.collected).filter(v => v && v !== 'N/A').length)
      if (res.is_complete) setDone(true)
    } catch {
      setMsgs(p => [...p, {
        id: Date.now().toString(), role: 'bot',
        text: lang === 'hi' ? 'माफ़ करें, कुछ गड़बड़ हो गई। क्या आप फिर से कोशिश कर सकते हैं?' : 'Sorry, something went wrong. Could you try again?',
        ts: new Date(),
      }])
    }
    setSending(false)
    inputRef.current?.focus()
  }

  // File upload handler
  const handleFileUpload = async (file: File, fieldName: string) => {
    const sid = sessionRef.current
    if (!sid) return
    setUploading(true)

    // Optimistic message
    const objectUrl = URL.createObjectURL(file)
    const userMsg: Message = {
      id:   Date.now().toString(),
      role: 'user',
      text: `Uploading ${file.name}…`,
      ts:   new Date(),
      attachment: { name: file.name, url: objectUrl, field_name: fieldName },
    }
    setMsgs(p => [...p, userMsg])

    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(
        `${BASE}/api/sessions/${sid}/upload-file?field_name=${encodeURIComponent(fieldName)}`,
        { method: 'POST', body: fd }
      )
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()

      // Update the optimistic message with extracted value
      setMsgs(p => p.map(m =>
        m.id === userMsg.id
          ? { ...m, text: file.name, attachment: { ...m.attachment!, extracted: data.extracted_value } }
          : m
      ))

      setCollected(data.collected)
      setProgress(data.progress)
      setFilledCount(Object.values(data.collected as Record<string,any>).filter(v => v && v !== 'N/A').length)

      // Bot confirmation message
      const extractedText = data.extracted_value && !['SIGNATURE_UPLOADED','PHOTO_UPLOADED'].includes(data.extracted_value)
        ? (lang === 'hi' ? `✓ मिला: ${data.extracted_value}` : `✓ Got it! Extracted: ${data.extracted_value}`)
        : (lang === 'hi' ? '✓ फ़ाइल अपलोड हो गई।' : '✓ File uploaded successfully.')

      setMsgs(p => [...p, {
        id:   (Date.now()+1).toString(),
        role: 'bot',
        text: extractedText,
        ts:   new Date(),
      }])

      toast.success('File uploaded!')
    } catch (e) {
      toast.error('Upload failed — please try again')
      setMsgs(p => p.filter(m => m.id !== userMsg.id))
    } finally {
      setUploading(false)
    }
  }

  // Partial fill download
  const handlePartialDownload = async () => {
    const sid = sessionRef.current
    if (!sid) return
    setPartialDl(true)
    try {
      const blob = await fillAPI.fill(sid, true)
      fillAPI.download(blob, 'vaarta-partial.pdf')
      toast.success(lang === 'hi' ? 'आंशिक फ़ॉर्म डाउनलोड हो गया!' : 'Partial form downloaded!')
    } catch { toast.error('Download failed') }
    finally { setPartialDl(false) }
  }

  const handleDownloadDirect = async () => {
    if (!sessionId) return
    try {
      const blob = await fillAPI.fill(sessionId, false)
      fillAPI.download(blob, 'vaarta-filled.pdf')
      toast.success('Downloaded!')
    } catch { toast.error('Download failed') }
  }

  const handleVoice  = useCallback((t: string) => { setInput(t); inputRef.current?.focus() }, [])
  const { listening, supported, toggle } = useVoice(handleVoice, lang)

  const resumeLink = sessionId
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/chat/${formId}?session=${sessionId}`
    : ''

  /* ── Loading / error ── */
  if (loading) return (
    <div className="min-h-screen bg-teal-woven flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-saffron/15 border border-saffron/25 flex items-center justify-center mx-auto animate-[breathe_2s_ease-in-out_infinite]">
          <MessageSquareText size={18} className="text-saffron" />
        </div>
        <p className="text-cream/50 text-sm font-body">
          {incomingSession ? 'Resuming your session…' : 'Loading your form…'}
        </p>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-teal-woven flex items-center justify-center px-6">
      <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-10 max-w-sm w-full text-center">
        <p className="font-display text-xl text-cream mb-2">Link not found</p>
        <p className="text-cream/50 text-sm font-body">{error}</p>
      </div>
    </div>
  )

  const progressLabel = lang === 'hi' ? `${filledCount} में से ${totalFields}` : `${filledCount} of ${totalFields}`
  const inputPlaceholder = lang === 'hi' ? 'अपना जवाब टाइप करें…' : 'Type your answer…'

  return (
    <div className="min-h-screen bg-teal-woven flex flex-col" style={{ maxHeight: '100dvh' }}>

      {/* ── Header ── */}
      <div className="flex-shrink-0 px-4 pt-safe pt-4 pb-3 border-b border-white/8">
        <div className="max-w-xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-saffron/15 border border-saffron/25 flex items-center justify-center">
                <MessageSquareText size={15} className="text-saffron" />
              </div>
              <div>
                <p className="font-display text-cream font-semibold text-sm leading-none">Vaarta</p>
                <p className="text-cream/40 text-[10px] font-body leading-none mt-0.5 truncate max-w-44">{formTitle}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Get PDF — ask which number to send (works for partial or complete) */}
              {filledCount > 0 && (
                <button
                  onClick={() => {
                    console.log('[Vaarta] Get PDF clicked', { waConfigured, done, filledCount })
                    if (waConfigured) {
                      console.log('[Vaarta] Opening Get PDF modal (partial=', !done, ')')
                      setGetPDFModalOpen(true)
                      setGetPDFModalPartial(!done)
                    } else {
                      console.log('[Vaarta] WhatsApp not configured — direct download')
                      if (done) handleDownloadDirect()
                      else handlePartialDownload()
                    }
                  }}
                  disabled={partialDl}
                  title={done ? (lang === 'hi' ? 'PDF किस नंबर पर भेजें?' : 'Send PDF to which number?') : (lang === 'hi' ? 'आंशिक PDF किस नंबर पर भेजें?' : 'Send partial PDF to which number?')}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/8 border border-white/12 text-cream/60 hover:text-cream hover:border-white/25 transition-all text-[11px]"
                >
                  {waConfigured ? <MessageCircle size={11} /> : <Download size={11} />}
                  <span className="hidden sm:inline">
                    {done ? (lang === 'hi' ? 'PDF भेजें' : 'Get PDF') : (lang === 'hi' ? 'आंशिक PDF' : 'Partial PDF')}
                  </span>
                </button>
              )}

              {/* Language toggle */}
              <div className="flex items-center gap-1 bg-white/8 rounded-lg p-1 border border-white/8">
                {(['en', 'hi'] as Lang[]).map(l => (
                  <button
                    key={l}
                    onClick={() => switchLang(l)}
                    className={clsx(
                      'px-2.5 py-1 rounded text-xs font-body font-semibold transition-all',
                      lang === l ? 'bg-saffron text-white' : 'text-cream/50 hover:text-cream'
                    )}
                  >
                    {l === 'en' ? 'EN' : 'हि'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-white/8 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-saffron rounded-full"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
            <span className="text-cream/40 text-[11px] font-body flex-shrink-0">{progressLabel}</span>
          </div>
        </div>
      </div>

      {/* ── Messages ── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-5"
        style={{ overscrollBehavior: 'contain' }}
      >
        <div className="max-w-xl mx-auto space-y-4">
          <AnimatePresence initial={false}>
            {msgs.map(m => <Bubble key={m.id} msg={m} />)}
            {(sending || uploading) && <Typing key="typing" />}
          </AnimatePresence>
          {done && (
            <>
              <DoneCard
                collected={collected}
                sessionId={sessionId!}
                lang={lang}
                waConfigured={waConfigured}
                onOpenWhatsApp={() => setWaOpen(true)}
                onOpenGetPDF={() => { setGetPDFModalOpen(true); setGetPDFModalPartial(false) }}
                onDownloadDirect={handleDownloadDirect}
              />
              <WhatsAppModal
                isOpen={waOpen}
                onClose={() => setWaOpen(false)}
                sessionId={sessionId!}
                formTitle={formTitle}
                lang={lang}
                alreadyFilled={true}
              />
            </>
          )}
        </div>
      </div>

      {/* Get PDF modal — used for both partial (header) and complete (DoneCard) */}
      {sessionId && (
        <GetPDFModal
          isOpen={getPDFModalOpen}
          onClose={() => setGetPDFModalOpen(false)}
          sessionId={sessionId}
          lang={lang}
          isPartial={getPDFModalPartial}
          onDownloadInstead={() => {
            setGetPDFModalOpen(false)
            if (getPDFModalPartial) handlePartialDownload()
            else handleDownloadDirect()
          }}
        />
      )}

      {/* ── Input bar ── */}
      {!done && (
        <div className="flex-shrink-0 px-4 pb-safe pb-4 pt-3 border-t border-white/8 bg-teal/30 backdrop-blur-md">
          <div className="max-w-xl mx-auto flex items-end gap-2.5 relative">

            {/* File attach button */}
            <div className="relative">
              <button
                onClick={() => setShowFilePicker(p => !p)}
                className={clsx(
                  'flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200',
                  showFilePicker
                    ? 'bg-saffron text-white'
                    : 'bg-white/10 text-cream/60 hover:bg-white/16 hover:text-cream border border-white/10'
                )}
                title={lang === 'hi' ? 'दस्तावेज़ अपलोड करें' : 'Upload document'}
              >
                <Paperclip size={17} />
              </button>
              <AnimatePresence>
                {showFilePicker && (
                  <FilePicker
                    onFile={handleFileUpload}
                    onClose={() => setShowFilePicker(false)}
                    lang={lang}
                  />
                )}
              </AnimatePresence>
            </div>

            {/* Voice */}
            {supported && (
              <button
                onClick={toggle}
                className={clsx(
                  'flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200',
                  listening
                    ? 'bg-saffron text-white shadow-[0_0_0_4px_rgba(232,135,58,0.25)] animate-pulse'
                    : 'bg-white/10 text-cream/60 hover:bg-white/16 hover:text-cream border border-white/10'
                )}
              >
                {listening ? <MicOff size={17} /> : <Mic size={17} />}
              </button>
            )}

            {/* Text input */}
            <div className="flex-1 relative">
              {listening && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute -top-6 inset-x-0 text-center text-saffron/80 text-[11px] font-body"
                >
                  {lang === 'hi' ? 'सुन रहा हूँ…' : 'Listening…'}
                </motion.p>
              )}
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send(input))}
                placeholder={inputPlaceholder}
                disabled={sending || uploading}
                className="w-full bg-white/10 border border-white/12 rounded-xl px-4 py-3 text-cream text-sm font-body placeholder:text-cream/30 focus:outline-none focus:border-saffron/50 focus:bg-white/14 transition-all"
              />
            </div>

            {/* Send */}
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || sending || uploading}
              className={clsx(
                'flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200',
                input.trim() && !sending && !uploading
                  ? 'bg-saffron text-white hover:bg-saffron-light active:scale-95 shadow-[0_2px_12px_rgba(232,135,58,0.4)]'
                  : 'bg-white/6 text-cream/20 cursor-not-allowed border border-white/8'
              )}
            >
              <Send size={16} />
            </button>
          </div>

          <div className="max-w-xl mx-auto flex items-center justify-between mt-2 px-1">
            {resumeLink ? (
              <button
                onClick={() => { navigator.clipboard.writeText(resumeLink); toast.success('Link copied!') }}
                className="text-cream/25 text-[10px] underline font-body hover:text-cream/45 transition-colors"
              >
                {lang === 'hi' ? 'बाद में जारी रखें' : 'Save & continue later'}
              </button>
            ) : <span />}
            <p className="text-cream/20 text-[10px] font-body">
              Powered by Vaarta · Your data is secure
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { Send, Mic, MicOff, Globe, CheckCircle, ChevronDown, MessageSquareText } from 'lucide-react'
import { sessionAPI, chatAPI, fillAPI, type ChatResponse } from '@/lib/api'
import clsx from 'clsx'

/* ── Types ─────────────────────────────────────────── */
interface Message {
  id: string
  role: 'bot' | 'user'
  text: string
  ts: Date
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

/* ── Message bubble ────────────────────────────────── */
function Bubble({ msg, isLast }: { msg: Message; isLast: boolean }) {
  const isBot = msg.role === 'bot'
  // Render *bold* markdown
  const rendered = msg.text.replace(/\*([^*]+)\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>')

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      className={clsx('flex gap-3', !isBot && 'flex-row-reverse')}
    >
      {/* Avatar */}
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

/* ── Completion card ───────────────────────────────── */
function DoneCard({ collected, onDownload, lang }: { collected: Record<string,any>; onDownload: () => void; lang: Lang }) {
  const entries = Object.entries(collected).filter(([,v]) => v && v !== 'N/A').slice(0, 6)
  const t = lang === 'hi'
    ? { title: 'बधाई हो! 🎉', sub: 'आपका फ़ॉर्म भर गया है।', dl: 'भरा हुआ फ़ॉर्म डाउनलोड करें' }
    : { title: 'All done! 🎉', sub: 'Your form is ready.', dl: 'Download filled form' }

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
              <span className="text-cream/80 text-right">{typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)}</span>
            </div>
          ))}
        </div>
      )}

      <button onClick={onDownload} className="btn-primary w-full justify-center">
        <ChevronDown size={14} />
        {t.dl}
      </button>
    </motion.div>
  )
}

/* ── Main page ─────────────────────────────────────── */
export default function ChatPage() {
  const { formId } = useParams() as { formId: string }

  const [sessionId, setSessionId]   = useState<string|null>(null)
  const [formTitle, setFormTitle]   = useState('')
  const [totalFields, setTotalFields] = useState(0)
  const [msgs, setMsgs]             = useState<Message[]>([])
  const [input, setInput]           = useState('')
  const [sending, setSending]       = useState(false)
  const [progress, setProgress]     = useState(0)
  const [filled, setFilled]         = useState(0)
  const [collected, setCollected]   = useState<Record<string,any>>({})
  const [done, setDone]             = useState(false)
  const [lang, setLang]             = useState<Lang>('en')
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  // Auto scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, sending])

  // Init
  useEffect(() => {
    sessionAPI.create(formId)
      .then(s => {
        setSessionId(s.session_id)
        setFormTitle(s.form_title)
        setTotalFields(s.field_count)
        // Opening message
        setTimeout(() => {
          setMsgs([{ id: 'open', role: 'bot', text: OPENERS[lang](s.form_title), ts: new Date() }])
        }, 600)
      })
      .catch(() => setError('This link seems invalid or has expired.'))
      .finally(() => setLoading(false))
  }, [formId])

  // Update opener when language changes (before any user message)
  const switchLang = (l: Lang) => {
    setLang(l)
    if (msgs.length <= 1) {
      setMsgs([{ id: 'open', role: 'bot', text: OPENERS[l](formTitle), ts: new Date() }])
    }
  }

  const send = async (text: string) => {
    if (!text.trim() || !sessionId || sending || done) return
    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: text.trim(), ts: new Date() }
    setMsgs(p => [...p, userMsg])
    setInput('')
    setSending(true)

    try {
      const res: ChatResponse = await chatAPI.send(sessionId, text.trim(), lang)
      const botMsg: Message = { id: (Date.now()+1).toString(), role: 'bot', text: res.reply, ts: new Date() }
      setMsgs(p => [...p, botMsg])
      setProgress(res.progress)
      setCollected(res.collected)
      setFilled(Object.values(res.collected).filter(v => v && v !== 'N/A').length)
      if (res.is_complete) setDone(true)
    } catch {
      setMsgs(p => [...p, {
        id: Date.now().toString(), role: 'bot',
        text: lang === 'hi'
          ? 'माफ़ करें, कुछ गड़बड़ हो गई। क्या आप फिर से कोशिश कर सकते हैं?'
          : 'Sorry, something went wrong. Could you try again?',
        ts: new Date()
      }])
    }
    setSending(false)
    inputRef.current?.focus()
  }

  const handleVoice = useCallback((t: string) => { setInput(t); inputRef.current?.focus() }, [])
  const { listening, supported, toggle } = useVoice(handleVoice, lang)

  const handleDownload = async () => {
    if (!sessionId) return
    try {
      const blob = await fillAPI.fill(sessionId)
      fillAPI.download(blob, `vaarta-filled.pdf`)
      toast.success('Downloaded!')
    } catch { toast.error('Download failed') }
  }

  /* ── Loading / error states ── */
  if (loading) return (
    <div className="min-h-screen bg-teal-woven flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-saffron/15 border border-saffron/25 flex items-center justify-center mx-auto animate-[breathe_2s_ease-in-out_infinite]">
          <MessageSquareText size={18} className="text-saffron" />
        </div>
        <p className="text-cream/50 text-sm font-body">Loading your form…</p>
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

  const progressLabel = lang === 'hi' ? `${filled} में से ${totalFields}` : `${filled} of ${totalFields}`
  const inputPlaceholder = lang === 'hi' ? 'अपना जवाब टाइप करें…' : 'Type your answer…'

  return (
    <div className="min-h-screen bg-teal-woven flex flex-col" style={{ maxHeight: '100dvh' }}>

      {/* ── Header ── */}
      <div className="flex-shrink-0 px-4 pt-safe pt-4 pb-3 border-b border-white/8">
        <div className="max-w-xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            {/* Branding */}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-saffron/15 border border-saffron/25 flex items-center justify-center">
                <MessageSquareText size={15} className="text-saffron" />
              </div>
              <div>
                <p className="font-display text-cream font-semibold text-sm leading-none">Vaarta</p>
                <p className="text-cream/40 text-[10px] font-body leading-none mt-0.5 truncate max-w-44">{formTitle}</p>
              </div>
            </div>

            {/* Language toggle */}
            <div className="flex items-center gap-1 bg-white/8 rounded-lg p-1 border border-white/8">
              {(['en','hi'] as Lang[]).map(l => (
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

          {/* Progress */}
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
            {msgs.map((m, i) => (
              <Bubble key={m.id} msg={m} isLast={i === msgs.length - 1} />
            ))}
            {sending && <Typing key="typing" />}
          </AnimatePresence>

          {done && (
            <DoneCard
              collected={collected}
              onDownload={handleDownload}
              lang={lang}
            />
          )}
        </div>
      </div>

      {/* ── Input bar ── */}
      {!done && (
        <div className="flex-shrink-0 px-4 pb-safe pb-4 pt-3 border-t border-white/8 bg-teal/30 backdrop-blur-md">
          <div className="max-w-xl mx-auto flex items-end gap-2.5">

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
                disabled={sending}
                className="w-full bg-white/10 border border-white/12 rounded-xl px-4 py-3 text-cream text-sm font-body placeholder:text-cream/30 focus:outline-none focus:border-saffron/50 focus:bg-white/14 transition-all"
              />
            </div>

            {/* Send */}
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || sending}
              className={clsx(
                'flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200',
                input.trim() && !sending
                  ? 'bg-saffron text-white hover:bg-saffron-light active:scale-95 shadow-[0_2px_12px_rgba(232,135,58,0.4)]'
                  : 'bg-white/6 text-cream/20 cursor-not-allowed border border-white/8'
              )}
            >
              <Send size={16} />
            </button>
          </div>

          <p className="text-center text-cream/20 text-[10px] font-body mt-2">
            Powered by Vaarta · Your data is secure
          </p>
        </div>
      )}

    </div>
  )
}

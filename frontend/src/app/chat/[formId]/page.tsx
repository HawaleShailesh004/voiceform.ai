'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { Send, Mic, MicOff, CheckCircle, ChevronDown, Volume2 } from 'lucide-react'
import { sessionAPI, chatAPI, type ChatResponse } from '@/lib/api'
import clsx from 'clsx'

// ── Types ─────────────────────────────────────────────────────────────

interface Message {
  id: string
  role: 'bot' | 'user'
  content: string
  timestamp: Date
  extracted?: Record<string, any>
}

// ── Voice Hook ────────────────────────────────────────────────────────

function useVoiceInput(onTranscript: (text: string) => void) {
  const [isListening, setIsListening] = useState(false)
  const [supported, setSupported] = useState(false)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (SpeechRecognition) {
      setSupported(true)
      const recognition = new SpeechRecognition()
      recognition.continuous = false
      recognition.interimResults = false
      recognition.lang = 'en-IN' // Indian English

      recognition.onresult = (e: any) => {
        const transcript = e.results[0][0].transcript
        onTranscript(transcript)
        setIsListening(false)
      }
      recognition.onerror = () => setIsListening(false)
      recognition.onend = () => setIsListening(false)
      recognitionRef.current = recognition
    }
  }, [onTranscript])

  const toggle = () => {
    if (!recognitionRef.current) return
    if (isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    } else {
      recognitionRef.current.start()
      setIsListening(true)
    }
  }

  return { isListening, supported, toggle }
}

// ── Subcomponents ─────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex items-end gap-3"
    >
      <div className="w-8 h-8 rounded-full bg-navy flex items-center justify-center flex-shrink-0">
        <span className="text-amber font-mono text-xs font-bold">F</span>
      </div>
      <div className="bg-white border border-steel/15 rounded-xl rounded-bl-sm px-4 py-3 shadow-lift">
        <div className="flex gap-1.5">
          <div className="typing-dot" />
          <div className="typing-dot" />
          <div className="typing-dot" />
        </div>
      </div>
    </motion.div>
  )
}

function MessageBubble({ msg }: { msg: Message }) {
  const isBot = msg.role === 'bot'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={clsx('flex items-end gap-3', !isBot && 'flex-row-reverse')}
    >
      {/* Avatar */}
      {isBot ? (
        <div className="w-8 h-8 rounded-full bg-navy flex items-center justify-center flex-shrink-0 mb-1">
          <span className="text-amber font-mono text-xs font-bold">F</span>
        </div>
      ) : (
        <div className="w-8 h-8 rounded-full bg-paper border border-steel/20 flex items-center justify-center flex-shrink-0 mb-1">
          <span className="text-steel font-body text-xs font-medium">You</span>
        </div>
      )}

      {/* Bubble */}
      <div
        className={clsx(
          'max-w-[75%] rounded-xl px-4 py-3 text-sm leading-relaxed',
          isBot
            ? 'bg-white border border-steel/15 text-ink rounded-bl-sm shadow-lift'
            : 'bg-navy text-paper rounded-br-sm'
        )}
      >
        <p className="whitespace-pre-wrap">{msg.content}</p>
        <p className={clsx(
          'text-[10px] mt-1.5',
          isBot ? 'text-mist' : 'text-paper/40'
        )}>
          {msg.timestamp.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </motion.div>
  )
}

function ProgressHeader({
  formTitle,
  progress,
  filledFields,
  totalFields,
}: {
  formTitle: string
  progress: number
  filledFields: number
  totalFields: number
}) {
  return (
    <div className="bg-navy/97 backdrop-blur-sm border-b border-slate/40 px-5 py-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <div className="w-5 h-5 rounded bg-amber flex items-center justify-center">
                <span className="font-mono text-white text-[9px] font-bold">F</span>
              </div>
              <span className="font-body font-medium text-paper text-sm">FormFlow</span>
            </div>
            <p className="text-mist text-xs truncate max-w-48">{formTitle}</p>
          </div>

          <div className="text-right">
            <p className="font-display text-xl text-amber">{progress}%</p>
            <p className="text-mist text-xs">{filledFields}/{totalFields} fields</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-slate/60 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-amber rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
      </div>
    </div>
  )
}

function CompletionCard({ onDownload, collected }: {
  onDownload: () => void
  collected: Record<string, any>
}) {
  const entries = Object.entries(collected).filter(([, v]) => v && v !== 'N/A')

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="card-navy rounded-xl p-6 mx-4 mb-4"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-amber/20 border border-amber/30 flex items-center justify-center">
          <CheckCircle size={20} className="text-amber" />
        </div>
        <div>
          <p className="font-display text-lg text-paper">All done!</p>
          <p className="text-mist text-xs">Form is ready to submit.</p>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-slate/40 rounded-lg p-4 mb-4 space-y-2 max-h-48 overflow-y-auto">
        {entries.slice(0, 8).map(([key, value]) => (
          <div key={key} className="flex justify-between gap-3 text-xs">
            <span className="text-mist capitalize">{key.replace(/_/g, ' ')}</span>
            <span className="text-paper/80 text-right truncate max-w-32">
              {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
            </span>
          </div>
        ))}
        {entries.length > 8 && (
          <p className="text-mist text-xs text-center">+{entries.length - 8} more fields</p>
        )}
      </div>

      <button onClick={onDownload} className="btn-primary w-full justify-center">
        Download filled form
      </button>
    </motion.div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────

export default function ChatPage() {
  const params = useParams()
  const formId = params.formId as string

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [formTitle, setFormTitle] = useState('Form')
  const [totalFields, setTotalFields] = useState(0)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState(0)
  const [filledFields, setFilledFields] = useState(0)
  const [collected, setCollected] = useState<Record<string, any>>({})
  const [isComplete, setIsComplete] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Init session
  useEffect(() => {
    const init = async () => {
      try {
        const session = await sessionAPI.create(formId)
        setSessionId(session.session_id)
        setFormTitle(session.form_title)
        setTotalFields(session.field_count)

        // Add greeting
        setMessages([{
          id: 'greeting',
          role: 'bot',
          content: `Hi! I'm here to help you fill out the "${session.form_title}". I'll ask you a few questions — just reply naturally and I'll take care of the rest. Ready to begin?`,
          timestamp: new Date(),
        }])
      } catch (err) {
        setError('Could not load this form. The link may be invalid or expired.')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [formId])

  const handleVoiceTranscript = useCallback((text: string) => {
    setInput(text)
    inputRef.current?.focus()
  }, [])

  const { isListening, supported, toggle: toggleVoice } = useVoiceInput(handleVoiceTranscript)

  const sendMessage = async (text: string) => {
    if (!text.trim() || !sessionId || sending) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setSending(true)

    try {
      const res: ChatResponse = await chatAPI.send(sessionId, text.trim())

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        content: res.reply,
        timestamp: new Date(),
        extracted: res.extracted,
      }

      setMessages(prev => [...prev, botMsg])
      setProgress(res.progress)
      setCollected(res.collected)
      setFilledFields(Object.keys(res.collected).filter(k => res.collected[k] && res.collected[k] !== 'N/A').length)

      if (res.is_complete) {
        setIsComplete(true)
      }
    } catch {
      toast.error('Something went wrong. Please try again.')
      setSending(false)
      return
    }

    setSending(false)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const handleDownload = async () => {
    if (!sessionId) return
    try {
      const { fillbackAPI } = await import('@/lib/api')
      const blob = await fillbackAPI.fill(sessionId)
      fillbackAPI.downloadPDF(blob, `filled_form.pdf`)
      toast.success('Your completed form is downloading!')
    } catch {
      toast.error('Download failed. Please try again.')
    }
  }

  // ── Loading state ──────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-amber/20 border border-amber/30 flex items-center justify-center mx-auto animate-pulse-slow">
            <span className="font-mono text-amber font-bold">F</span>
          </div>
          <p className="text-paper/60 text-sm">Loading your form…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center px-6">
        <div className="card-navy rounded-xl p-8 max-w-sm w-full text-center">
          <p className="font-display text-lg text-paper mb-2">Link not found</p>
          <p className="text-mist text-sm">{error}</p>
        </div>
      </div>
    )
  }

  // ── Main chat UI ───────────────────────────────

  return (
    <div className="min-h-screen bg-navy flex flex-col">

      {/* Header */}
      <ProgressHeader
        formTitle={formTitle}
        progress={progress}
        filledFields={filledFields}
        totalFields={totalFields}
      />

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-6 space-y-4"
        style={{ maxHeight: 'calc(100vh - 180px)' }}
      >
        <div className="max-w-2xl mx-auto space-y-4">
          <AnimatePresence>
            {messages.map(msg => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            {sending && <TypingIndicator key="typing" />}
          </AnimatePresence>

          {isComplete && (
            <CompletionCard onDownload={handleDownload} collected={collected} />
          )}
        </div>
      </div>

      {/* Input bar */}
      {!isComplete && (
        <div className="border-t border-slate/40 bg-navy/97 backdrop-blur-sm px-4 py-4">
          <div className="max-w-2xl mx-auto flex items-end gap-3">

            {/* Voice button */}
            {supported && (
              <button
                onClick={toggleVoice}
                className={clsx(
                  'w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 transition-all',
                  isListening
                    ? 'bg-amber text-white animate-pulse-slow'
                    : 'bg-slate/60 text-mist hover:text-paper hover:bg-slate'
                )}
              >
                {isListening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
            )}

            {/* Text input */}
            <div className="flex-1 relative">
              {isListening && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute -top-8 left-0 right-0 text-center"
                >
                  <span className="text-amber text-xs font-body">
                    Listening… speak now
                  </span>
                </motion.div>
              )}
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your answer…"
                disabled={sending}
                className="w-full bg-slate/60 border border-steel/30 rounded-lg px-4 py-3 text-paper text-sm placeholder:text-mist/60 focus:outline-none focus:border-amber/60 focus:bg-slate/80 transition-all"
              />
            </div>

            {/* Send button */}
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || sending}
              className={clsx(
                'w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 transition-all',
                input.trim() && !sending
                  ? 'bg-amber text-white hover:bg-amber-light active:scale-95'
                  : 'bg-slate/40 text-mist/40 cursor-not-allowed'
              )}
            >
              <Send size={16} />
            </button>
          </div>

          {/* Helper text */}
          <p className="text-center text-mist/40 text-xs mt-2">
            Press Enter to send · {supported ? 'Tap mic for voice' : ''}
          </p>
        </div>
      )}

    </div>
  )
}

'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, MessageCircle, Send, CheckCircle2, Phone, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

interface Props {
  isOpen: boolean
  onClose: () => void
  sessionId: string
  formTitle: string
  lang?: string
  /** If true, form is already filled — sends immediately. If false, schedules for after fill. */
  alreadyFilled?: boolean
}

const WA_GREEN = '#25D366'

export default function WhatsAppModal({ isOpen, onClose, sessionId, formTitle, lang = 'en', alreadyFilled = false }: Props) {
  const [phone, setPhone]     = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')

  const isHindi = lang === 'hi'

  const handleSend = async () => {
    const digits = phone.replace(/\D/g, '')
    const clean  = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits
    if (!/^[6-9]\d{9}$/.test(clean)) {
      setError(isHindi ? 'कृपया 10 अंकों का सही मोबाइल नंबर डालें' : 'Please enter a valid 10-digit Indian mobile number')
      return
    }
    setError('')
    setSending(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/sessions/${sessionId}/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: clean, lang }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Send failed')
      setSent(true)
      toast.success(
        data.status === 'sent'
          ? (isHindi ? 'PDF WhatsApp पर भेज दिया गया! ✅' : 'PDF sent to WhatsApp! ✅')
          : (isHindi ? 'नंबर सेव हो गया। फ़ॉर्म पूरा होने पर PDF भेजा जाएगा।' : 'Number saved! PDF will be sent when form is complete.')
      )
      setTimeout(onClose, 2000)
    } catch (e: any) {
      setError(e.message || 'Something went wrong')
    } finally {
      setSending(false)
    }
  }

  const handlePhoneChange = (val: string) => {
    // Only allow digits, spaces, +, -
    setPhone(val.replace(/[^\d\s+\-]/g, '').slice(0, 15))
    setError('')
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.93, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.93, y: 16 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl pointer-events-auto overflow-hidden">

              {/* Header — WhatsApp green */}
              <div className="px-6 py-5 flex items-center gap-3" style={{ backgroundColor: WA_GREEN }}>
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <MessageCircle size={20} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-body font-semibold text-white text-base leading-tight">
                    {isHindi ? 'WhatsApp पर PDF पाएँ' : 'Get PDF on WhatsApp'}
                  </h3>
                  <p className="text-white/75 text-xs mt-0.5 truncate font-body">{formTitle}</p>
                </div>
                <button onClick={onClose} className="text-white/70 hover:text-white transition-colors flex-shrink-0">
                  <X size={18} />
                </button>
              </div>

              <div className="p-6">
                {sent ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-4"
                  >
                    <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                      <CheckCircle2 size={28} className="text-emerald-500" />
                    </div>
                    <p className="font-body font-semibold text-ink text-base">
                      {isHindi ? 'भेज दिया गया!' : 'Done!'}
                    </p>
                    <p className="text-ink-muted text-sm font-body mt-1">
                      {alreadyFilled
                        ? (isHindi ? 'PDF कुछ ही देर में आएगा' : 'PDF will arrive shortly')
                        : (isHindi ? 'फ़ॉर्म पूरा होने पर PDF आएगा' : 'PDF will be sent when form is complete')}
                    </p>
                  </motion.div>
                ) : (
                  <>
                    <p className="text-ink-muted text-sm font-body mb-4 leading-relaxed">
                      {isHindi
                        ? `अपना WhatsApp नंबर डालें — ${alreadyFilled ? 'भरा हुआ PDF अभी भेजेंगे।' : 'फ़ॉर्म पूरा होने पर PDF भेजा जाएगा।'}`
                        : `Enter your WhatsApp number — ${alreadyFilled ? "we'll send your filled PDF right now." : "PDF will be sent when the form is complete."}`}
                    </p>

                    {/* Phone input */}
                    <div className="relative mb-2">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                        <span className="text-sm">🇮🇳</span>
                        <span className="text-ink-faint text-sm font-mono">+91</span>
                      </div>
                      <input
                        type="tel"
                        inputMode="numeric"
                        placeholder={isHindi ? "10 अंक" : "10-digit number"}
                        value={phone}
                        onChange={e => handlePhoneChange(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSend()}
                        autoFocus
                        className={clsx(
                          'w-full pl-20 pr-4 py-3 rounded-xl border font-mono text-sm outline-none transition-all',
                          error
                            ? 'border-red-300 focus:border-red-400 bg-red-50'
                            : 'border-teal/20 focus:border-teal/50 bg-cream'
                        )}
                      />
                    </div>

                    {error && (
                      <motion.p
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-red-500 text-xs font-body mb-3"
                      >
                        {error}
                      </motion.p>
                    )}

                    <p className="text-ink-faint text-[11px] font-body mb-4">
                      {isHindi
                        ? '🔒 नंबर सिर्फ PDF भेजने के लिए उपयोग होगा।'
                        : '🔒 Your number is only used to send the PDF. We don\'t store or share it.'}
                    </p>

                    <button
                      onClick={handleSend}
                      disabled={sending || !phone}
                      className={clsx(
                        'w-full py-3 rounded-xl font-body font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all',
                        sending || !phone
                          ? 'opacity-50 cursor-not-allowed'
                          : 'hover:opacity-90 active:scale-[0.98]'
                      )}
                      style={{ backgroundColor: WA_GREEN }}
                    >
                      {sending
                        ? <><Loader2 size={16} className="animate-spin" /> {isHindi ? 'भेज रहे हैं…' : 'Sending…'}</>
                        : <><Send size={15} /> {isHindi ? 'WhatsApp पर भेजें' : 'Send to WhatsApp'}</>
                      }
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
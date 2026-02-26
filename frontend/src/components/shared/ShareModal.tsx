'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Copy, Check, MessageSquare, QrCode, Link2, Download } from 'lucide-react'
import QRCode from 'react-qr-code'
import clsx from 'clsx'

interface ShareModalProps {
  isOpen: boolean
  onClose: () => void
  formTitle: string
  chatLink: string
  whatsappLink: string
}

type Tab = 'link' | 'qr' | 'whatsapp'

export default function ShareModal({ isOpen, onClose, formTitle, chatLink, whatsappLink }: ShareModalProps) {
  const [tab, setTab] = useState<Tab>('link')
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(chatLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const downloadQR = () => {
    const svg = document.getElementById('vaarta-qr')
    if (!svg) return
    const xml = new XMLSerializer().serializeToString(svg)
    const blob = new Blob([xml], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    Object.assign(document.createElement('a'), { href: url, download: 'vaarta-qr.svg' }).click()
    URL.revokeObjectURL(url)
  }

  const tabs = [
    { id: 'link' as Tab,      label: 'Web Link',  icon: Link2 },
    { id: 'qr' as Tab,        label: 'QR Code',   icon: QrCode },
    { id: 'whatsapp' as Tab,  label: 'WhatsApp',  icon: MessageSquare },
  ]

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="bg-white rounded-xl shadow-deep w-full max-w-md pointer-events-auto overflow-hidden">

              {/* Header */}
              <div className="px-6 py-5 border-b border-teal/8 flex items-start justify-between">
                <div>
                  <h2 className="font-display font-semibold text-teal text-xl">Share with users</h2>
                  <p className="text-ink-muted text-sm mt-0.5 font-body">"{formTitle}"</p>
                </div>
                <button onClick={onClose} className="btn-icon mt-0.5">
                  <X size={16} />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-teal/8">
                {tabs.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-body font-medium transition-all relative',
                      tab === id ? 'text-teal' : 'text-ink-muted hover:text-teal'
                    )}
                  >
                    <Icon size={14} />
                    {label}
                    {tab === id && (
                      <motion.div
                        layoutId="tab-line"
                        className="absolute bottom-0 inset-x-0 h-0.5 bg-saffron"
                      />
                    )}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="p-6">
                <AnimatePresence mode="wait">

                  {tab === 'link' && (
                    <motion.div key="link" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                      <p className="text-ink-muted text-sm font-body">Send this link to your users. They can open it on any device to fill the form by chat or voice.</p>
                      <div className="flex gap-2">
                        <div className="flex-1 px-3 py-2.5 bg-cream rounded border border-teal/12 font-mono text-xs text-ink truncate">
                          {chatLink}
                        </div>
                        <button onClick={copy} className={clsx('btn-primary btn-sm flex-shrink-0 min-w-[80px]', copied && 'bg-success')}>
                          {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
                        </button>
                      </div>
                      <div className="p-3 bg-saffron/6 border border-saffron/15 rounded-md">
                        <p className="text-saffron-dark text-xs font-body">
                          <strong>Tip:</strong> The link works on WhatsApp, SMS, email, or print as QR.
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {tab === 'qr' && (
                    <motion.div key="qr" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                      <p className="text-ink-muted text-sm font-body">Print or display this QR code. Users scan it to instantly open the form conversation.</p>
                      <div className="flex justify-center p-6 bg-white rounded-lg border border-teal/10 shadow-[inset_0_2px_8px_rgba(13,61,58,0.06)]">
                        <div className="relative">
                          <QRCode
                            id="vaarta-qr"
                            value={chatLink}
                            size={180}
                            fgColor="#0D3D3A"
                            bgColor="#FFFFFF"
                            level="M"
                          />
                          {/* Center logo overlay */}
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-10 h-10 bg-teal rounded-md flex items-center justify-center shadow-lift">
                              <MessageSquare size={16} className="text-saffron" />
                            </div>
                          </div>
                        </div>
                      </div>
                      <button onClick={downloadQR} className="btn-secondary w-full">
                        <Download size={14} />
                        Download QR as SVG
                      </button>
                    </motion.div>
                  )}

                  {tab === 'whatsapp' && (
                    <motion.div key="wa" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                      <p className="text-ink-muted text-sm font-body">Send users a pre-written WhatsApp message with the form link included.</p>

                      {/* WhatsApp message preview */}
                      <div className="bg-[#ECE5DD] rounded-lg p-4">
                        <div className="bg-white rounded-lg rounded-tl-sm p-3 shadow-sm max-w-[85%]">
                          <p className="text-[#1A1208] text-sm leading-relaxed font-body">
                            Namaste! 🙏<br /><br />
                            Filling out <strong>{formTitle}</strong> is now simple. Just tap the link and answer a few questions — our assistant will guide you in your language.<br /><br />
                            👉 {chatLink}<br /><br />
                            Takes only 2–3 minutes. No paperwork needed!
                          </p>
                          <p className="text-[#667781] text-[10px] text-right mt-1">Now · ✓✓</p>
                        </div>
                      </div>

                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(`Namaste! 🙏\n\nFilling out "${formTitle}" is now simple. Just tap the link and answer a few questions — our assistant will guide you in your language.\n\n👉 ${chatLink}\n\nTakes only 2–3 minutes. No paperwork needed!`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-primary w-full bg-[#25D366] hover:bg-[#22C55E]"
                      >
                        <MessageSquare size={14} />
                        Open WhatsApp
                      </a>
                    </motion.div>
                  )}

                </AnimatePresence>
              </div>

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

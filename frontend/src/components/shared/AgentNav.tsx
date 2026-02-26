'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { MessageSquareText, LayoutDashboard, Upload } from 'lucide-react'
import clsx from 'clsx'

export default function AgentNav() {
  const path = usePathname()

  const links = [
    { href: '/agent', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/agent/upload', label: 'Upload Form', icon: Upload },
  ]

  return (
    <header className="fixed top-0 inset-x-0 z-50 h-16 bg-white/80 backdrop-blur-md border-b border-teal/8 shadow-[0_1px_0_rgba(13,61,58,0.06)]">
      <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">

        {/* Logo */}
        <Link href="/agent" className="flex items-center gap-3 group">
          <div className="relative w-9 h-9">
            <div className="absolute inset-0 bg-teal rounded-lg group-hover:scale-105 transition-transform duration-200" />
            <div className="absolute inset-0 flex items-center justify-center">
              <MessageSquareText size={17} className="text-saffron" />
            </div>
            {/* Decorative dot */}
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-saffron rounded-full border-2 border-white" />
          </div>
          <div className="leading-none">
            <span className="font-display font-semibold text-teal text-lg tracking-tight">Vaarta</span>
            <span className="block text-[9px] font-body font-medium tracking-[0.15em] uppercase text-ink-faint mt-0.5">
              Agent Portal
            </span>
          </div>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = path === href
            return (
              <Link key={href} href={href}
                className={clsx(
                  'relative flex items-center gap-2 px-4 py-2 rounded-md text-sm font-body font-medium transition-colors duration-150',
                  active ? 'text-teal' : 'text-ink-muted hover:text-teal hover:bg-teal/5'
                )}
              >
                <Icon size={15} />
                {label}
                {active && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute inset-0 bg-teal/8 rounded-md -z-10"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Status pill */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/8 border border-success/15">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          <span className="text-[11px] font-body font-semibold text-success">Live</span>
        </div>

      </div>
    </header>
  )
}

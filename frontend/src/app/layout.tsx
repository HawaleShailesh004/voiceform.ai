import type { Metadata } from 'next'
import '../styles/globals.css'
import { Toaster } from 'react-hot-toast'

export const metadata: Metadata = {
  title: 'FormFlow — Intelligent Form Collection',
  description: 'Upload any form. Let people fill it naturally by chat or voice.',
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1B2B4B',
              color: '#F4F1EB',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '14px',
              borderRadius: '8px',
              border: '1px solid rgba(74,96,128,0.4)',
            },
            success: { iconTheme: { primary: '#C9893A', secondary: '#F4F1EB' } },
            error:   { iconTheme: { primary: '#B03A2E', secondary: '#F4F1EB' } },
          }}
        />
        {children}
      </body>
    </html>
  )
}

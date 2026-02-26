import type { Metadata } from 'next'
import '../styles/globals.css'
import { Toaster } from 'react-hot-toast'

export const metadata: Metadata = {
  title: 'Vaarta — Baat karo. Form bhar jao.',
  description: 'Upload any form. Let people fill it naturally by chat or voice in their language.',
  openGraph: {
    title: 'Vaarta',
    description: 'Turn any form into a conversation.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#0D3D3A',
              color: '#FAF6EF',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: '13px',
              borderRadius: '10px',
              border: '1px solid rgba(212,201,184,0.2)',
              padding: '12px 16px',
            },
            success: { iconTheme: { primary: '#E8873A', secondary: '#FAF6EF' } },
            error:   { iconTheme: { primary: '#B03A2E', secondary: '#FAF6EF' } },
            duration: 3500,
          }}
        />
        {children}
      </body>
    </html>
  )
}

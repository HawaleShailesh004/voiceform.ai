'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
export default function Root() {
  const r = useRouter()
  useEffect(() => r.replace('/agent'), [r])
  return null
}

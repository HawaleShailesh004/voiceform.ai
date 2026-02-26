import axios from 'axios'

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const api = axios.create({ baseURL: BASE, timeout: 90000 })

/* ── Types ──────────────────────────────────────────── */

export interface BBox { xmin: number; ymin: number; xmax: number; ymax: number }

export interface FormField {
  field_name: string
  field_type: 'text'|'checkbox'|'date'|'signature'|'radio'|'select'|'number'|'email'|'textarea'
  semantic_label: string
  question_template: string
  description: string
  is_required: boolean
  data_type: string
  validation_rules: Record<string,any>
  bounding_box: BBox
  acro_field_name?: string
  options?: string[]
  /** Optional: font size for overlay/fill (e.g. 10–24). */
  font_size?: number
  /** Optional: font style for overlay ('normal' | 'italic' | 'bold'). */
  font_style?: string
  /** Optional: text color for overlay (e.g. '#0D3D3A'). */
  font_color?: string
  /** Optional: horizontal alignment inside bbox ('left' | 'center' | 'right'). */
  text_align_h?: 'left' | 'center' | 'right'
  /** Optional: vertical alignment inside bbox ('top' | 'middle' | 'bottom'). */
  text_align_v?: 'top' | 'middle' | 'bottom'
}

export interface UploadResult {
  form_id: string
  form_title: string
  source_type: 'acroform'|'scanned_image'|'image_pdf'
  page_count: number
  field_count: number
  fields: FormField[]
  warnings: string[]
  preview_image: string | null
  chat_link: string
  whatsapp_link: string
}

export interface AgentForm {
  form_id: string
  form_title: string
  original_filename: string
  uploaded_at: string
  source_type: string
  field_count: number
  session_count: number
  completed_count: number
}

export interface Session {
  session_id: string
  form_id: string
  status: 'active'|'completed'|'filled'|'abandoned'
  collected: Record<string, any>
  progress_pct: number
  filled_fields: number
  total_fields: number
  created_at: string
  lang?: string
  chat_history?: { role: 'user'|'assistant'; content: string }[]
}

export interface ChatResponse {
  reply: string
  extracted: Record<string, any>
  is_complete: boolean
  progress: number
  collected: Record<string, any>
  /** Updated language code if the AI auto-detected a language switch */
  lang?: string
}

/* ── Analytics types ─────────────────────────────────── */

export interface FieldAnalytic {
  field_name: string
  semantic_label: string
  field_type: string
  is_required: boolean
  reached: number
  filled: number
  skipped: number
  abandoned_here: number
  fill_rate_pct: number
  drop_off_pct: number
}

export interface FunnelStep {
  field: string
  pct: number
  count: number
}

export interface FormAnalytics {
  total_sessions: number
  completed_sessions: number
  completion_rate: number
  avg_completion_time_seconds: number | null
  language_distribution: Record<string, number>
  field_analytics: FieldAnalytic[]
  funnel: FunnelStep[]
}

export interface ResumeSession {
  session_id: string
  form_id: string
  form_title: string
  status: string
  chat_history: { role: 'user'|'assistant'; content: string }[]
  collected: Record<string, any>
  progress_pct: number
  filled_fields: number
  total_fields: number
  lang: string
  next_field: { field_name: string; semantic_label: string } | null
}

/* ── Form API ────────────────────────────────────────── */

export const formAPI = {
  async upload(file: File, onProgress?: (p: number) => void): Promise<UploadResult> {
    const fd = new FormData(); fd.append('file', file)
    const res = await api.post('/api/forms/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: e => onProgress && e.total && onProgress(Math.round(e.loaded / e.total * 100)),
    })
    return res.data
  },

  async get(formId: string) { return (await api.get(`/api/forms/${formId}`)).data },

  async update(formId: string, fields: FormField[], title: string) {
    return (await api.patch(`/api/forms/${formId}`, { fields, form_title: title })).data
  },

  async list(): Promise<AgentForm[]> { return (await api.get('/api/agent/forms')).data.forms },

  async sessions(formId: string): Promise<Session[]> {
    return (await api.get(`/api/forms/${formId}/sessions`)).data.sessions
  },

  async preview(formId: string): Promise<string> {
    return (await api.get(`/api/forms/${formId}/preview`)).data.preview_image
  },

  async sampleValues(formId: string, fields?: FormField[]): Promise<Record<string, string>> {
    const res = await api.post(`/api/forms/${formId}/sample-values`, fields ? { fields } : {})
    return res.data.sample_values ?? {}
  },

  async analytics(formId: string): Promise<FormAnalytics> {
    return (await api.get(`/api/forms/${formId}/analytics`)).data
  },
}

/* ── Session API ─────────────────────────────────────── */

export const sessionAPI = {
  async create(formId: string) {
    return (await api.post('/api/sessions/create', { form_id: formId })).data
  },
  async get(sessionId: string): Promise<Session> {
    return (await api.get(`/api/sessions/${sessionId}`)).data
  },
  async resume(sessionId: string): Promise<ResumeSession> {
    return (await api.get(`/api/sessions/${sessionId}/resume`)).data
  },
}

/* ── Chat API ────────────────────────────────────────── */

export const chatAPI = {
  async send(sessionId: string, message: string, lang = 'en'): Promise<ChatResponse> {
    return (await api.post('/api/chat', { session_id: sessionId, message, lang })).data
  },
  async opening(sessionId: string, lang = 'en'): Promise<{ message: string }> {
    return (await api.post('/api/chat/open', { session_id: sessionId, lang })).data
  },
}

/* ── Fillback API ────────────────────────────────────── */

export const fillAPI = {
  async fill(sessionId: string): Promise<Blob> {
    return (await api.post(`/api/sessions/${sessionId}/fill`, {}, { responseType: 'blob' })).data
  },
  download(blob: Blob, name = 'vaarta-filled.pdf') {
    const url = URL.createObjectURL(blob)
    Object.assign(document.createElement('a'), { href: url, download: name }).click()
    URL.revokeObjectURL(url)
  },
}

/**
 * FormBot API Client
 * All backend communication goes through here.
 */

import axios from 'axios'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: API_BASE,
  timeout: 60000, // 60s for extraction (can be slow)
})

// ── Types ─────────────────────────────────────────────────────────────

export interface BoundingBox {
  xmin: number
  ymin: number
  xmax: number
  ymax: number
}

export interface FormField {
  field_name: string
  field_type: 'text' | 'checkbox' | 'date' | 'signature' | 'radio' | 'select' | 'number' | 'email'
  semantic_label: string
  question_template: string
  description: string
  is_required: boolean
  data_type: string
  bounding_box: BoundingBox
}

export interface UploadResult {
  form_id: string
  form_title: string
  source_type: 'acroform' | 'scanned_image' | 'image_pdf'
  page_count: number
  field_count: number
  fields: FormField[]
  warnings: string[]
  preview_image: string | null
  chat_link: string
  whatsapp_link: string
}

export interface Session {
  session_id: string
  form_id: string
  status: 'active' | 'completed' | 'abandoned'
  collected: Record<string, string | boolean>
  progress_pct: number
  filled_fields: number
  total_fields: number
  created_at: string
}

export interface ChatResponse {
  reply: string
  extracted: Record<string, string | boolean>
  is_complete: boolean
  progress: number
  collected: Record<string, string | boolean>
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

// ── API Methods ───────────────────────────────────────────────────────

export const formAPI = {

  /** Upload form PDF or image → extract fields */
  async uploadForm(file: File, onProgress?: (pct: number) => void): Promise<UploadResult> {
    const formData = new FormData()
    formData.append('file', file)

    const res = await api.post('/api/forms/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (evt) => {
        if (onProgress && evt.total) {
          onProgress(Math.round((evt.loaded / evt.total) * 100))
        }
      },
    })
    return res.data
  },

  /** Get form schema by ID */
  async getForm(formId: string) {
    const res = await api.get(`/api/forms/${formId}`)
    return res.data
  },

  /** Get preview image for form */
  async getFormPreview(formId: string): Promise<string> {
    const res = await api.get(`/api/forms/${formId}/preview`)
    return res.data.preview_image
  },

  /** List all agent's forms */
  async listForms(): Promise<AgentForm[]> {
    const res = await api.get('/api/agent/forms')
    return res.data.forms
  },

  /** Get sessions for a specific form */
  async getFormSessions(formId: string) {
    const res = await api.get(`/api/forms/${formId}/sessions`)
    return res.data.sessions
  },
}

export const sessionAPI = {

  /** Create a new chat session for a form */
  async create(formId: string): Promise<{ session_id: string; form_title: string; field_count: number }> {
    const res = await api.post('/api/sessions/create', { form_id: formId })
    return res.data
  },

  /** Get session state */
  async get(sessionId: string): Promise<Session> {
    const res = await api.get(`/api/sessions/${sessionId}`)
    return res.data
  },
}

export const chatAPI = {

  /** Send a message and get bot reply */
  async send(sessionId: string, message: string, isVoice = false): Promise<ChatResponse> {
    const res = await api.post('/api/chat', {
      session_id: sessionId,
      message,
      is_voice: isVoice,
    })
    return res.data
  },
}

export const fillbackAPI = {

  /** Fill form with collected data, download PDF */
  async fill(sessionId: string): Promise<Blob> {
    const res = await api.post(
      `/api/sessions/${sessionId}/fill`,
      {},
      { responseType: 'blob' }
    )
    return res.data
  },

  /** Trigger download of filled PDF */
  downloadPDF(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  Download,
  Share2,
  Edit2,
  RefreshCw,
  CheckCircle,
  Circle,
  Users,
  TrendingUp,
  FileText,
  Copy,
  Check,
  Link2,
  MessageSquare,
  BarChart3,
  Paperclip,
  Eye,
  ChevronDown,
  ChevronRight,
  Search,
  X,
  MessageCircle,
  Heart,
} from "lucide-react";
import AgentNav from "@/components/shared/AgentNav";
import ShareModal from "@/components/shared/ShareModal";
import FormHealthScore, { type HealthScore } from "@/components/shared/FormHealthScore";
import WhatsAppModal from "@/components/shared/WhatsAppModal";
import { formAPI, fillAPI, whatsappAPI, type Session } from "@/lib/api";
import clsx from "clsx";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const gradeColor = (g: string) =>
  g === "A" || g === "B" ? "badge-teal" : g === "C" ? "badge-amber" : "badge-red";

type StatusFilter = "all" | "completed" | "active";

interface SessionFile {
  field_name: string;
  filename: string;
  size_kb: number;
  path: string;
}

/* ── Session row with expandable files ──────────────── */
function SessionRow({
  s,
  form,
  dlId,
  onDownload,
  onWhatsApp,
  waConfigured,
  index,
}: {
  s: Session;
  form: any;
  dlId: string | null;
  onDownload: (sid: string) => void;
  onWhatsApp?: (sid: string) => void;
  waConfigured?: boolean;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [files, setFiles] = useState<SessionFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const done = s.status === "completed" || s.status === "filled";

  const loadFiles = async () => {
    if (files.length > 0) {
      setExpanded((p) => !p);
      return;
    }
    setLoadingFiles(true);
    try {
      const res = await fetch(`${BASE}/api/sessions/${s.session_id}/files`);
      const data = await res.json();
      setFiles(data.files || []);
      setExpanded(true);
    } catch {
      toast.error("Could not load files");
    } finally {
      setLoadingFiles(false);
    }
  };

  const hasUploads =
    (s as any).uploaded_files &&
    Object.keys((s as any).uploaded_files).length > 0;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.04 }}
        className="grid grid-cols-[20px,1fr,140px,80px,auto] gap-4 px-5 py-3.5 items-center hover:bg-cream/40 transition-colors"
      >
        {/* Status icon */}
        {done ? (
          <CheckCircle size={14} className="text-success" />
        ) : (
          <div className="relative flex-shrink-0">
            <Circle size={14} className="text-ink-faint" />
            <div className="absolute inset-0 m-auto w-1.5 h-1.5 rounded-full bg-teal/60 animate-pulse" />
          </div>
        )}

        {/* Session ID + timestamp */}
        <div>
          <div className="flex items-center gap-2">
            <p className="font-mono text-xs text-ink">
              {s.session_id.slice(0, 10)}…
            </p>
            {/* Language badge */}
            {(s as any).lang && (s as any).lang !== "en" && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-saffron/10 text-saffron border border-saffron/20 font-mono">
                {(s as any).lang.toUpperCase()}
              </span>
            )}
            {/* File attachment indicator */}
            {hasUploads && (
              <button
                onClick={loadFiles}
                className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-teal/8 text-teal border border-teal/15 hover:bg-teal/15 transition-colors"
              >
                {loadingFiles ? (
                  <RefreshCw size={9} className="animate-spin" />
                ) : (
                  <Paperclip size={9} />
                )}
                {Object.keys((s as any).uploaded_files).length} file
                {Object.keys((s as any).uploaded_files).length !== 1 ? "s" : ""}
                {expanded ? (
                  <ChevronDown size={8} />
                ) : (
                  <ChevronRight size={8} />
                )}
              </button>
            )}
          </div>
          <p className="text-ink-faint text-[10px] mt-0.5">
            {new Date(s.created_at).toLocaleString("en-IN", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>

        {/* Progress bar */}
        <div>
          <div className="h-1.5 bg-cream-dark rounded-full overflow-hidden mb-1">
            <div
              className="h-full bg-saffron rounded-full transition-all"
              style={{ width: `${s.progress_pct}%` }}
            />
          </div>
          <span className="font-mono text-[10px] text-ink-faint">
            {s.progress_pct}%
          </span>
        </div>

        {/* Fields count */}
        <p className="font-mono text-xs text-ink-muted">
          {s.filled_fields}/{s.total_fields}
        </p>

        {/* Action */}
        <div className="flex items-center gap-2">
          {done ? (
            <>
              {waConfigured && onWhatsApp && (
                <button
                  type="button"
                  onClick={() => onWhatsApp(s.session_id)}
                  title="Send PDF via WhatsApp"
                  className="p-1.5 rounded-md hover:bg-emerald-50 text-emerald-600 transition-colors"
                >
                  <MessageCircle size={14} />
                </button>
              )}
              <button
                onClick={() => onDownload(s.session_id)}
                disabled={dlId === s.session_id}
                className="btn-primary btn-sm"
              >
                {dlId === s.session_id ? (
                  <RefreshCw size={11} className="animate-spin" />
                ) : (
                  <Download size={11} />
                )}
                PDF
              </button>
            </>
          ) : (
            <span className="badge badge-teal">Active</span>
          )}
        </div>
      </motion.div>

      {/* Expanded: uploaded files */}
      {expanded && files.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="px-12 pb-3 bg-cream/30 border-t border-teal/5"
        >
          <p className="label-xs mb-2 mt-2">Uploaded files</p>
          <div className="flex flex-wrap gap-2">
            {files.map((file) => {
              const isImage = file.filename.match(/\.(png|jpg|jpeg|webp)$/i);
              const fileUrl = `${BASE}/api/sessions/${s.session_id}/files/${file.field_name}`;
              return (
                <a
                  key={file.field_name}
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-teal/10 rounded-lg hover:border-teal/30 hover:shadow-sm transition-all group"
                >
                  {isImage ? (
                    <div className="w-8 h-8 rounded overflow-hidden bg-cream flex-shrink-0">
                      <img
                        src={fileUrl}
                        alt={file.filename}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded bg-teal/8 flex items-center justify-center flex-shrink-0">
                      <FileText size={14} className="text-teal" />
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-medium text-ink capitalize">
                      {file.field_name.replace(/_/g, " ")}
                    </p>
                    <p className="text-[10px] text-ink-faint">
                      {file.size_kb} KB
                    </p>
                  </div>
                  <Eye
                    size={12}
                    className="text-teal/0 group-hover:text-teal/60 transition-colors ml-1"
                  />
                </a>
              );
            })}
          </div>
        </motion.div>
      )}
    </>
  );
}

/* ── Main page ─────────────────────────────────────── */
export default function FormDetailPage() {
  const { formId } = useParams() as { formId: string };
  const router = useRouter();

  const [form, setForm] = useState<any>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dlId, setDlId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [sessionSearch, setSessionSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [rightPanel, setRightPanel] = useState<"fields" | "analytics" | "health">("fields");
  const [healthScore, setHealthScore] = useState<HealthScore | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [waSession, setWaSession] = useState<string | null>(null);
  const [waConfigured, setWaConfigured] = useState(false);

  const loadHealth = useCallback(async () => {
    if (healthScore || loadingHealth) return;
    setLoadingHealth(true);
    try {
      const res = await fetch(`${BASE}/api/forms/${formId}/health`);
      const data = await res.json();
      setHealthScore(data);
    } catch {
      toast.error("Could not load health score");
    } finally {
      setLoadingHealth(false);
    }
  }, [formId, healthScore, loadingHealth]);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const [f, s] = await Promise.all([
          formAPI.get(formId),
          formAPI.sessions(formId),
        ]);
        setForm(f);
        setSessions(s);
      } catch {
        toast.error("Could not load form data");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [formId],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    whatsappAPI.isConfigured().then(setWaConfigured);
  }, []);

  const handleDownload = async (sid: string) => {
    setDlId(sid);
    try {
      const blob = await fillAPI.fill(sid);
      fillAPI.download(blob, `vaarta-${formId.slice(0, 6)}.pdf`);
      toast.success("Filled form downloaded!");
    } catch {
      toast.error("Download failed");
    } finally {
      setDlId(null);
    }
  };

  const exportCSV = () => {
    const completed = sessions.filter(
      (s) => s.status === "completed" || s.status === "filled",
    );
    if (!completed.length) {
      toast.error("No completed sessions to export");
      return;
    }
    const headers = form?.fields?.map((f: any) => f.semantic_label) || [];
    const rows = completed.map((s) =>
      headers
        .map((h: string) => {
          const key = form?.fields?.find(
            (f: any) => f.semantic_label === h,
          )?.field_name;
          const val = s.collected?.[key] ?? "";
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(","),
    );
    const csv = [headers.map((h: string) => `"${h}"`).join(","), ...rows].join(
      "\n",
    );
    const blob = new Blob([csv], { type: "text/csv" });
    fillAPI.download(blob as any, `vaarta-data-${formId.slice(0, 6)}.csv`);
    toast.success(`${completed.length} responses exported!`);
  };

  const chatLink = `${typeof window !== "undefined" ? window.location.origin : ""}/chat/${formId}`;
  const waLink = `https://wa.me/?text=${encodeURIComponent(`Fill "${form?.form_title}" easily: ${chatLink}`)}`;
  const copyLink = () => {
    navigator.clipboard.writeText(chatLink);
    setCopied(true);
    toast.success("Link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading)
    return (
      <div className="min-h-screen bg-woven grain flex items-center justify-center">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-teal/40"
              style={{ animation: `dot 1.4s ease-in-out ${i * 0.2}s infinite` }}
            />
          ))}
        </div>
      </div>
    );

  const completed = sessions.filter(
    (s) => s.status === "completed" || s.status === "filled",
  ).length;
  const active = sessions.filter((s) => s.status === "active").length;
  const abandoned = sessions.length - completed - active;
  const rate = sessions.length
    ? Math.round((completed / sessions.length) * 100)
    : 0;
  const avgPct = sessions.length
    ? Math.round(
        sessions.reduce((a, s) => a + (s.progress_pct || 0), 0) /
          sessions.length,
      )
    : 0;

  const filteredSessions = sessions.filter((s) => {
    if (filter === "completed")
      if (s.status !== "completed" && s.status !== "filled") return false;
    if (filter === "active") if (s.status !== "active") return false;
    const q = sessionSearch.trim().toLowerCase();
    if (q) if (!s.session_id.toLowerCase().includes(q)) return false;
    return true;
  });

  // Count sessions with file attachments
  const sessionsWithFiles = sessions.filter(
    (s) =>
      (s as any).uploaded_files &&
      Object.keys((s as any).uploaded_files).length > 0,
  ).length;

  return (
    <div className="min-h-screen bg-woven grain">
      <AgentNav />

      {/* Sub-header */}
      <div className="pt-8 sticky top-16 z-40 bg-white/90 backdrop-blur-md border-b border-teal/8">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-4">
          <button onClick={() => router.back()} className="btn-ghost btn-sm">
            <ArrowLeft size={14} /> Back
          </button>
          <div className="w-px h-5 bg-teal/12" />
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="font-display text-lg text-teal truncate">
              {form?.form_title}
            </span>
            {form?.health_score && (
              <span
                className={clsx(
                  "badge text-[10px] font-mono font-bold",
                  gradeColor(form.health_score.grade),
                )}
              >
                Health: {form.health_score.grade} ({form.health_score.overall_score})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => load(true)}
              className="btn-ghost btn-sm"
              disabled={refreshing}
            >
              <RefreshCw
                size={14}
                className={refreshing ? "animate-spin" : ""}
              />{" "}
              Refresh
            </button>
            <button onClick={exportCSV} className="btn-ghost btn-sm">
              <Download size={14} /> Export CSV
            </button>
            <button
              onClick={() => router.push(`/agent/form/${formId}/edit`)}
              className="btn-secondary btn-sm"
            >
              <Edit2 size={14} /> Edit fields
            </button>
            <button
              onClick={() => router.push(`/agent/form/${formId}/analytics`)}
              className="btn-ghost btn-sm"
            >
              <BarChart3 size={14} /> Analytics
            </button>
            <button
              onClick={() => setShareOpen(true)}
              className="btn-primary btn-sm"
            >
              <Share2 size={14} /> Share
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-8 pb-20">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8 pt-20">
          {[
            {
              icon: FileText,
              label: "Fields",
              value: form?.field_count ?? 0,
              color: "text-teal",
            },
            {
              icon: Users,
              label: "Sessions",
              value: sessions.length,
              color: "text-teal",
            },
            {
              icon: TrendingUp,
              label: "Active",
              value: active,
              color: "text-ink",
            },
            {
              icon: CheckCircle,
              label: "Completed",
              value: completed,
              color: "text-saffron",
            },
            {
              icon: Paperclip,
              label: "With files",
              value: sessionsWithFiles,
              color: "text-teal",
            },
          ].map(({ icon: Icon, label, value, color }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="card p-5"
            >
              <div className="flex items-center gap-2 mb-3">
                <Icon size={14} className="text-ink-faint" />
                <span className="label-xs">{label}</span>
              </div>
              <p className={`font-display text-3xl font-semibold ${color}`}>
                {value}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Completion bar */}
        {sessions.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
            className="card p-5 mb-6"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="label-xs">Completion rate</span>
              <div className="flex items-center gap-4">
                {abandoned > 0 && (
                  <span className="text-[11px] font-body text-ink-faint">
                    {abandoned} abandoned
                  </span>
                )}
                <span className="font-display text-xl text-teal font-semibold tabular-nums">
                  {rate}%
                </span>
              </div>
            </div>
            <div className="h-2.5 bg-cream-dark rounded-full overflow-hidden flex mb-2">
              <motion.div
                className="h-full bg-success rounded-l-full"
                initial={{ width: 0 }}
                animate={{ width: `${(completed / sessions.length) * 100}%` }}
                transition={{ duration: 0.9, ease: "easeOut", delay: 0.3 }}
              />
              <motion.div
                className="h-full bg-saffron"
                initial={{ width: 0 }}
                animate={{ width: `${(active / sessions.length) * 100}%` }}
                transition={{ duration: 0.9, ease: "easeOut", delay: 0.4 }}
              />
            </div>
            <div className="flex items-center gap-4 text-[11px] font-body text-ink-faint flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-success" />
                {completed} completed
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-saffron" />
                {active} in progress
              </span>
              {abandoned > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-cream-dark border border-sand" />
                  {abandoned} abandoned
                </span>
              )}
              <span className="ml-auto">{avgPct}% avg progress</span>
            </div>
          </motion.div>
        )}

        {/* Share strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="card px-5 py-3.5 mb-8 flex items-center gap-3 flex-wrap"
        >
          <Link2 size={14} className="text-teal/60 flex-shrink-0" />
          <span className="font-mono text-xs text-ink-muted truncate flex-1 min-w-0 bg-cream-dark px-3 py-1.5 rounded-md">
            {chatLink}
          </span>
          <button
            onClick={copyLink}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex-shrink-0",
              copied
                ? "bg-success/10 text-success border-success/20"
                : "btn-ghost border-teal/15",
            )}
          >
            {copied ? (
              <>
                <Check size={12} /> Copied
              </>
            ) : (
              <>
                <Copy size={12} /> Copy link
              </>
            )}
          </button>
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[#25D366]/20 bg-[#25D366]/8 text-[#128C7E] hover:bg-[#25D366]/15 transition-all flex-shrink-0"
          >
            <MessageSquare size={12} /> WhatsApp
          </a>
        </motion.div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr,340px] gap-8">
          {/* Sessions table */}
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="font-display text-xl text-teal font-semibold">
                Sessions
                {filteredSessions.length !== sessions.length && (
                  <span className="ml-2 text-sm font-body text-ink-faint font-normal">
                    ({filteredSessions.length})
                  </span>
                )}
              </h2>
              {sessions.length > 0 && (
                <div className="flex items-center gap-1 bg-cream-dark rounded-lg p-0.5">
                  {(["all", "active", "completed"] as StatusFilter[]).map(
                    (f) => (
                      <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={clsx(
                          "px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize",
                          filter === f
                            ? "bg-white text-teal shadow-sm"
                            : "text-ink-muted hover:text-teal",
                        )}
                      >
                        {f}
                        {f !== "all" && (
                          <span className="ml-1.5 tabular-nums">
                            {f === "completed" ? completed : active}
                          </span>
                        )}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>

            {sessions.length > 0 && (
              <div className="mb-4">
                <label htmlFor="session-search" className="sr-only">
                  Search sessions by ID
                </label>
                <div className="relative">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"
                    aria-hidden
                  />
                  <input
                    id="session-search"
                    type="text"
                    value={sessionSearch}
                    onChange={(e) => setSessionSearch(e.target.value)}
                    placeholder="Search by session ID"
                    className="w-full max-w-sm pl-9 pr-4 py-2 rounded-lg border border-teal/15 bg-white text-ink text-sm font-body placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-teal/20 focus:border-teal/30 transition-all"
                  />
                  {sessionSearch.trim() && (
                    <button
                      type="button"
                      onClick={() => setSessionSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-ink-faint hover:text-ink hover:bg-cream/60 transition-colors"
                      aria-label="Clear search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {sessions.length === 0 ? (
              <div className="card p-14 text-center">
                <Users size={28} className="text-ink-faint mx-auto mb-3" />
                <p className="font-display text-lg text-teal mb-1">
                  No sessions yet
                </p>
                <p className="text-ink-muted text-sm mb-5 font-body">
                  Share the link to start collecting responses.
                </p>
                <button
                  onClick={() => setShareOpen(true)}
                  className="btn-primary mx-auto"
                >
                  <Share2 size={14} /> Share form
                </button>
              </div>
            ) : (
              <div className="card overflow-hidden">
                <div className="grid grid-cols-[20px,1fr,140px,80px,auto] gap-4 px-5 py-3 border-b border-teal/8 bg-cream/60">
                  {["", "Session", "Progress", "Fields", "Action"].map((h) => (
                    <span key={h} className="label-xs">
                      {h}
                    </span>
                  ))}
                </div>
                <div className="divide-y divide-teal/5">
                  {filteredSessions.map((s, i) => (
                    <SessionRow
                      key={s.session_id}
                      s={s}
                      form={form}
                      dlId={dlId}
                      onDownload={handleDownload}
                      onWhatsApp={(sid) => {
                        setWaSession(sid);
                        setWaOpen(true);
                      }}
                      waConfigured={waConfigured}
                      index={i}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right panel: Fields | Analytics | Health */}
          <div>
            <div className="flex items-center gap-1 mb-4">
              <button
                onClick={() => setRightPanel("fields")}
                className={
                  rightPanel === "fields" ? "btn-primary btn-sm" : "btn-ghost btn-sm"
                }
              >
                <FileText size={13} /> Fields
              </button>
              <button
                onClick={() => setRightPanel("analytics")}
                className={
                  rightPanel === "analytics"
                    ? "btn-primary btn-sm"
                    : "btn-ghost btn-sm"
                }
              >
                <BarChart3 size={13} /> Analytics
              </button>
              <button
                onClick={() => {
                  setRightPanel("health");
                  loadHealth();
                }}
                className={
                  rightPanel === "health" ? "btn-primary btn-sm" : "btn-ghost btn-sm"
                }
              >
                <Heart size={13} /> Health
              </button>
            </div>

            {rightPanel === "fields" && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-display text-lg text-teal font-semibold">
                    Fields
                  </h2>
                  <button
                    onClick={() => router.push(`/agent/form/${formId}/edit`)}
                    className="btn-ghost btn-sm"
                  >
                    <Edit2 size={13} /> Edit
                  </button>
                </div>
                <div className="card overflow-hidden">
                  {(form?.fields || []).map((f: any, i: number) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 px-4 py-3 border-b border-teal/5 last:border-0 hover:bg-cream/40 transition-colors"
                    >
                      <span className="w-5 h-5 rounded bg-teal/8 flex items-center justify-center font-mono text-[9px] text-teal flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-ink text-sm font-body truncate">
                          {f.semantic_label}
                        </p>
                        <p className="text-ink-faint text-xs">{f.field_type}</p>
                      </div>
                      {f.is_required && (
                        <span className="text-saffron text-xs">★</span>
                      )}
                    </div>
                  ))}
                </div>
                {form?.source_type && (
                  <div className="mt-4 px-4 py-3 bg-cream/60 border border-teal/8 rounded-lg">
                    <p className="label-xs mb-1">Source</p>
                    <p className="text-xs font-body text-ink-muted capitalize">
                      {form.source_type.replace(/_/g, " ")}
                    </p>
                    {form.original_filename && (
                      <p className="text-[10px] font-body text-ink-faint mt-0.5 truncate">
                        {form.original_filename}
                      </p>
                    )}
                  </div>
                )}
                <button
                  onClick={() => router.push(`/agent/form/${formId}/edit`)}
                  className="btn-ghost btn-sm mt-3 w-full justify-center"
                >
                  <Edit2 size={13} /> Edit fields
                </button>
              </>
            )}

            {rightPanel === "analytics" && (
              <div className="card p-6">
                <p className="text-ink-muted text-sm mb-4">
                  Field-level drop-off, completion time, and funnel.
                </p>
                <button
                  onClick={() => router.push(`/agent/form/${formId}/analytics`)}
                  className="btn-primary btn-sm"
                >
                  <BarChart3 size={14} /> Open analytics
                </button>
              </div>
            )}

            {rightPanel === "health" && (loadingHealth ? (
              <div className="flex items-center justify-center p-12">
                <div className="w-5 h-5 border-2 border-teal/30 border-t-teal rounded-full animate-spin" />
              </div>
            ) : healthScore ? (
              <FormHealthScore
                health={healthScore}
                compact={false}
                expandable={false}
              />
            ) : (
              <p className="text-ink-faint text-sm p-6">No health data yet</p>
            ))}
          </div>
        </div>
      </main>

      <ShareModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        formTitle={form?.form_title || ""}
        chatLink={chatLink}
        whatsappLink={waLink}
      />

      {waSession && (
        <WhatsAppModal
          isOpen={waOpen}
          onClose={() => {
            setWaOpen(false);
            setWaSession(null);
          }}
          sessionId={waSession}
          formTitle={form?.form_title || ""}
          lang="en"
          alreadyFilled={true}
        />
      )}
    </div>
  );
}

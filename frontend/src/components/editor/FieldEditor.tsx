"use client";

import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import {
  GripVertical,
  Trash2,
  ChevronDown,
  Plus,
  Type,
  CheckSquare,
  Calendar,
  Hash,
  AtSign,
  AlignLeft,
  CircleDot,
  ToggleLeft,
  Pen,
  Star,
  Move,
} from "lucide-react";
import clsx from "clsx";
import type { FormField, BBox } from "@/lib/api";

/* ── Field type config ─────────────────────────────── */

const FIELD_TYPES = [
  { value: "text", label: "Text", icon: Type },
  { value: "number", label: "Number", icon: Hash },
  { value: "email", label: "Email", icon: AtSign },
  { value: "date", label: "Date", icon: Calendar },
  { value: "checkbox", label: "Checkbox", icon: CheckSquare },
  { value: "radio", label: "Radio", icon: CircleDot },
  { value: "select", label: "Dropdown", icon: ToggleLeft },
  { value: "textarea", label: "Long Text", icon: AlignLeft },
  { value: "signature", label: "Signature", icon: Pen },
] as const;

const typeIcon = (t: string) => {
  const found = FIELD_TYPES.find((ft) => ft.value === t);
  return found ? found.icon : Type;
};

/** Collect scrollable ancestors so we can update dropdown position on scroll */
function getScrollParents(node: HTMLElement | null): HTMLElement[] {
  const out: HTMLElement[] = [];
  let p: HTMLElement | null = node?.parentElement ?? null;
  while (p) {
    const s = getComputedStyle(p);
    const o = s.overflow + s.overflowY + s.overflowX;
    if (/(auto|scroll|overlay)/.test(o)) out.push(p);
    p = p.parentElement;
  }
  return out;
}

/* ── Local sample fallback when API samples are empty ── */

const SAMPLES: Record<string, string> = {
  first_name: "Rahul", fname: "Rahul", given_name: "Rahul",
  middle_name: "Kumar",
  last_name: "Sharma", lname: "Sharma", surname: "Sharma",
  full_name: "Rahul Kumar Sharma", name: "Rahul Kumar Sharma",
  applicant_name: "Rahul Kumar Sharma", candidate_name: "Rahul Kumar Sharma",
  email: "rahul.sharma@gmail.com", email_address: "rahul.sharma@gmail.com",
  mobile: "9876543210", phone: "9876543210", mobile_number: "9876543210",
  telephone: "022-24567890",
  dob: "15/03/1990", date_of_birth: "15/03/1990", birth_date: "15/03/1990",
  age: "34", gender: "Male", sex: "Male",
  address: "123, MG Road, Shivaji Nagar", street: "123, MG Road",
  city: "Pune", town: "Pune", state: "Maharashtra", district: "Pune",
  pincode: "411001", pin_code: "411001", zip: "411001", country: "India",
  aadhar: "1234 5678 9012", pan: "ABCDE1234F",
  voter_id: "ABC1234567", passport: "A1234567",
  date: "15/03/2024", joining_date: "01/04/2024", expiry_date: "31/12/2025",
  account_number: "123456789012", bank_name: "State Bank of India",
  ifsc: "SBIN0001234", branch: "Pune Main Branch",
  amount: "₹25,000", salary: "₹45,000",
  occupation: "Software Engineer", designation: "Senior Developer",
  organization: "Vaarta Technologies", company: "Vaarta Technologies",
  qualification: "B.Tech Computer Science",
  religion: "Hindu", nationality: "Indian",
  father_name: "Suresh Kumar Sharma", mother_name: "Sunita Sharma",
  spouse_name: "Priya Sharma", nominee: "Priya Sharma", relationship: "Spouse",
  signature: "Rahul K. Sharma", remarks: "All details correct.",
  purpose: "Personal Use", area: "Shivaji Nagar",
};

function getSample(field: FormField): string {
  const key = field.field_name.toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (SAMPLES[key]) return SAMPLES[key];
  for (const [k, v] of Object.entries(SAMPLES)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  switch (field.field_type) {
    case "checkbox": return "true";
    case "date": return "15/03/1990";
    case "number": return "42";
    case "email": return "sample@example.com";
    default: return field.semantic_label;
  }
}

/* ── Bbox overlay (draggable + resizable) ──────────── */

interface BboxOverlayProps {
  field: FormField;
  index: number;
  isActive: boolean;
  imgW: number;
  imgH: number;
  onUpdate: (bb: BBox) => void;
  onActivate: () => void;
  onActionStart?: () => void;
  onCommit?: () => void;
}

function BboxOverlay({
  field,
  index,
  isActive,
  imgW,
  imgH,
  onUpdate,
  onActivate,
  onActionStart,
  onCommit,
}: BboxOverlayProps) {
  const bb = field.bounding_box;
  const dragState = useRef<{
    type: string;
    startX: number;
    startY: number;
    origBb: BBox;
  } | null>(null);

  const toPercent = (n: number) => n / 10; // 0–1000 → 0–100%

  const pct = {
    left: toPercent(bb.xmin),
    top: toPercent(bb.ymin),
    width: toPercent(bb.xmax - bb.xmin),
    height: toPercent(bb.ymax - bb.ymin),
  };

  const handleMouseDown = (e: React.MouseEvent, type: string) => {
    e.preventDefault();
    e.stopPropagation();
    onActivate();
    onActionStart?.();
    dragState.current = {
      type,
      startX: e.clientX,
      startY: e.clientY,
      origBb: { ...bb },
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragState.current) return;
      const { type, startX, startY, origBb } = dragState.current;
      const dx = ((e.clientX - startX) / imgW) * 1000;
      const dy = ((e.clientY - startY) / imgH) * 1000;
      let next = { ...origBb };

      if (type === "move") {
        next = {
          xmin: origBb.xmin + dx,
          ymin: origBb.ymin + dy,
          xmax: origBb.xmax + dx,
          ymax: origBb.ymax + dy,
        };
      } else {
        if (type.includes("n"))
          next.ymin = Math.min(origBb.ymin + dy, origBb.ymax - 20);
        if (type.includes("s"))
          next.ymax = Math.max(origBb.ymax + dy, origBb.ymin + 20);
        if (type.includes("w"))
          next.xmin = Math.min(origBb.xmin + dx, origBb.xmax - 20);
        if (type.includes("e"))
          next.xmax = Math.max(origBb.xmax + dx, origBb.xmin + 20);
      }

      // Clamp
      next.xmin = Math.max(0, Math.min(next.xmin, 980));
      next.ymin = Math.max(0, Math.min(next.ymin, 980));
      next.xmax = Math.max(20, Math.min(next.xmax, 1000));
      next.ymax = Math.max(20, Math.min(next.ymax, 1000));

      onUpdate({
        xmin: Math.round(next.xmin),
        ymin: Math.round(next.ymin),
        xmax: Math.round(next.xmax),
        ymax: Math.round(next.ymax),
      });
    },
    [imgW, imgH, onUpdate],
  );

  const onMouseUp = useCallback(() => {
    dragState.current = null;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    onCommit?.();
  }, [onMouseMove, onCommit]);

  const handles = [
    {
      id: "n",
      style: {
        top: "-4px",
        left: "50%",
        transform: "translateX(-50%)",
        cursor: "n-resize",
        width: "40%",
        height: "3px",
      },
    },
    {
      id: "s",
      style: {
        bottom: "-4px",
        left: "50%",
        transform: "translateX(-50%)",
        cursor: "s-resize",
        width: "40%",
        height: "3px",
      },
    },
    {
      id: "w",
      style: {
        left: "-4px",
        top: "50%",
        transform: "translateY(-50%)",
        cursor: "w-resize",
        width: "3px",
        height: "40%",
      },
    },
    {
      id: "e",
      style: {
        right: "-4px",
        top: "50%",
        transform: "translateY(-50%)",
        cursor: "e-resize",
        width: "3px",
        height: "40%",
      },
    },
    {
      id: "nw",
      style: {
        top: "-4px",
        left: "-4px",
        cursor: "nw-resize",
        width: "10px",
        height: "10px",
      },
    },
    {
      id: "ne",
      style: {
        top: "-4px",
        right: "-4px",
        cursor: "ne-resize",
        width: "10px",
        height: "10px",
      },
    },
    {
      id: "sw",
      style: {
        bottom: "-4px",
        left: "-4px",
        cursor: "sw-resize",
        width: "10px",
        height: "10px",
      },
    },
    {
      id: "se",
      style: {
        bottom: "-4px",
        right: "-4px",
        cursor: "se-resize",
        width: "10px",
        height: "10px",
      },
    },
  ];

  return (
    <div
      className={clsx(
        "absolute rounded-[3px] transition-all duration-150",
        isActive
          ? "border-2 border-saffron bg-saffron/15 z-20"
          : "border border-teal/50 bg-teal/8 hover:border-teal hover:bg-teal/15 z-10 cursor-move",
      )}
      style={{
        left: `${pct.left}%`,
        top: `${pct.top}%`,
        width: `${pct.width}%`,
        height: `${pct.height}%`,
      }}
      onMouseDown={(e) => handleMouseDown(e, "move")}
      title={field.semantic_label}
    >
      {/* Field number badge */}
      <div
        className={clsx(
          "absolute -top-5 left-0 px-1.5 py-0.5 rounded-t text-[9px] font-body font-bold whitespace-nowrap",
          isActive ? "bg-saffron text-white" : "bg-teal text-cream",
        )}
      >
        {index + 1}. {field.semantic_label.slice(0, 18)}
        {field.semantic_label.length > 18 ? "…" : ""}
      </div>

      {/* Resize handles — only shown when active */}
      {isActive &&
        handles.map((h) => (
          <div
            key={h.id}
            className="absolute bg-saffron rounded-sm z-30"
            style={h.style as React.CSSProperties}
            onMouseDown={(e) => handleMouseDown(e, h.id)}
          />
        ))}

      {/* Child option boxes (radio/checkbox groups) */}
      {field.children?.map((child) => {
        const cbb = child.bounding_box;
        const pw = bb.xmax - bb.xmin || 1;
        const ph = bb.ymax - bb.ymin || 1;
        return (
          <div
            key={child.field_name}
            className="absolute border border-blue-400/60 bg-blue-400/10 rounded-sm pointer-events-none"
            style={{
              left: `${((cbb.xmin - bb.xmin) / pw) * 100}%`,
              top: `${((cbb.ymin - bb.ymin) / ph) * 100}%`,
              width: `${((cbb.xmax - cbb.xmin) / pw) * 100}%`,
              height: `${((cbb.ymax - cbb.ymin) / ph) * 100}%`,
            }}
            title={child.label}
          >
            <span className="absolute -top-4 left-0 text-[8px] text-blue-500 whitespace-nowrap">
              {child.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Field Card (right panel) ──────────────────────── */

interface FieldCardProps {
  field: FormField;
  index: number;
  isActive: boolean;
  onActivate: () => void;
  onUpdate: (updates: Partial<FormField>) => void;
  onDelete: () => void;
}

function FieldCard({
  field,
  index,
  isActive,
  onActivate,
  onUpdate,
  onDelete,
}: FieldCardProps) {
  const [editingLabel, setEditingLabel] = useState(false);
  const [showTypes, setShowTypes] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number } | null>(null);
  const typeButtonRef = useRef<HTMLButtonElement>(null);
  const Icon = typeIcon(field.field_type);

  useLayoutEffect(() => {
    if (!showTypes || !typeButtonRef.current) return;
    const el = typeButtonRef.current;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setDropdownRect({ left: rect.left, top: rect.top });
    };
    update();
    const scrollParents = getScrollParents(el);
    scrollParents.forEach((p) => p.addEventListener("scroll", update, { passive: true }));
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      scrollParents.forEach((p) => p.removeEventListener("scroll", update));
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [showTypes]);

  return (
    <Reorder.Item
      value={field}
      dragListener={false}
      className={clsx(
        "rounded-lg border transition-all duration-200 bg-white overflow-hidden",
        isActive
          ? "border-saffron shadow-glow"
          : "border-teal/12 hover:border-teal/30",
      )}
      onClick={onActivate}
    >
      <div className="flex items-start gap-3 p-3.5">
        {/* Drag handle */}
        <div className="mt-0.5 cursor-grab active:cursor-grabbing text-ink-faint hover:text-ink-muted flex-shrink-0">
          <GripVertical size={14} />
        </div>

        {/* Number */}
        <div
          className={clsx(
            "w-5 h-5 rounded text-[10px] font-body font-bold flex items-center justify-center flex-shrink-0 mt-0.5",
            isActive ? "bg-saffron text-white" : "bg-teal/10 text-teal",
          )}
        >
          {index + 1}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-2">
          {/* Label */}
          {editingLabel ? (
            <input
              autoFocus
              defaultValue={field.semantic_label}
              className="input text-sm py-1.5 w-full"
              onBlur={(e) => {
                onUpdate({ semantic_label: e.target.value });
                setEditingLabel(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div
              className="flex items-center gap-1.5 cursor-text"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingLabel(true);
              }}
              title="Double-click to rename"
            >
              <span className="text-ink font-body font-medium text-sm truncate">
                {field.semantic_label}
              </span>
              {field.is_required && (
                <Star
                  size={9}
                  className="text-saffron flex-shrink-0 fill-saffron"
                />
              )}
            </div>
          )}

          {/* Controls row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Type selector — dropdown in portal so it's not clipped by overflow */}
            <div className="relative">
              <button
                ref={typeButtonRef}
                type="button"
                className="flex items-center gap-1.5 px-2 py-1 bg-teal/6 rounded text-teal text-xs font-body font-medium hover:bg-teal/12 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTypes((v) => !v);
                }}
              >
                <Icon size={11} />
                {field.field_type}
                <ChevronDown size={10} />
              </button>
              {typeof document !== "undefined" &&
                showTypes &&
                dropdownRect &&
                createPortal(
                  <AnimatePresence>
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      style={{
                        position: "fixed",
                        left: dropdownRect.left,
                        top: dropdownRect.top + 28,
                        zIndex: 9999,
                      }}
                      className="bg-white border border-teal/12 rounded-lg shadow-lift py-1 w-36 min-w-max ring-1 ring-black/5"
                    >
                      {FIELD_TYPES.map(({ value, label, icon: TIcon }) => (
                        <button
                          key={value}
                          type="button"
                          className={clsx(
                            "w-full flex items-center gap-2.5 px-3 py-1.5 text-xs font-body hover:bg-teal/6 transition-colors text-left",
                            field.field_type === value
                              ? "text-teal font-semibold"
                              : "text-ink-muted",
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdate({ field_type: value as any });
                            setShowTypes(false);
                          }}
                        >
                          <TIcon size={12} />
                          {label}
                        </button>
                      ))}
                    </motion.div>
                  </AnimatePresence>,
                  document.body,
                )}
            </div>

            {/* Required toggle */}
            <button
              className={clsx(
                "flex items-center gap-1 px-2 py-1 rounded text-xs font-body font-medium transition-colors",
                field.is_required
                  ? "bg-saffron/10 text-saffron-dark"
                  : "bg-sand/20 text-ink-faint hover:bg-sand/40",
              )}
              onClick={(e) => {
                e.stopPropagation();
                onUpdate({ is_required: !field.is_required });
              }}
            >
              <Star
                size={9}
                className={field.is_required ? "fill-saffron text-saffron" : ""}
              />
              {field.is_required ? "Required" : "Optional"}
            </button>
          </div>

          {/* Question preview */}
          <p className="text-ink-faint text-[11px] font-body italic leading-tight truncate">
            "{field.question_template}"
          </p>

          {/* Option chips for radio/checkbox groups */}
          {field.children && field.children.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {field.children.map((c) => (
                <span
                  key={c.field_name}
                  className="px-1.5 py-0.5 bg-teal/8 rounded text-[10px] text-teal"
                >
                  {c.label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Delete */}
        <button
          className="btn-icon w-7 h-7 text-ink-faint hover:text-error hover:bg-error/8 flex-shrink-0 mt-0.5"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </Reorder.Item>
  );
}

/* ── Coordinates popup (when a field is selected) ───── */

const COORD_FONT_SIZES = [10, 12, 14, 16, 18, 20, 22, 24];
const COORD_FONT_STYLES = [
  { value: "normal", label: "Normal" },
  { value: "italic", label: "Italic" },
  { value: "bold", label: "Bold" },
];
const ALIGN_H = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
] as const;
const ALIGN_V = [
  { value: "top", label: "Top" },
  { value: "middle", label: "Middle" },
  { value: "bottom", label: "Bottom" },
] as const;
const PRESET_COLORS = [
  "#0D3D3A",
  "#1a1a1a",
  "#000000",
  "#B03A2E",
  "#2D7A4F",
  "#4A6080",
];

interface CoordinatesPopupProps {
  field: FormField;
  onUpdate: (updates: Partial<FormField>) => void;
  onClose: () => void;
  onApplyToAll?: (styleUpdates: Partial<FormField>) => void;
  /** Global defaults (from "Font & alignment" dropdown) when field has no override */
  defaultFontSize?: number;
  defaultFontStyle?: string;
  defaultAlignH?: "left" | "center" | "right";
  defaultAlignV?: "top" | "middle" | "bottom";
}

function CoordinatesPopup({
  field,
  onUpdate,
  onClose,
  onApplyToAll,
  defaultFontSize = 14,
  defaultFontStyle = "normal",
  defaultAlignH = "left",
  defaultAlignV = "top",
}: CoordinatesPopupProps) {
  const bb = field.bounding_box;
  const [xmin, setXmin] = useState(bb.xmin);
  const [ymin, setYmin] = useState(bb.ymin);
  const [xmax, setXmax] = useState(bb.xmax);
  const [ymax, setYmax] = useState(bb.ymax);
  const [fontSize, setFontSize] = useState(field.font_size ?? defaultFontSize);
  const [fontStyle, setFontStyle] = useState(field.font_style ?? defaultFontStyle);
  const [textAlignH, setTextAlignH] = useState<"left" | "center" | "right">(
    field.text_align_h ?? defaultAlignH,
  );
  const [textAlignV, setTextAlignV] = useState<"top" | "middle" | "bottom">(
    field.text_align_v ?? defaultAlignV,
  );
  const [fontColor, setFontColor] = useState(field.font_color ?? "#0D3D3A");

  useEffect(() => {
    setXmin(bb.xmin);
    setYmin(bb.ymin);
    setXmax(bb.xmax);
    setYmax(bb.ymax);
    setFontSize(field.font_size ?? defaultFontSize);
    setFontStyle(field.font_style ?? defaultFontStyle);
    setTextAlignH(field.text_align_h ?? defaultAlignH);
    setTextAlignV(field.text_align_v ?? defaultAlignV);
    setFontColor(field.font_color ?? "#0D3D3A");
  }, [
    field.field_name,
    bb.xmin,
    bb.ymin,
    bb.xmax,
    bb.ymax,
    field.font_size,
    field.font_style,
    field.text_align_h,
    field.text_align_v,
    field.font_color,
    defaultFontSize,
    defaultFontStyle,
    defaultAlignH,
    defaultAlignV,
  ]);

  const styleUpdates = () => ({
    font_size: fontSize,
    font_style: fontStyle,
    text_align_h: textAlignH,
    text_align_v: textAlignV,
    font_color: fontColor,
  });

  const apply = () => {
    const n = (v: number) => Math.max(0, Math.min(1000, Math.round(v)));
    onUpdate({
      bounding_box: {
        xmin: n(xmin),
        ymin: n(ymin),
        xmax: n(xmax),
        ymax: n(ymax),
      },
      ...styleUpdates(),
    });
  };

  const applyToAll = () => {
    const updates = styleUpdates();
    onApplyToAll?.(updates);
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="rounded-lg border-2 border-saffron bg-saffron/5 p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <span className="label-xs text-teal flex items-center gap-1.5">
          <Move size={12} />
          Coordinates & font
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-ink-faint hover:text-ink text-xs"
        >
          ✕
        </button>
      </div>
      <p className="text-[11px] text-ink-muted">{field.semantic_label}</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-ink-faint">
          xmin
          <input
            type="number"
            min={0}
            max={1000}
            value={xmin}
            onChange={(e) => setXmin(Number(e.target.value))}
            onBlur={apply}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            className="input text-xs w-full mt-0.5"
          />
        </label>
        <label className="text-[11px] text-ink-faint">
          ymin
          <input
            type="number"
            min={0}
            max={1000}
            value={ymin}
            onChange={(e) => setYmin(Number(e.target.value))}
            onBlur={apply}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            className="input text-xs w-full mt-0.5"
          />
        </label>
        <label className="text-[11px] text-ink-faint">
          xmax
          <input
            type="number"
            min={0}
            max={1000}
            value={xmax}
            onChange={(e) => setXmax(Number(e.target.value))}
            onBlur={apply}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            className="input text-xs w-full mt-0.5"
          />
        </label>
        <label className="text-[11px] text-ink-faint">
          ymax
          <input
            type="number"
            min={0}
            max={1000}
            value={ymax}
            onChange={(e) => setYmax(Number(e.target.value))}
            onBlur={apply}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            className="input text-xs w-full mt-0.5"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-teal/10">
        <label className="text-[11px] text-ink-faint">
          Font size
          <select
            value={fontSize}
            onChange={(e) => {
              setFontSize(Number(e.target.value));
              setTimeout(apply, 0);
            }}
            className="input text-xs w-full mt-0.5"
          >
            {COORD_FONT_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}px
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-ink-faint">
          Style
          <select
            value={fontStyle}
            onChange={(e) => {
              setFontStyle(e.target.value);
              setTimeout(apply, 0);
            }}
            className="input text-xs w-full mt-0.5"
          >
            {COORD_FONT_STYLES.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-ink-faint">
          Align H
          <select
            value={textAlignH}
            onChange={(e) => {
              setTextAlignH(e.target.value as any);
              setTimeout(apply, 0);
            }}
            className="input text-xs w-full mt-0.5"
          >
            {ALIGN_H.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-ink-faint">
          Align V
          <select
            value={textAlignV}
            onChange={(e) => {
              setTextAlignV(e.target.value as any);
              setTimeout(apply, 0);
            }}
            className="input text-xs w-full mt-0.5"
          >
            {ALIGN_V.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="col-span-2">
          <span className="text-[11px] text-ink-faint block mb-1">Color</span>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                className="w-6 h-6 rounded border-2 border-teal/20 hover:border-saffron transition-colors"
                style={{
                  backgroundColor: c,
                  borderColor: fontColor === c ? "var(--saffron)" : undefined,
                }}
                onClick={() => {
                  setFontColor(c);
                  setTimeout(apply, 0);
                }}
              />
            ))}
            <input
              type="color"
              value={fontColor}
              onChange={(e) => {
                setFontColor(e.target.value);
                setTimeout(apply, 0);
              }}
              className="w-6 h-6 rounded cursor-pointer border border-teal/20"
            />
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            apply();
            onClose();
          }}
          className="btn-primary btn-sm flex-1"
        >
          Apply
        </button>
        {onApplyToAll && (
          <button
            type="button"
            onClick={applyToAll}
            className="btn-secondary btn-sm flex-1"
            title="Apply font, style, alignment & color to all fields"
          >
            Apply to all
          </button>
        )}
      </div>
    </motion.div>
  );
}

/* ── Value overlay (sample values on same image) ───── */
/** 0–1000 (per-mille) → 0–100 (%) for overlay positioning. Same scale as backend. */
function toPct(n: number) {
  return n / 10;
}

/**
 * Preview image and coordinates:
 * - Backend sends the same image used for extraction (raw_image_b64 → preview_image).
 * - Coordinates are stored as 0–1000 of page/image width and height (top-left origin).
 * - We render at whatever size fits (max-w-full); overlay uses % so alignment is correct at any zoom.
 * - Overlay container is the image wrapper (same size as <img>) so % is relative to the image.
 */

/* ── Main FieldEditor ──────────────────────────────── */

interface FieldEditorProps {
  fields: FormField[];
  previewImage: string | null;
  onChange: (fields: FormField[]) => void;
  sampleValues?: Record<string, string>;
  livePreview?: boolean;
  previewFontSize?: number;
  previewFontStyle?: string;
  previewAlignH?: "left" | "center" | "right";
  previewAlignV?: "top" | "middle" | "bottom";
  onActionStart?: () => void;
  onCommit?: () => void;
}

export default function FieldEditor({
  fields,
  previewImage,
  onChange,
  sampleValues = {},
  livePreview = false,
  previewFontSize = 14,
  previewFontStyle = "normal",
  previewAlignH = "left",
  previewAlignV = "top",
  onActionStart,
  onCommit,
}: FieldEditorProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [showCoordinatesModal, setShowCoordinatesModal] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgDims, setImgDims] = useState({ w: 800, h: 1000 });

  // Keep imgDims in sync with actual rendered image size (fixes drag accuracy after layout/resize)
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const updateDims = () => {
      setImgDims({ w: img.offsetWidth, h: img.offsetHeight });
    };
    const ro = new ResizeObserver(updateDims);
    ro.observe(img);
    return () => ro.disconnect();
  }, [previewImage]);

  const updateField = (i: number, updates: Partial<FormField>) => {
    const next = fields.map((f, idx) => (idx === i ? { ...f, ...updates } : f));
    onChange(next);
  };

  const applyStyleToAllFields = (styleUpdates: Partial<FormField>) => {
    onChange(fields.map((f) => ({ ...f, ...styleUpdates })));
  };

  const deleteField = (i: number) => {
    onChange(fields.filter((_, idx) => idx !== i));
    if (activeIdx === i) {
      setActiveIdx(null);
      setShowCoordinatesModal(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeIdx === null || activeIdx < 0 || activeIdx >= fields.length) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteField(activeIdx);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIdx, fields.length]);

  const addField = () => {
    const newField: FormField = {
      field_name: `field_${fields.length + 1}`,
      field_type: "text",
      semantic_label: "New Field",
      question_template: "Please provide your answer.",
      description: "",
      is_required: false,
      data_type: "text",
      validation_rules: {},
      bounding_box: {
        xmin: 100,
        ymin: 100 + fields.length * 80,
        xmax: 600,
        ymax: 140 + fields.length * 80,
      },
    };
    onChange([...fields, newField]);
    setActiveIdx(fields.length);
  };

  return (
    <div className="flex gap-4 h-[calc(100vh-200px)] min-h-[500px]">
      {/* Left: form image with overlays */}
      <div className="flex-1 card overflow-auto bg-cream-dark/30">
        <div className="p-3 border-b border-teal/8 flex items-center justify-between">
          <span className="label-xs text-teal">
            Form Preview — drag boxes to adjust
          </span>
          <span className="label-xs text-ink-faint">
            {fields.length} fields
          </span>
        </div>
        <div className="p-4 flex justify-center">
          {previewImage ? (
            <div
              className="relative inline-block w-fit max-w-full shadow-lift rounded"
              style={{ maxWidth: "100%" }}
            >
              <img
                ref={imgRef}
                src={previewImage}
                alt="Form"
                className="block max-w-full rounded"
                style={{ userSelect: "none", verticalAlign: "top" }}
                draggable={false}
                onLoad={() => {
                  if (imgRef.current) {
                    setImgDims({ w: imgRef.current.offsetWidth, h: imgRef.current.offsetHeight });
                  }
                }}
              />
              {/* Overlay matches image exactly (inset-0 = 100% of wrapper = image). % coords → any zoom OK. */}
              {livePreview && fields.length > 0 && (
                <div className="absolute inset-0 z-0 pointer-events-none box-border">
                  {fields.map((field) => {
                    const bb = field.bounding_box;
                    const val = sampleValues[field.field_name] ?? getSample(field);
                    if (val == null || val === "") return null;

                    // Radio/checkbox group: render mark at each selected child's bbox
                    if (field.children && field.children.length > 0) {
                      const valStr = String(val).trim().toLowerCase();
                      const isRadio = field.field_type === "radio";
                      return (
                        <React.Fragment key={field.field_name}>
                          {field.children.map((child) => {
                            const isSelected = valStr === child.label.trim().toLowerCase();
                            if (!isSelected) return null;
                            const cbb = child.bounding_box;
                            const left = toPct(cbb.xmin);
                            const top = toPct(cbb.ymin);
                            const width = toPct(cbb.xmax - cbb.xmin);
                            const height = toPct(cbb.ymax - cbb.ymin);
                            const bhDisplay = (height / 100) * imgDims.h;
                            const preferredSize = field.font_size ?? previewFontSize;
                            const displaySize =
                              preferredSize != null && preferredSize > 0
                                ? Math.max(8, Math.min(72, Math.round(preferredSize)))
                                : Math.max(8, Math.min(24, Math.round(bhDisplay * 0.7)));
                            const mark = isRadio ? "●" : "✓";
                            const color = field.font_color || "#0D3D3A";
                            return (
                              <div
                                key={child.field_name}
                                className="absolute flex items-center justify-center pointer-events-none box-border"
                                style={{
                                  left: `${left}%`,
                                  top: `${top}%`,
                                  width: `${width}%`,
                                  height: `${height}%`,
                                  fontSize: `${displaySize}px`,
                                  lineHeight: 1,
                                  color,
                                  textShadow: "0 0 1px rgba(255,255,255,0.8), 0 1px 2px rgba(0,0,0,0.1)",
                                }}
                              >
                                {mark}
                              </div>
                            );
                          })}
                        </React.Fragment>
                      );
                    }

                    const left = toPct(bb.xmin);
                    const top = toPct(bb.ymin);
                    const width = toPct(bb.xmax - bb.xmin);
                    const height = toPct(bb.ymax - bb.ymin);
                    const bhDisplay = (height / 100) * imgDims.h;
                    const preferredSize = field.font_size ?? previewFontSize;
                    const displaySize =
                      preferredSize != null && preferredSize > 0
                        ? Math.max(8, Math.min(72, Math.round(preferredSize)))
                        : Math.max(8, Math.min(48, Math.round(bhDisplay * 0.55)));
                    const style = field.font_style ?? previewFontStyle;
                    const color = field.font_color || "#0D3D3A";
                    const alignH = field.text_align_h ?? previewAlignH;
                    const alignV = field.text_align_v ?? previewAlignV;
                    const justifyContent =
                      alignH === "center"
                        ? "center"
                        : alignH === "right"
                          ? "flex-end"
                          : "flex-start";
                    const alignItems =
                      alignV === "middle"
                        ? "center"
                        : alignV === "bottom"
                          ? "flex-end"
                          : "flex-start";
                    const isCheck = field.field_type === "checkbox";
                    const displayVal = isCheck
                      ? /^(yes|true|1)$/i.test(String(val).trim())
                        ? "✓"
                        : "☐"
                      : String(val).slice(0, 80);
                    return (
                      <div
                        key={field.field_name}
                        className="absolute flex pointer-events-none box-border"
                        style={{
                          left: `${left}%`,
                          top: `${top}%`,
                          width: `${width}%`,
                          height: `${height}%`,
                          padding: "2px 6px",
                          fontSize: `${displaySize}px`,
                          fontStyle: style === "italic" ? "italic" : "normal",
                          fontWeight: style === "bold" ? "bold" : "normal",
                          overflow: "hidden",
                          color,
                          lineHeight: 1,
                          textShadow:
                            "0 0 1px rgba(255,255,255,0.8), 0 1px 2px rgba(0,0,0,0.1)",
                          justifyContent,
                          alignItems,
                        }}
                      >
                        <span
                          className="truncate block w-full"
                          style={{
                            lineHeight: 1,
                            textAlign:
                              alignH === "center"
                                ? "center"
                                : alignH === "right"
                                  ? "right"
                                  : "left",
                          }}
                        >
                          {displayVal}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Bbox overlays (draggable) */}
              {fields.map((field, i) => (
                <BboxOverlay
                  key={field.field_name + i}
                  field={field}
                  index={i}
                  isActive={activeIdx === i}
                  imgW={imgDims.w}
                  imgH={imgDims.h}
                  onUpdate={(bb) => updateField(i, { bounding_box: bb })}
                  onActivate={() => {
                    setActiveIdx(i);
                    setShowCoordinatesModal(true);
                  }}
                  onActionStart={onActionStart}
                  onCommit={onCommit}
                />
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-ink-faint text-sm">
              No preview available
            </div>
          )}
        </div>
      </div>

      {/* Right: field cards + coordinates popup */}
      <div className="w-72 xl:w-80 flex flex-col gap-3 overflow-hidden">
        <div className="flex items-center justify-between px-1">
          <span className="label-xs text-teal">
            Fields — double-click label to rename
          </span>
        </div>

        <AnimatePresence>
          {showCoordinatesModal && activeIdx !== null && fields[activeIdx] && (
            <CoordinatesPopup
              key={fields[activeIdx].field_name + activeIdx}
              field={fields[activeIdx]}
              onUpdate={(updates) => updateField(activeIdx, updates)}
              onClose={() => setShowCoordinatesModal(false)}
              onApplyToAll={applyStyleToAllFields}
              defaultFontSize={previewFontSize}
              defaultFontStyle={previewFontStyle}
              defaultAlignH={previewAlignH}
              defaultAlignV={previewAlignV}
            />
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          <Reorder.Group
            axis="y"
            values={fields}
            onReorder={onChange}
            className="space-y-2"
          >
            {fields.map((field, i) => (
              <FieldCard
                key={field.field_name + i}
                field={field}
                index={i}
                isActive={activeIdx === i}
                onActivate={() => {
                  setActiveIdx(i);
                  setShowCoordinatesModal(false);
                }}
                onUpdate={(updates) => updateField(i, updates)}
                onDelete={() => deleteField(i)}
              />
            ))}
          </Reorder.Group>
        </div>

        {/* Add field button */}
        <button
          onClick={addField}
          className="flex items-center gap-2 w-full px-4 py-3 border-2 border-dashed border-teal/20 rounded-lg text-teal/60 text-sm font-body font-medium hover:border-teal/40 hover:text-teal hover:bg-teal/3 transition-all"
        >
          <Plus size={15} />
          Add a field
        </button>
      </div>
    </div>
  );
}

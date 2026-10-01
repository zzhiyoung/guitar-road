import Link from "next/link";
import type { ReactNode } from "react";

import {
  SONG_STATUS_COLOR,
  SONG_STATUS_LABEL,
  type SongStatus,
} from "@/lib/domain/song-status";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 className="section-title">{children}</h2>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="card card-pad">
      <div className="text-[12px] font-medium text-muted">
        {label}
      </div>
      <div className="stat-value mt-3" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {sub ? <div className="mt-3 text-[12px] leading-relaxed text-muted">{sub}</div> : null}
    </div>
  );
}

export function StatusBadge({ status }: { status: SongStatus }) {
  return (
    <span
      className="chip"
      style={{
        borderColor: `${SONG_STATUS_COLOR[status]}55`,
        background: `${SONG_STATUS_COLOR[status]}18`,
        color: SONG_STATUS_COLOR[status],
      }}
    >
      {SONG_STATUS_LABEL[status]}
    </span>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="card flex flex-col items-center gap-2 px-5 py-10 text-center">
      <div className="text-2xl opacity-40" aria-hidden>
        ♪
      </div>
      <div className="text-[15px] font-semibold">{title}</div>
      {hint ? <p className="max-w-sm text-[13px] text-muted">{hint}</p> : null}
      {action ? (
        <Link href={action.href} className="btn btn-accent mt-2">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  color = "var(--color-accent)",
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

export function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "danger" | "info" | "accent";
}) {
  const map: Record<string, string> = {
    neutral: "border-line bg-surface2 text-muted",
    good: "border-good/30 bg-good-soft text-good",
    warn: "border-warn/30 bg-warn-soft text-warn",
    danger: "border-danger/30 bg-danger-soft text-danger",
    info: "border-info/30 bg-info-soft text-info",
    accent: "border-accent/30 bg-accent-soft text-accent",
  };
  return <span className={`chip ${map[tone]}`}>{children}</span>;
}

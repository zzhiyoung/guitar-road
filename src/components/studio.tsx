import type { ReactNode, SVGProps } from "react";

export type IconName = "home" | "library" | "chart" | "upload" | "play" | "pause" | "loop" | "clock" | "check" | "arrow" | "music" | "search" | "star" | "more" | "stop";
const paths: Record<IconName, string> = {
  home: "M3 10 12 3 21 10v11h-6v-7H9v7H3Z",
  library: "M4 4h16v17H4ZM8 4v17M11 8h6M11 12h6",
  chart: "M4 20V4M4 20h17M7 15l4-5 4 2 6-8",
  upload: "M12 16V3M7 8l5-5 5 5M4 15v6h16v-6",
  play: "M8 4l13 8-13 8Z", pause: "M8 5v14M16 5v14", stop: "M6 6h12v12H6Z",
  loop: "M4 8h15l-4-4M20 16H5l4 4M4 8v5M20 16v-5",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18ZM12 7v6l4 2",
  check: "M5 12l5 5L20 7", arrow: "M4 12h16M14 6l6 6-6 6",
  music: "M9 18V5l11-2v13M9 8l11-2M9 18a3 3 0 1 1-3-3h3M20 16a3 3 0 1 1-3-3h3",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 1 0 0-14ZM15 15l6 6",
  star: "M12 3l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z",
  more: "M5 12h1M11 12h1M17 12h1",
};
export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]} /></svg>;
}
export function GuitarIllustration({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 300 300" fill="none" aria-hidden="true">
    <circle cx="151" cy="159" r="113" fill="#365247" />
    <circle cx="151" cy="159" r="94" stroke="#6c8974" strokeDasharray="3 9" />
    <path d="m166 57 26-20 16 20-26 22-13 87c34 13 49 45 22 72-24 23-68 30-88 3-18-25 1-49 19-57 11-5 9-16 9-24-1-23 14-36 34-28Z" fill="#dbae7b" stroke="#edd3a3" strokeWidth="3" />
    <circle cx="150" cy="181" r="19" fill="#293e35" stroke="#f6d5a1" strokeWidth="5" />
    <path d="m181 70-18 131M177 68l-18 133M173 70l-18 131M170 72l-18 129" stroke="#f8e6c2" />
    <path d="m132 215 31-3" stroke="#544238" strokeWidth="7" strokeLinecap="round" />
    <path d="m173 54 27-8M181 63l28-8" stroke="#a6825e" strokeWidth="3" />
    <path d="M61 81v23M56 81h18M56 107a6 6 0 1 0 6-6M232 179v24M232 180l15-5v20M232 203a5 5 0 1 0 0-10M247 195a5 5 0 1 0 0-10" stroke="#d9cc9f" strokeWidth="3" />
    <path d="m225 71 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z" fill="#d9cc9f" />
  </svg>;
}
export function SongCover({ number, title, tone = 0 }: { number: string; title: string; tone?: number }) {
  return <div className={`song-cover cover-tone-${tone % 3}`} aria-hidden="true">
    <Icon name="music" /><div className="cover-orbits"><i /><i /><i /></div>
    <div className="cover-bottom"><span>{number}</span><span>{title}</span></div>
  </div>;
}
export function PageHeading({ title, hint, action }: { title: string; hint?: ReactNode; action?: ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1>{hint ? <p>{hint}</p> : null}</div>{action}</div>;
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/studio";

const NAV: { href: string; label: string; short: string; icon: IconName }[] = [
  { href: "/", label: "今日练习", short: "今日", icon: "home" },
  { href: "/library", label: "我的曲库", short: "曲库", icon: "library" },
  { href: "/dashboard", label: "成长足迹", short: "成长", icon: "chart" },
  { href: "/import", label: "导入曲谱", short: "导入", icon: "upload" },
  { href: "/creator", label: "Creator", short: "识别", icon: "star" },
];
export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // 练习页与整曲播放页都隐侧边栏，把横向空间全部留给谱面
  const practice = pathname.startsWith("/practice/") || pathname.startsWith("/play/");
  return <div className={`app-shell ${practice ? "is-practice" : ""}`}>
    <a href="#main-content" className="skip-link">跳到主要内容</a>
    <aside className="app-sidebar no-print">
      <Link href="/" className="brand"><span className="brand-mark"><Icon name="music" /></span><span>Guitar Road</span></Link>
      <p className="brand-caption">你的每日音乐时光</p>
      <nav aria-label="主要导航" className="desktop-nav">
        {NAV.map(item => { const active = item.href === "/" ? pathname === "/" || practice : pathname.startsWith(item.href);
          return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={active ? "nav-link active" : "nav-link"}><Icon name={item.icon} />{item.label}</Link>;
        })}
      </nav>
      <div className="sidebar-note"><span>♪ 一点点，也在前进</span><p>属于你的练习节奏</p></div>
    </aside>
    <header className="mobile-header no-print"><Link href="/" className="brand"><span className="brand-mark"><Icon name="music" /></span><span>Guitar Road</span></Link><span className="text-[11px] text-muted">每日音乐时光</span></header>
    <main id="main-content" className="app-main">{children}</main>
    <nav aria-label="移动端导航" className="mobile-nav no-print">
      {NAV.map(item => { const active = item.href === "/" ? pathname === "/" || practice : pathname.startsWith(item.href);
        return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={active ? "active" : ""}><Icon name={item.icon} /><span>{item.short}</span></Link>;
      })}
    </nav>
  </div>;
}

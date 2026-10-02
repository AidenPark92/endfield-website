import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  { href: "/essence", label: "기질 파밍" },
  // 추후: 오퍼레이터 DB, 데미지 계산기, 청사진
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
        <Link href="/" className="group flex items-center gap-2.5">
          {/* 로고 마크: 노란 사각 + 사선 */}
          <span className="relative grid size-7 place-items-center bg-accent text-accent-foreground">
            <span className="font-mono text-[11px] font-bold">EF</span>
            <span className="absolute -right-1 -bottom-1 size-2 bg-foreground transition-transform group-hover:translate-x-0.5 group-hover:translate-y-0.5" />
          </span>
          <span className="leading-none">
            <span className="block text-sm font-bold tracking-tight">ENDFIELD FIELD NOTE</span>
            <span className="ef-label block text-[9px]">엔드필드 공략 · 비공식</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

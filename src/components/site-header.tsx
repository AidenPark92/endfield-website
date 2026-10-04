import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { NavLink } from "@/components/nav-link";

const NAV = [
  { href: "/essence", label: "기질 파밍" },
  { href: "/operators", label: "캐릭터" },
  { href: "/gear", label: "장비" },
  // 추후: 데미지 계산기, 청사진
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:gap-6">
        <Link href="/" className="group flex shrink-0 items-center gap-2.5">
          {/* 로고 마크: 노란 사각 + 사선 */}
          <span className="relative grid size-7 place-items-center bg-accent text-accent-foreground">
            <span className="font-mono text-[11px] font-bold">EF</span>
            <span className="absolute -right-1 -bottom-1 size-2 bg-foreground transition-transform group-hover:translate-x-0.5 group-hover:translate-y-0.5" />
          </span>
          <span className="hidden leading-none sm:block">
            <span className="block text-sm font-bold tracking-tight">ENDFIELD FIELD NOTE</span>
            <span className="ef-label block text-[9px]">엔드필드 공략 · 비공식</span>
          </span>
        </Link>
        <nav className="flex items-center gap-0.5 text-sm whitespace-nowrap sm:gap-1">
          {NAV.map((n) => (
            <NavLink key={n.href} href={n.href}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

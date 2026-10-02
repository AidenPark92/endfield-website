"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** 같은 페이지에서 메뉴를 다시 눌렀을 때 페이지에 알리는 이벤트 (detail = href) */
export const NAV_RESET_EVENT = "ef:nav-reset";

/** 상단 메뉴 링크 — 현재 페이지 표시 + 같은 페이지 재클릭 시 초기화 이벤트 */
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={() => {
        if (active) window.dispatchEvent(new CustomEvent(NAV_RESET_EVENT, { detail: href }));
      }}
      className={cn(
        "px-3 py-1.5 font-medium transition-colors hover:bg-muted hover:text-foreground",
        active ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {children}
    </Link>
  );
}

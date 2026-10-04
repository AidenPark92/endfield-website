"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * 게임 용어 툴팁 — 마우스를 올리거나(데스크톱) 눌러서(모바일) 짧은 설명을 본다.
 * 키보드 포커스로도 열린다.
 */
export function Term({ children, title, desc, className }: { children: React.ReactNode; title: string; desc: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="group/term relative inline">
      <button
        type="button"
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className={cn(
          "cursor-help font-semibold underline decoration-accent decoration-dotted decoration-2 underline-offset-4 hover:decoration-solid focus-visible:outline-2 focus-visible:outline-foreground",
          className,
        )}
      >
        {children}
      </button>
      <span
        id={id}
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-full left-0 z-30 mb-2 w-max max-w-[min(22rem,80vw)] border bg-panel p-3 text-left text-[13px] leading-relaxed font-normal text-panel-foreground opacity-0 shadow-lg transition-opacity",
          "group-hover/term:opacity-100 group-focus-within/term:opacity-100",
          open && "opacity-100",
        )}
      >
        <b className="mb-1 block text-sm text-accent">{title}</b>
        {desc}
      </span>
    </span>
  );
}

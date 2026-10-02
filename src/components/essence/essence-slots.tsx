import { cn } from "@/lib/utils";
import type { EssenceTarget, StatCategory } from "@/types/game";

type LabelFn = (category: StatCategory, id: string) => string;

const SLOTS: { cat: StatCategory; name: string; bar: string; text: string }[] = [
  { cat: "base", name: "기초", bar: "bg-stat-base", text: "text-foreground" },
  { cat: "extra", name: "추가", bar: "bg-stat-extra", text: "text-stat-extra" },
  { cat: "skill", name: "스킬", bar: "bg-stat-skill", text: "text-accent-strong" },
];

/**
 * 무기가 요구하는 기질 속성 3칸 (기초 · 추가 · 스킬)
 *  - size="sm": 목록 카드 / 작은 타일
 *  - size="lg": 선택한 무기 쇼케이스
 * 3성 무기처럼 요구하지 않는 칸은 "없음"으로 흐리게 표시
 */
export function EssenceSlots({
  essence,
  label,
  size = "sm",
  className,
}: {
  essence: EssenceTarget;
  label: LabelFn;
  size?: "sm" | "lg";
  className?: string;
}) {
  const lg = size === "lg";
  return (
    <ol className={cn("grid grid-cols-3", lg ? "gap-2" : "gap-1", className)} aria-label="필요한 기질 속성 3가지">
      {SLOTS.map((s, i) => {
        const id = essence[s.cat];
        return (
          <li
            key={s.cat}
            className={cn(
              "relative flex min-w-0 flex-col overflow-hidden border bg-background",
              lg ? "px-3 pt-2.5 pb-2.5" : "px-1.5 pt-1.5 pb-1",
              !id && "opacity-40",
            )}
          >
            <span className={cn("absolute inset-x-0 top-0", lg ? "h-1" : "h-0.5", s.bar)} />
            <span className={cn("flex items-center gap-1 font-semibold text-muted-foreground", lg ? "text-[11px]" : "text-[9px]")}>
              <span className={cn("grid shrink-0 place-items-center font-mono font-bold text-background", lg ? "size-4 text-[10px]" : "size-3 text-[8px]", s.bar)}>
                {i + 1}
              </span>
              {s.name}
            </span>
            <span
              className={cn(
                "font-bold break-keep",
                lg ? "mt-1 text-base leading-snug" : "mt-0.5 text-[11px] leading-tight",
                id ? s.text : "text-muted-foreground",
              )}
            >
              {id ? label(s.cat, id) : "없음"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

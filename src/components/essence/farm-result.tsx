"use client";

import { Check, ChevronDown, Lock, Star, Trophy, X } from "lucide-react";
import { useState } from "react";
import { cn, formatPercent } from "@/lib/utils";
import type { ConfigEval, WeaponMatch } from "@/lib/calc/essence-score";
import type { StatLabelFn } from "./stat-chip";
import type { EssenceRegion, StatCategory, Weapon } from "@/types/game";

const RARITY_BAR: Record<number, string> = { 6: "bg-rarity-6", 5: "bg-rarity-5", 4: "bg-rarity-4", 3: "bg-rarity-3" };

/** 일치 등급 */
function grade(m: WeaponMatch): { text: string; tone: "perfect" | "good" | "weak" } {
  if (m.maxMatch === m.required) return { text: `완벽 (${m.required}/${m.required})`, tone: "perfect" };
  if (m.maxMatch === m.required - 1) return { text: `양호 (${m.maxMatch}/${m.required})`, tone: "good" };
  return { text: `${m.maxMatch}/${m.required}`, tone: "weak" };
}

const TONE_TEXT = {
  perfect: "text-emerald-600 dark:text-emerald-400",
  good: "text-sky-600 dark:text-sky-400",
  weak: "text-muted-foreground",
} as const;
const TONE_BOX = {
  perfect: "border-emerald-600/30 bg-emerald-500/[0.06]",
  good: "border-sky-600/25 bg-sky-500/[0.05]",
  weak: "bg-card",
} as const;

interface CardProps {
  ev: ConfigEval;
  region: EssenceRegion;
  rank: number;
  weaponById: Map<string, Weapon>;
  label: StatLabelFn;
  showWeak: boolean;
}

/** 최적 파밍 존 카드 — 우선 무기 일치 / 기타 무기 일치 / 추천 기질 선택권 */
export function BestZoneCard({ ev, region, rank, weaponById, label, showWeak }: CardProps) {
  const [expanded, setExpanded] = useState(false);
  const others = ev.others.filter((m) => showWeak || m.maxMatch >= m.required - 1);
  const shown = expanded ? others : others.slice(0, 6);
  const perfectCount = [...ev.priority, ...ev.others].filter((m) => m.maxMatch === m.required).length;
  const goodCount = [...ev.priority, ...ev.others].filter((m) => m.maxMatch === m.required - 1 && m.required === 3).length;
  const { bases, lock } = ev.config;

  return (
    <div key={`${region.id}-${lock.stat}-${bases.join()}`} className="ef-scan relative overflow-hidden border bg-card shadow-sm">
      {/* 헤더 */}
      <div className="flex items-start gap-3 bg-panel p-3 text-panel-foreground">
        <span className="grid size-10 shrink-0 place-items-center bg-accent text-accent-foreground">
          <Trophy className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold text-accent">{rank === 0 ? "최적의 파밍 존" : `후보 ${rank + 1}`}</span>
          <span className="block truncate text-base font-bold">
            {region.area} · {region.name}
          </span>
          <span className="mt-0.5 block text-xs">
            <b className="text-emerald-400">{perfectCount} 완벽</b>
            <b className="ml-2 text-sky-400">{goodCount} 양호</b>
          </span>
        </span>
        <span className="shrink-0 bg-accent/15 px-2 py-1 font-mono text-sm font-bold text-accent">{ev.score} 점</span>
      </div>

      <div className="space-y-3 p-3">
        {/* 우선 무기 */}
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold text-rarity-5">
            <Star className="size-3.5 fill-current" /> 선택 무기 일치
          </p>
          <ul className="space-y-1.5">
            {ev.priority.map((m) => (
              <WeaponRow key={m.key} m={m} w={weaponById.get(m.key)!} label={label} priority />
            ))}
          </ul>
        </div>

        {/* 기타 무기 */}
        <div className="border-t pt-3">
          <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold text-sky-600 dark:text-sky-400">
            <Check className="size-3.5" /> 기타 무기 일치 {others.length > 0 && <span className="font-mono">({others.length})</span>}
          </p>
          {others.length === 0 ? (
            <p className="text-xs text-muted-foreground">같이 챙길 수 있는 다른 무기가 없어요.</p>
          ) : (
            <ul className="space-y-1.5">
              {shown.map((m) => (
                <WeaponRow key={m.key} m={m} w={weaponById.get(m.key)!} label={label} />
              ))}
            </ul>
          )}
          {others.length > 6 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-1.5 flex w-full cursor-pointer items-center justify-center gap-1 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {expanded ? "접기" : `${others.length - 6}개 더 보기`}
              <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
            </button>
          )}
        </div>
      </div>

      {/* 추천 기질 선택권 */}
      <div className="border-t bg-panel p-3 text-panel-foreground">
        <p className="mb-2 flex items-center gap-1 text-[11px] font-bold">
          <Lock className="size-3.5 text-accent" /> 추천 기질 선택권
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {bases.map((b) => (
            <span key={b} className="border border-panel-foreground/25 px-2 py-1 text-xs">
              {label("base", b)}
            </span>
          ))}
          <span className="px-0.5 text-xs opacity-60">+</span>
          <span className="inline-flex items-center gap-1 bg-accent px-2 py-1 text-xs font-bold text-accent-foreground">
            <Lock className="size-3" />
            {label(lock.category, lock.stat)}
          </span>
        </div>
        <p className="mt-2 text-[11px] opacity-60">
          기초 3개 중 1개 무작위 · {lock.category === "extra" ? "스킬" : "추가"} 속성은 이 구역 8개 중 무작위
        </p>
      </div>
    </div>
  );
}

function WeaponRow({ m, w, label, priority = false }: { m: WeaponMatch; w: Weapon; label: StatLabelFn; priority?: boolean }) {
  const g = grade(m);
  return (
    <li className={cn("flex items-center gap-2.5 border p-2", TONE_BOX[g.tone])}>
      {/* 무기 이미지 자리 (공백) */}
      <span className="relative size-10 shrink-0 border bg-muted/60">
        <span className={cn("absolute inset-x-0 bottom-0 h-1", RARITY_BAR[w.rarity])} />
        {priority && <Star className="absolute -top-1.5 -right-1.5 size-3.5 fill-rarity-5 text-rarity-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="truncate text-sm font-semibold">{w.name}</span>
          <span className={cn("shrink-0 text-[11px] font-semibold", TONE_TEXT[g.tone])}>{g.text}</span>
        </span>
        <span className="mt-1 flex flex-wrap gap-1">
          {(["base", "extra", "skill"] as StatCategory[]).map((c) => {
            const line = m.lines[c];
            if (!line) return null;
            const ok = line.chance > 0;
            return (
              <span
                key={c}
                className={cn(
                  "inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px]",
                  ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:text-red-400",
                )}
              >
                {ok ? <Check className="size-2.5" /> : <X className="size-2.5" />}
                {label(c, line.want)}
              </span>
            );
          })}
        </span>
      </span>
      <span className="shrink-0 text-right font-mono text-[10px] text-muted-foreground">
        {m.pPerfect > 0 && <span className="block text-xs font-bold text-foreground">{formatPercent(m.pPerfect)}</span>}
        {m.pPartial > 0 && <span className="block">2/3 {formatPercent(m.pPartial)}</span>}
      </span>
    </li>
  );
}

/** 다른 후보 존 목록 (구역 + 고정 속성별 최고 설정) */
export function CandidateList({
  candidates,
  activeIndex,
  onPick,
  regionById,
  label,
}: {
  candidates: ConfigEval[];
  activeIndex: number;
  onPick: (i: number) => void;
  regionById: Map<string, EssenceRegion>;
  label: StatLabelFn;
}) {
  const max = candidates[0]?.score || 1;
  return (
    <ol className="space-y-1">
      {candidates.map((c, i) => {
        const r = regionById.get(c.config.regionId)!;
        const active = i === activeIndex;
        const n = c.others.filter((m) => m.maxMatch >= m.required - 1).length;
        return (
          <li key={`${r.id}-${c.config.lock.stat}`}>
            <button
              onClick={() => onPick(i)}
              aria-pressed={active}
              className={cn(
                "relative w-full cursor-pointer overflow-hidden border bg-card px-2.5 py-2 text-left transition-colors hover:bg-muted",
                active && "border-foreground",
              )}
            >
              <span className="absolute inset-y-0 left-0 bg-accent/15" style={{ width: `${(c.score / max) * 100}%` }} />
              <span className="relative flex items-center gap-2 text-sm">
                <span className="w-5 font-mono text-[10px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1 truncate">
                  <b>{r.name}</b> <span className="text-[10px] text-muted-foreground">{r.area}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px]">
                  <Lock className="size-3" />
                  {label(c.config.lock.category, c.config.lock.stat)}
                </span>
                <span className="w-14 shrink-0 text-right font-mono text-xs font-bold">{c.score}점</span>
              </span>
              <span className="relative mt-0.5 block pl-7 text-[10px] text-muted-foreground">기타 무기 {n}개 함께 노림</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

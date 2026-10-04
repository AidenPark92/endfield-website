"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { BREAK_LEVELS, MAX_LEVEL, milestoneStatsAt, statsAt } from "@/lib/calc/operator-stats";
import type { AttrName, OperatorStats, StatMilestones } from "@/types/game";

const QUICK_LEVELS = [1, ...BREAK_LEVELS, MAX_LEVEL];
const ATTR_ORDER: AttrName[] = ["힘", "민첩", "지능", "의지"];
const fmt = (n: number) => Math.floor(n).toLocaleString("ko-KR"); // TODO: 인게임 표시가 내림인지 반올림인지 확인

/** 레벨별 기본 능력치 — 레벨을 바꾸면 수치가 바로 바뀜 */
export function OperatorStatsPanel({ stats, milestones }: { stats?: OperatorStats; milestones?: StatMilestones }) {
  const [level, setLevel] = useState(MAX_LEVEL);
  // 레벨별 곡선(게임 테이블)이 있으면 모든 레벨, 없으면 공식 위키 6개 레벨만
  const s = stats ? statsAt(stats, level) : milestones ? milestoneStatsAt(milestones, level) : undefined;
  const mainAttr = stats?.mainAttr ?? milestones?.mainAttr;
  const subAttr = stats?.subAttr ?? milestones?.subAttr;
  if (!s) return null;
  const attrMax = Math.max(...ATTR_ORDER.map((a) => s.attrs[a]));

  return (
    <div className="border bg-card">
      {/* 레벨 선택 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b p-3">
        <span className="text-xs text-muted-foreground">레벨</span>
        <b className="w-8 font-mono text-lg tabular-nums">{level}</b>
        {stats && <input
          type="range"
          min={1}
          max={MAX_LEVEL}
          value={level}
          onChange={(e) => setLevel(Number(e.target.value))}
          aria-label="레벨"
          className="min-w-32 flex-1 cursor-pointer accent-foreground"
        />}
        {!stats && <span className="flex-1 text-[11px] text-muted-foreground">공식 위키 기준 6개 레벨 값만 있어요</span>}
        <div className="flex gap-1">
          {QUICK_LEVELS.map((lv) => (
            <button
              key={lv}
              onClick={() => setLevel(lv)}
              aria-pressed={level === lv}
              className={cn(
                "h-7 cursor-pointer border px-2 font-mono text-[11px] transition-colors",
                level === lv ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted",
              )}
            >
              {lv}
            </button>
          ))}
        </div>
      </div>

      {/* 핵심 수치 */}
      <dl className="grid grid-cols-2 divide-x border-b sm:grid-cols-4">
        <Stat k="생명력" v={fmt(s.hp)} />
        <Stat k="기본 공격력" v={fmt(s.atk)} />
        <Stat k="능력치 보너스" v={`×${s.attrBonus.toFixed(3)}`} hint={`주 ${mainAttr} · 보조 ${subAttr}`} />
        <Stat k="공격력 (능력치 반영)" v={fmt(s.atkWithAttr)} strong />
      </dl>

      {/* 능력치 */}
      <ul className="space-y-1.5 p-3">
        {ATTR_ORDER.map((a) => {
          const role = a === mainAttr ? "주" : a === subAttr ? "보조" : null;
          return (
            <li key={a} className="flex items-center gap-2 text-sm">
              <span className="w-10 shrink-0 font-medium">{a}</span>
              <span className="w-8 shrink-0 text-[10px] font-semibold text-accent-strong">{role}</span>
              <span className="relative h-2 flex-1 bg-muted">
                <span
                  className={cn("absolute inset-y-0 left-0", role ? "bg-foreground" : "bg-muted-foreground/40")}
                  style={{ width: `${(s.attrs[a] / attrMax) * 100}%` }}
                />
              </span>
              <span className="w-10 shrink-0 text-right font-mono tabular-nums">{fmt(s.attrs[a])}</span>
            </li>
          );
        })}
      </ul>

      <p className="border-t px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        치명타 확률 {Math.round(s.critRate * 100)}% · 치명타 피해 {Math.round(s.critDmg * 100)}% (기본값). 무기·장비·잠재·재능 보너스는
        포함하지 않은 캐릭터 기본치예요. 능력치 보너스 = 1 + 0.5%×주 능력치 + 0.2%×보조 능력치.
      </p>
    </div>
  );
}

function Stat({ k, v, hint, strong }: { k: string; v: string; hint?: string; strong?: boolean }) {
  return (
    <div className="p-3">
      <dt className="text-[11px] text-muted-foreground">{k}</dt>
      <dd className={cn("font-mono text-lg tabular-nums", strong && "font-bold")}>{v}</dd>
      {hint && <dd className="text-[10px] text-muted-foreground">{hint}</dd>}
    </div>
  );
}

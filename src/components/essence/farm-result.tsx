"use client";

import { Check, ChevronDown, Dices, Lock, MapPin, Sparkles, Star, Trophy } from "lucide-react";
import { useState } from "react";
import { cn, formatPercent } from "@/lib/utils";
import { expectedDrops } from "@/lib/calc/essence";
import type { ConfigEval, WeaponMatch } from "@/lib/calc/essence-score";
import { EssenceOrb } from "./essence-orb";
import type { StatLabelFn } from "./stat-chip";
import { WeaponThumb } from "./weapon-thumb";
import type { EssenceRegion, StatCategory, Weapon } from "@/types/game";

const CATS: StatCategory[] = ["base", "extra", "skill"];
const CAT_NAME: Record<StatCategory, string> = { base: "기초", extra: "추가", skill: "스킬" };
const SHOW = 9;

interface CardProps {
  ev: ConfigEval;
  region: EssenceRegion;
  rank: number;
  weaponById: Map<string, Weapon>;
  baseIds: string[];
  label: StatLabelFn;
}

/**
 * 최적 파밍 존 카드
 *  1) 추천 기질 선택권 (가장 크게)  2) 선택 무기  3) 이 파밍으로 함께 얻는 무기 기질 (강조)
 * 3줄이 전부 맞아야 쓸 수 있으므로 2줄 일치는 개수만 참고로 표시한다.
 */
export function BestZoneCard({ ev, region, rank, weaponById, baseIds, label }: CardProps) {
  const [expanded, setExpanded] = useState(false);
  const target = ev.priority[0];
  const weapon = weaponById.get(target.key)!;
  const shown = expanded ? ev.others : ev.others.slice(0, SHOW);

  return (
    <div className="ef-scan relative overflow-hidden border bg-card shadow-sm">
      {/* 헤더 */}
      <div className="flex items-center gap-3 bg-panel p-3 text-panel-foreground">
        <span className="grid size-10 shrink-0 place-items-center bg-accent text-accent-foreground">
          <Trophy className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold text-accent">{rank === 0 ? "최적의 파밍 존" : `후보 ${rank + 1}`}</span>
          <span className="block truncate text-base font-bold">
            {region.area} · {region.name}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block bg-accent/15 px-2 py-1 font-mono text-sm font-bold text-accent">{ev.score} 점</span>
          <span className="mt-0.5 block text-[10px] opacity-60">함께 얻는 무기 {ev.others.length}개</span>
        </span>
      </div>

      <div className="space-y-4 p-3">
        {/* 1) 추천 기질 선택권 */}
        <EngravePanel ev={ev} region={region} target={target} baseIds={baseIds} label={label} />

        {/* 2) 선택 무기 */}
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold text-rarity-5">
            <Star className="size-3.5 fill-current" /> 선택 무기
          </p>
          <div className="flex items-center gap-3 border border-emerald-600/30 bg-emerald-500/[0.06] p-2.5">
            <WeaponThumb weapon={weapon} size={112} className="size-14" />
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-1.5">
                <b className="truncate">{weapon.name}</b>
                <span className="shrink-0 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">3줄 일치 가능</span>
              </p>
              <LineChips m={target} label={label} />
            </div>
            <EssenceOrb skill={weapon.essence.skill} size={40} alt="목표 기질" />
          </div>
        </div>

        {/* 3) 함께 얻는 무기 기질 */}
        <div className="border-2 border-accent bg-accent/[0.07] p-3">
          <div className="mb-2.5 flex items-end justify-between gap-2">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-bold">
                <Sparkles className="size-4 text-rarity-5" /> 이 파밍으로 함께 얻는 무기 기질
              </p>
              <p className="text-[11px] text-muted-foreground">같은 설정에서 3줄이 전부 맞을 수 있는 다른 무기예요. 나오면 그대로 쓸 수 있어요.</p>
            </div>
            <span className="shrink-0 font-mono text-3xl leading-none font-bold">+{ev.others.length}</span>
          </div>

          {ev.others.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">이 설정으로 함께 얻을 수 있는 다른 무기 기질은 없어요.</p>
          ) : (
            <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((m) => (
                <BonusTile key={m.key} m={m} w={weaponById.get(m.key)!} label={label} />
              ))}
            </ul>
          )}
          {ev.others.length > SHOW && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1 py-1 text-xs font-medium hover:underline"
            >
              {expanded ? "접기" : `${ev.others.length - SHOW}개 더 보기`}
              <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
            </button>
          )}
        </div>

        {ev.partialOnly > 0 && (
          <p className="text-[11px] text-muted-foreground/70">참고: 2줄까지만 맞는 무기 {ev.partialOnly}개는 쓸 수 없는 기질이라 제외했어요.</p>
        )}
      </div>
    </div>
  );
}

/**
 * 추천 기질 선택권 — 게임의 사전 각인 화면을 그대로 옮겨서 "어떤 칸을 누르면 되는지" 보여준다.
 *  - 맨 위: 한 줄 요약 (기초 3개 + 고정 1개 → 무엇이 나오면 완성)
 *  - 아래: 게임 화면과 같은 배치의 선택 칸. 눌러야 할 칸만 노랗게, 나머지는 흐리게
 */
function EngravePanel({
  ev,
  region,
  target,
  baseIds,
  label,
}: {
  ev: ConfigEval;
  region: EssenceRegion;
  target: WeaponMatch;
  baseIds: string[];
  label: StatLabelFn;
}) {
  const { bases, lock } = ev.config;
  const randomCat = lock.category === "extra" ? "skill" : "extra";
  const randomWant = target.lines[randomCat]?.want;
  const baseWant = target.lines.base?.want;

  return (
    <div className="overflow-hidden border-2 border-accent bg-panel text-panel-foreground">
      {/* 제목 */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-accent px-3 py-2 text-accent-foreground">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <Lock className="size-4" /> 기질 선택권 이렇게 쓰세요
        </p>
        <p className="flex items-center gap-1 text-xs font-semibold">
          <MapPin className="size-3.5" /> {region.area} · {region.name}
        </p>
      </div>

      {/* 한 줄 요약 */}
      <div className="border-b border-panel-foreground/15 px-3 py-3">
        <p className="mb-2 text-[11px] font-semibold opacity-60">한눈에 보기</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {bases.map((b) => (
            <span
              key={b}
              className={cn(
                "inline-flex h-9 items-center gap-1 bg-panel-foreground/10 px-3 text-sm font-semibold",
                b === baseWant && "ring-2 ring-accent",
              )}
            >
              {b === baseWant && <Star className="size-3.5 fill-accent text-accent" />}
              {label("base", b)}
            </span>
          ))}
          <span className="px-1 text-lg font-bold opacity-50">+</span>
          <span className="inline-flex h-9 items-center gap-1.5 bg-accent px-3 text-sm font-bold text-accent-foreground">
            <Lock className="size-3.5" />
            {label(lock.category, lock.stat)}
          </span>
          {randomWant && (
            <>
              <span className="px-1 text-lg font-bold opacity-50">→</span>
              <span className="inline-flex h-9 items-center gap-1.5 border border-dashed border-accent px-3 text-sm">
                <Dices className="size-3.5 text-accent" />
                <b className="text-accent">{label(randomCat, randomWant)}</b> 나오면 완성
              </span>
            </>
          )}
        </div>
      </div>

      {/* 게임 화면 그대로 */}
      <div className="space-y-4 px-3 py-3">
        <PickGroup title="기초 속성 3개를 선택해 주세요" count={`${bases.length}/3`}>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {baseIds.map((id) => (
              <PickCell key={id} state={bases.includes(id) ? "pick" : "off"} star={id === baseWant}>
                {label("base", id)}
              </PickCell>
            ))}
          </div>
        </PickGroup>

        <PickGroup title="추가 속성 또는 스킬 속성 1개를 선택해 주세요" count="1/1">
          {(["extra", "skill"] as const).map((cat) => (
            <div key={cat} className="mt-2 first:mt-0">
              <p className="mb-1 text-[10px] font-semibold tracking-wider opacity-50">
                {CAT_NAME[cat]} 속성 {cat === lock.category ? "· 여기서 1개 고정" : "· 이 중 1개 무작위"}
              </p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {region[cat].map((id) => (
                  <PickCell
                    key={id}
                    state={cat === lock.category && id === lock.stat ? "lock" : cat === randomCat && id === randomWant ? "goal" : "off"}
                  >
                    {label(cat, id)}
                  </PickCell>
                ))}
              </div>
            </div>
          ))}
        </PickGroup>

        <p className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] opacity-60">
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 bg-accent" /> 눌러야 할 칸
          </span>
          <span className="inline-flex items-center gap-1">
            <Star className="size-3 fill-accent text-accent" /> 선택 무기에 필요한 기초 속성
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 border border-dashed border-accent" /> 무작위로 나와야 할 속성
          </span>
        </p>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-panel-foreground/15 bg-black/20 px-3 py-2.5">
        <span className="text-xs opacity-70">선택 무기 완벽 기질 확률 (기초 1/3 × 무작위 1/{region[randomCat].length})</span>
        <span>
          <b className="font-mono text-xl text-accent">{formatPercent(target.pPerfect)}</b>
          <span className="ml-1.5 text-[11px] opacity-60">약 {Math.round(expectedDrops(target.pPerfect))}개당 1개</span>
        </span>
      </div>
    </div>
  );
}

function PickGroup({ title, count, children }: { title: string; count: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold">
        {title} <span className="font-mono text-accent">({count})</span>
      </p>
      {children}
    </div>
  );
}

/** 게임 선택 칸 — pick/lock: 눌러야 할 칸, goal: 무작위로 나와야 할 칸, off: 누르지 않는 칸 */
function PickCell({ state, star = false, children }: { state: "pick" | "lock" | "goal" | "off"; star?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "relative flex h-9 items-center gap-1.5 border px-2.5 text-xs",
        state === "pick" && "border-accent bg-accent font-bold text-accent-foreground",
        state === "lock" && "border-accent bg-accent font-bold text-accent-foreground",
        state === "goal" && "border-dashed border-accent text-accent",
        state === "off" && "border-panel-foreground/10 opacity-35",
      )}
    >
      {state === "pick" && <Check className="size-3.5 shrink-0" />}
      {state === "lock" && <Lock className="size-3.5 shrink-0" />}
      {state === "goal" && <Dices className="size-3.5 shrink-0" />}
      <span className="truncate">{children}</span>
      {star && <Star className="absolute -top-1.5 -right-1.5 size-4 fill-panel stroke-[2.5] text-panel" />}
      {star && <Star className="absolute -top-1 -right-1 size-3 fill-accent text-accent" />}
    </span>
  );
}

function LineChips({ m, label }: { m: WeaponMatch; label: StatLabelFn }) {
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {CATS.map((c) => {
        const line = m.lines[c];
        if (!line) return null;
        return (
          <span key={c} className="inline-flex items-center gap-0.5 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-400">
            <Check className="size-2.5" />
            {label(c, line.want)}
          </span>
        );
      })}
    </span>
  );
}

/** 함께 얻는 무기 타일 */
function BonusTile({ m, w, label }: { m: WeaponMatch; w: Weapon; label: StatLabelFn }) {
  return (
    <li className="flex items-center gap-2 border bg-card p-2 animate-in fade-in">
      <WeaponThumb weapon={w} size={96} className="size-12" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{w.name}</p>
        <p className="truncate text-[10px] text-muted-foreground">
          {CATS.filter((c) => m.lines[c])
            .map((c) => label(c, m.lines[c]!.want))
            .join(" · ")}
        </p>
        <p className="font-mono text-[10px] font-bold">{formatPercent(m.pPerfect)}</p>
      </div>
      <EssenceOrb skill={w.essence.skill} size={30} />
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
              <span className="relative mt-0.5 block pl-7 text-[10px] text-muted-foreground">
                함께 얻는 무기 <b className="text-foreground">{c.others.length}개</b>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

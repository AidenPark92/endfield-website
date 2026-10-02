"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Check, Dices, Lock, Search, Sparkles, X } from "lucide-react";
import { cn, formatPercent } from "@/lib/utils";
import {
  BASE_PICK_COUNT,
  expectedDrops,
  explainLines,
  perfectChance,
  recommendFarming,
  type FarmConfig,
  type LineStatus,
  type LockCategory,
} from "@/lib/calc/essence";
import { LOW_TIER_ESSENCES } from "@/lib/essence-images";
import { EssenceOrb } from "./essence-orb";
import { makeStatLabel } from "./stat-chip";
import type { EssenceRegion, EssenceStats, StatCategory, Weapon, WeaponType } from "@/types/game";

const WEAPON_TYPES: (WeaponType | "전체")[] = ["전체", "한손검", "양손검", "장병기", "권총", "아츠 유닛"];
const RARITY_BG: Record<number, string> = { 6: "bg-rarity-6", 5: "bg-rarity-5", 4: "bg-rarity-4", 3: "bg-rarity-3" };
const CATEGORY_NAME: Record<StatCategory, string> = { base: "기초", extra: "추가", skill: "스킬" };

interface Props {
  weapons: Weapon[];
  regions: EssenceRegion[];
  stats: EssenceStats;
}

/** 무기 → 지역 → 사전 각인 설정을 한 화면에서 맞춰 보는 매처 */
export function EngraveMatcher({ weapons, regions, stats }: Props) {
  const label = useMemo(() => makeStatLabel(stats), [stats]);
  const baseIds = useMemo(() => stats.base.map((s) => s.id), [stats]);

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<WeaponType | "전체">("전체");
  const [showLow, setShowLow] = useState(false); // 뉴비용 3~4성 무기
  const [weaponId, setWeaponId] = useState<string | null>(null);
  const [regionId, setRegionId] = useState<string | null>(null); // null = 자동(최고 확률)
  const [manual, setManual] = useState<{ bases: string[]; lock: FarmConfig["lock"] } | null>(null);

  const weapon = weapons.find((w) => w.id === weaponId) ?? null;

  const list = weapons.filter(
    (w) =>
      (showLow || w.rarity >= 5) &&
      (typeFilter === "전체" || w.type === typeFilter) &&
      (!query.trim() || w.name.includes(query.trim())),
  );

  // 지역별 최적 설정 (확률 내림차순) + 불가 지역
  const ranking = useMemo(
    () => (weapon ? recommendFarming([{ key: weapon.id, essence: weapon.essence }], regions, baseIds) : []),
    [weapon, regions, baseIds],
  );
  const impossible = useMemo(
    () => regions.filter((r) => !ranking.some((x) => x.config.regionId === r.id)),
    [regions, ranking],
  );

  const region = (regionId && regions.find((r) => r.id === regionId)) || (ranking[0] && regions.find((r) => r.id === ranking[0].config.regionId)) || null;
  const recommended = region ? ranking.find((x) => x.config.regionId === region.id)?.config ?? null : null;

  // 현재 각인 설정: 직접 고른 값 > 추천 > (불가 지역) 임시 기본값
  const config: FarmConfig | null = region
    ? {
        regionId: region.id,
        bases: manual?.bases ?? recommended?.bases ?? baseIds.slice(0, BASE_PICK_COUNT),
        lock: manual?.lock ?? recommended?.lock ?? { category: "extra", stat: region.extra[0] },
      }
    : null;

  const chance = weapon && region && config ? perfectChance(weapon.essence, region, config) : 0;
  const lines = weapon && region && config ? explainLines(weapon.essence, region, config) : null;
  const isRecommended =
    !!recommended &&
    !!config &&
    config.lock.stat === recommended.lock.stat &&
    config.bases.length === recommended.bases.length &&
    config.bases.every((b) => recommended.bases.includes(b));

  const pickWeapon = (id: string) => {
    setWeaponId(id);
    setRegionId(null);
    setManual(null);
  };
  const pickRegion = (id: string) => {
    setRegionId(id);
    setManual(null);
  };

  const toggleBase = (id: string) => {
    if (!config) return;
    const has = config.bases.includes(id);
    if (has) {
      setManual({ bases: config.bases.filter((b) => b !== id), lock: config.lock });
    } else if (config.bases.length < BASE_PICK_COUNT) {
      setManual({ bases: [...config.bases, id], lock: config.lock });
    }
  };
  // 추가/스킬 속성은 1개만 — 이미 선택된 걸 누르면 그대로 유지(해제 불가), 다른 걸 누르면 교체
  const pickLock = (category: LockCategory, stat: string) => {
    if (!config) return;
    setManual({ bases: config.bases, lock: { category, stat } });
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
      {/* STEP 01 — 무기 */}
      <section>
        <StepHeader no="01" title="무기 선택" hint="맞추고 싶은 무기를 고르면 필요한 속성 3개가 표시돼요." />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative flex-1 sm:max-w-56">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="무기 검색"
              className="h-9 w-full border bg-card pr-3 pl-8 text-sm outline-none focus:border-foreground"
            />
          </label>
          <div className="flex flex-wrap gap-1" role="group" aria-label="무기 유형">
            {WEAPON_TYPES.map((t) => (
              <Pill key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>
                {t}
              </Pill>
            ))}
          </div>
        </div>
        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={showLow} onChange={(e) => setShowLow(e.target.checked)} className="size-3.5 accent-foreground" />
          뉴비용 3~4성 무기도 보기
        </label>

        <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {list.map((w) => {
            const active = w.id === weaponId;
            return (
              <li key={w.id}>
                <button
                  onClick={() => pickWeapon(w.id)}
                  aria-pressed={active}
                  data-active={active}
                  className={cn(
                    "ef-bracket relative flex w-full cursor-pointer flex-col border bg-card text-left transition-all hover:-translate-y-0.5 hover:shadow-md",
                    active && "border-foreground",
                  )}
                >
                  <span className={cn("absolute top-0 left-0 h-1 w-full", RARITY_BG[w.rarity])} />
                  <span className="flex items-center gap-2 p-2 pt-3">
                    <EssenceOrb skill={w.essence.skill} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{w.name}</span>
                      <span className="block text-[10px] text-muted-foreground">
                        {w.rarity}★ · {w.type}
                      </span>
                    </span>
                    {active && <Check className="size-4 shrink-0" />}
                  </span>
                  <span className="flex flex-wrap gap-1 border-t px-2 py-1.5 text-[10px] text-muted-foreground">
                    <span>{label("base", w.essence.base ?? "")}</span>
                    {w.essence.extra && <span>· {label("extra", w.essence.extra)}</span>}
                    {w.essence.skill && <span>· {label("skill", w.essence.skill)}</span>}
                  </span>
                </button>
              </li>
            );
          })}
          {list.length === 0 && <li className="col-span-full py-10 text-center text-sm text-muted-foreground">검색 결과가 없습니다.</li>}
        </ul>
      </section>

      <aside className="space-y-8 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
        {!weapon || !region || !config || !lines ? (
          <div className="ef-cut relative overflow-hidden border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
            <div className="ef-hatch absolute inset-0 text-foreground/[0.04]" />
            <p className="relative">무기를 고르면 파밍 지역과 사전 각인 설정이 여기에 표시됩니다.</p>
          </div>
        ) : (
          <>
            {/* STEP 02 — 지역 */}
            <section>
              <StepHeader no="02" title="파밍 지역" hint="확률이 높은 순서예요. 눌러서 지역을 바꿀 수 있어요." />
              <ul className="space-y-1">
                {ranking.map((r, i) => {
                  const reg = regions.find((x) => x.id === r.config.regionId)!;
                  const active = reg.id === region.id;
                  return (
                    <li key={reg.id}>
                      <button
                        onClick={() => pickRegion(reg.id)}
                        aria-pressed={active}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-2 border bg-card px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted",
                          active && "border-foreground bg-muted",
                        )}
                      >
                        <span className="w-5 font-mono text-[10px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                        <span className="flex-1 truncate font-medium">
                          {reg.name} <span className="text-[10px] font-normal text-muted-foreground">{reg.area}</span>
                        </span>
                        {i === 0 && <span className="bg-accent px-1 text-[10px] font-bold text-accent-foreground">BEST</span>}
                        <span className="font-mono text-xs">{formatPercent(r.score)}</span>
                      </button>
                    </li>
                  );
                })}
                {impossible.length > 0 && (
                  <li className="pt-1">
                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer">이 무기를 맞출 수 없는 지역 {impossible.length}곳</summary>
                      <p className="mt-1 leading-relaxed">{impossible.map((r) => r.name).join(", ")}</p>
                    </details>
                  </li>
                )}
              </ul>
            </section>

            {/* STEP 03 — 사전 각인 */}
            <section>
              <StepHeader no="03" title="사전 각인" hint="게임 속 사전 각인 화면과 같은 방식으로 골라요. (각인권 1장)" />
              <div key={`${weapon.id}-${region.id}`} className="ef-cut ef-scan relative overflow-hidden bg-panel text-panel-foreground">
                {/* 목표 기질 */}
                <div className="flex items-center gap-3 border-b border-panel-foreground/15 p-3">
                  <EssenceOrb skill={weapon.essence.skill} size={56} alt="목표 기질" />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[10px] tracking-[0.18em] opacity-60">TARGET</p>
                    <p className="truncate text-sm font-bold">{weapon.name}</p>
                    <p className="truncate text-[11px] opacity-70">
                      {region.name} · {[
                        weapon.essence.base && label("base", weapon.essence.base),
                        weapon.essence.extra && label("extra", weapon.essence.extra),
                        weapon.essence.skill && label("skill", weapon.essence.skill),
                      ]
                        .filter(Boolean)
                        .join(" / ")}
                    </p>
                  </div>
                </div>

                {/* 기초 속성 3개 */}
                <div className="space-y-2 p-3">
                  <PanelTitle>
                    기초 속성을 선택해 주세요 <Count n={config.bases.length} max={BASE_PICK_COUNT} />
                  </PanelTitle>
                  <div className="flex flex-wrap gap-1.5">
                    {stats.base.map((s) => (
                      <StatToggle
                        key={s.id}
                        active={config.bases.includes(s.id)}
                        needed={weapon.essence.base === s.id}
                        disabled={!config.bases.includes(s.id) && config.bases.length >= BASE_PICK_COUNT}
                        onClick={() => toggleBase(s.id)}
                      >
                        {s.label}
                      </StatToggle>
                    ))}
                  </div>
                </div>

                {/* 추가/스킬 1개 */}
                <div className="space-y-2 border-t border-panel-foreground/15 p-3">
                  <PanelTitle>
                    추가 속성 또는 스킬 속성 1개를 선택해 주세요 <Count n={1} max={1} />
                  </PanelTitle>
                  {(["extra", "skill"] as const).map((cat) => (
                    <div key={cat}>
                      <p className="mb-1 font-mono text-[10px] tracking-widest opacity-60">{CATEGORY_NAME[cat]} 속성 · {region[cat].length}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {region[cat].map((id) => (
                          <StatToggle
                            key={id}
                            active={config.lock.category === cat && config.lock.stat === id}
                            needed={weapon.essence[cat] === id}
                            onClick={() => pickLock(cat, id)}
                          >
                            {label(cat, id)}
                          </StatToggle>
                        ))}
                      </div>
                    </div>
                  ))}
                  <p className="flex items-center gap-1 text-[11px] opacity-60">
                    <Dices className="size-3.5" /> 고르지 않은 쪽은 이 지역 풀 8개 중 무작위로 나와요.
                  </p>
                </div>
              </div>

              {/* 결과 */}
              <div className="mt-3 border bg-card p-3">
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <p className="ef-label">완벽 기질 확률</p>
                    <p className="mt-0.5 font-mono text-3xl leading-none font-bold">{formatPercent(chance)}</p>
                  </div>
                  <p className="text-right text-xs text-muted-foreground">
                    {chance > 0 ? (
                      <>
                        기질 약 <b className="text-foreground">{Math.round(expectedDrops(chance))}개</b>당 1개
                      </>
                    ) : (
                      "이 설정으로는 맞출 수 없어요"
                    )}
                  </p>
                </div>
                <div className="mt-2 h-1.5 bg-muted">
                  <div className="ef-fill h-full bg-accent" style={{ width: `${Math.min(100, (chance / (1 / 24)) * 100)}%` }} />
                </div>

                <ul className="mt-3 space-y-1.5">
                  {(["base", "extra", "skill"] as const).map((cat) => {
                    const want = weapon.essence[cat];
                    if (!want) return null;
                    const o = lines[cat];
                    return (
                      <li key={cat} className="flex items-center gap-2 text-sm">
                        <LineIcon status={o.status} />
                        <span className="w-9 font-mono text-[10px] text-muted-foreground">{CATEGORY_NAME[cat]}</span>
                        <span className="flex-1 truncate font-medium">{label(cat, want)}</span>
                        <span className="text-[11px] text-muted-foreground">{LINE_TEXT[o.status](o.chance)}</span>
                      </li>
                    );
                  })}
                </ul>

                {!isRecommended && recommended && (
                  <button
                    onClick={() => setManual(null)}
                    className="mt-3 flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 border border-foreground text-xs font-medium transition-colors hover:bg-foreground hover:text-background"
                  >
                    <Sparkles className="size-3.5" /> 추천 설정으로 되돌리기
                  </button>
                )}
              </div>
            </section>

            {/* 뉴비용 4성 기질 안내 */}
            <section className="border border-dashed p-3">
              <p className="text-xs font-bold">뉴비용 4성 기질</p>
              <div className="mt-2 flex items-center gap-3">
                {LOW_TIER_ESSENCES.map((e) => (
                  <div key={e.id} className="flex flex-col items-center gap-0.5">
                    <Image src={e.image} alt={e.name} width={40} height={40} unoptimized className="opacity-70 grayscale" />
                    <span className="text-[10px] text-muted-foreground">{e.name.replace(" 기질", "")}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                안정·세련·순수 기질은 최대 속성까지 올릴 수 없어 초반에만 쓰고 나중에는 거의 쓰지 않아요. 위 확률은 5성 무결 기질 기준입니다.
              </p>
              {/* TODO: 4성 기질의 속성 매핑은 자료 확인 후 추가 */}
            </section>
          </>
        )}
      </aside>
    </div>
  );
}

const LINE_TEXT: Record<LineStatus, (p: number) => string> = {
  free: () => "무관",
  sure: () => "확정",
  pick: (p) => `1/${Math.round(1 / p)} 무작위`,
  random: (p) => `1/${Math.round(1 / p)} 무작위`,
  miss: () => "불가",
};

function LineIcon({ status }: { status: LineStatus }) {
  if (status === "miss") return <X className="size-4 shrink-0 text-red-500" />;
  if (status === "sure") return <Lock className="size-4 shrink-0 text-stat-skill" />;
  if (status === "free") return <Check className="size-4 shrink-0 text-muted-foreground" />;
  return <Dices className="size-4 shrink-0 text-muted-foreground" />;
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-8 cursor-pointer border px-2.5 text-xs font-medium transition-colors",
        active ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold">{children}</p>;
}

function Count({ n, max }: { n: number; max: number }) {
  return (
    <span className={cn("ml-1 font-mono", n === max ? "text-accent" : "opacity-60")}>
      ({n}/{max})
    </span>
  );
}

/** 사전 각인 화면의 속성 버튼. needed = 무기가 필요로 하는 속성 */
function StatToggle({
  active,
  needed,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  needed: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
      className={cn(
        "relative h-8 cursor-pointer border px-2.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-30",
        active
          ? "border-accent bg-accent font-bold text-accent-foreground"
          : "border-panel-foreground/25 hover:border-panel-foreground/70",
      )}
    >
      {children}
      {needed && (
        <span
          title="이 무기에 필요한 속성"
          className={cn("absolute -top-1 -right-1 size-2 rounded-full ring-2 ring-panel", active ? "bg-panel-foreground" : "bg-accent")}
        />
      )}
    </button>
  );
}

function StepHeader({ no, title, hint }: { no: string; title: string; hint?: string }) {
  return (
    <div className="mb-3 flex items-end gap-3">
      <span className="font-mono text-3xl leading-none font-bold text-foreground/15">{no}</span>
      <div className="flex-1">
        <h2 className="text-base leading-tight font-bold">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

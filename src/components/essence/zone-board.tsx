import { Dices, Lock, MapPin } from "lucide-react";
import { cn, formatPercent } from "@/lib/utils";
import { expectedDrops, type FarmPlan, type FarmRecommendation } from "@/lib/calc/essence";
import { EssenceOrb } from "./essence-orb";
import { CATEGORY_NAME } from "./weapon-picker";
import type { StatLabelFn } from "./stat-chip";
import type { EssenceRegion, EssenceStats, Weapon } from "@/types/game";

/** 기질 100개를 모았을 때 기대되는 완벽 기질 개수 (효율 표시용) */
const per100 = (score: number) => (score * 100).toFixed(score * 100 >= 10 ? 0 : 1);

/* ───────── 맵 개요: 4번 협곡 / 무릉 구역 타일 ───────── */

export interface ZoneSummary {
  region: EssenceRegion;
  /** 이 구역 최고 설정 점수 */
  best: number;
  /** 고정 속성을 바꿔 가며 얻을 수 있는 무기 수 */
  reachable: number;
  /** 추천 루트 순번 (없으면 -1) */
  routeIndex: number;
}

export function ZoneMap({
  zones,
  total,
  focusId,
  onFocus,
}: {
  zones: ZoneSummary[];
  total: number;
  focusId: string | null;
  onFocus: (id: string) => void;
}) {
  const max = Math.max(...zones.map((z) => z.best), 1e-9);
  const areas = [...new Set(zones.map((z) => z.region.area))];
  return (
    <div className="space-y-4">
      {areas.map((area) => (
        <div key={area}>
          <p className="ef-label mb-1.5 flex items-center gap-1">
            <MapPin className="size-3" /> {area}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {zones
              .filter((z) => z.region.area === area)
              .map((z) => {
                const active = z.region.id === focusId;
                const empty = z.reachable === 0;
                return (
                  <button
                    key={z.region.id}
                    onClick={() => onFocus(z.region.id)}
                    disabled={empty}
                    aria-pressed={active}
                    data-active={active}
                    className={cn(
                      "ef-bracket relative cursor-pointer border bg-card p-2 text-left transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-40 disabled:hover:bg-card",
                      active && "border-foreground bg-muted",
                    )}
                  >
                    <span className="flex items-center gap-1">
                      <span className="flex-1 truncate text-xs font-semibold">{z.region.name}</span>
                      {z.routeIndex >= 0 && (
                        <span className="bg-accent px-1 font-mono text-[10px] font-bold text-accent-foreground">
                          {z.routeIndex + 1}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 flex items-baseline justify-between text-[10px] text-muted-foreground">
                      <span>
                        무기 {z.reachable}/{total}
                      </span>
                      {!empty && <span className="font-mono">100개당 {per100(z.best)}개</span>}
                    </span>
                    <span className="mt-1 block h-1 bg-muted">
                      <span className="block h-full bg-accent transition-all" style={{ width: `${(z.best / max) * 100}%` }} />
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ───────── 구역 상세: 기질 선택권 설정 ───────── */

export function ZoneDetail({
  region,
  options,
  chosen,
  onLock,
  weaponById,
  selectedIds,
  stats,
  label,
}: {
  region: EssenceRegion;
  /** 고정 속성 후보 (점수순) */
  options: FarmRecommendation[];
  chosen: FarmRecommendation;
  onLock: (stat: string) => void;
  weaponById: Map<string, Weapon>;
  selectedIds: string[];
  stats: EssenceStats;
  label: StatLabelFn;
}) {
  const { bases, lock } = chosen.config;
  const coveredIds = new Set(chosen.covered.map((c) => c.key));
  const missed = selectedIds.filter((id) => !coveredIds.has(id));
  const randomCategory = lock.category === "extra" ? "skill" : "extra";

  return (
    <div className="space-y-3">
      {/* 기질 선택권 설정 — 게임 화면 느낌의 다크 패널 */}
      <div key={`${region.id}-${lock.stat}`} className="ef-cut ef-scan relative overflow-hidden bg-panel text-panel-foreground">
        <div className="flex items-center justify-between border-b border-panel-foreground/15 px-3 py-2.5">
          <span>
            <span className="block text-sm font-bold">{region.name}</span>
            <span className="font-mono text-[10px] tracking-[0.18em] opacity-60">{region.area} {"//"} 기질 선택권</span>
          </span>
          <span className="text-right">
            <span className="block font-mono text-lg leading-none font-bold text-accent">{per100(chosen.score)}개</span>
            <span className="text-[10px] opacity-60">기질 100개당 완벽 기질</span>
          </span>
        </div>

        <div className="space-y-3 p-3">
          <div>
            <p className="mb-1.5 text-xs font-semibold">
              기초 속성 3개 선택 <span className="font-mono text-accent">(3/3)</span>
              <span className="ml-1 font-normal opacity-60">· 그중 1개가 무작위로 붙어요</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {stats.base.map((s) => (
                <span
                  key={s.id}
                  className={cn(
                    "border px-2.5 py-1.5 text-xs",
                    bases.includes(s.id) ? "border-accent bg-accent font-bold text-accent-foreground" : "border-panel-foreground/20 opacity-35",
                  )}
                >
                  {s.label}
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold">
              {CATEGORY_NAME[lock.category]} 속성 고정 <span className="font-mono text-accent">(1/1)</span>
            </p>
            <span className="inline-flex items-center gap-1.5 bg-accent px-2.5 py-1.5 text-xs font-bold text-accent-foreground">
              <Lock className="size-3.5" />
              {label(lock.category, lock.stat)}
            </span>
            <p className="mt-2 flex items-center gap-1 text-[11px] opacity-60">
              <Dices className="size-3.5" /> {CATEGORY_NAME[randomCategory]} 속성은 이 구역 {region[randomCategory].length}개 중 무작위
            </p>
          </div>
        </div>
      </div>

      {/* 고정 속성 바꾸기 */}
      {options.length > 1 && (
        <div>
          <p className="ef-label mb-1.5">다른 고정 속성으로 바꾸기</p>
          <div className="flex flex-wrap gap-1">
            {options.slice(0, 8).map((o) => {
              const active = o.config.lock.stat === lock.stat;
              return (
                <button
                  key={o.config.lock.stat}
                  onClick={() => onLock(o.config.lock.stat)}
                  aria-pressed={active}
                  className={cn(
                    "h-7 cursor-pointer border px-2 text-xs transition-colors",
                    active ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted",
                  )}
                >
                  {label(o.config.lock.category, o.config.lock.stat)}
                  <span className="ml-1 opacity-60">· {o.covered.length}개</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 이 설정으로 얻는 무기 */}
      <ul className="divide-y border bg-card">
        {chosen.covered.map((c) => {
          const w = weaponById.get(c.key)!;
          return (
            <li key={c.key} className="flex items-center gap-2.5 p-2.5">
              <EssenceOrb skill={w.essence.skill} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{w.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {(["base", "extra", "skill"] as const)
                    .filter((k) => w.essence[k])
                    .map((k) => label(k, w.essence[k]!))
                    .join(" · ")}
                </span>
              </span>
              <span className="text-right">
                <span className="block font-mono text-sm font-bold">{formatPercent(c.chance)}</span>
                <span className="block text-[10px] text-muted-foreground">약 {Math.round(expectedDrops(c.chance))}개당 1개</span>
              </span>
            </li>
          );
        })}
      </ul>
      {missed.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">이 설정으로 못 얻는 무기:</span>{" "}
          {missed.map((id) => weaponById.get(id)!.name).join(", ")}
        </p>
      )}
    </div>
  );
}

/* ───────── 추천 루트: 선택한 무기를 모두 모으는 순서 ───────── */

export function RouteList({
  plan,
  regionById,
  weaponById,
  label,
  focus,
  onPick,
}: {
  plan: FarmPlan;
  regionById: Map<string, EssenceRegion>;
  weaponById: Map<string, Weapon>;
  label: StatLabelFn;
  focus: { regionId: string; lock: string } | null;
  onPick: (regionId: string, lock: string) => void;
}) {
  return (
    <ol className="space-y-1.5">
      {plan.steps.map((s, i) => {
        const r = regionById.get(s.config.regionId)!;
        const active = focus?.regionId === r.id && focus.lock === s.config.lock.stat;
        return (
          <li key={i}>
            <button
              onClick={() => onPick(r.id, s.config.lock.stat)}
              aria-pressed={active}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2.5 border bg-card p-2.5 text-left transition-colors hover:bg-muted",
                active && "border-foreground",
              )}
            >
              <span className={cn("grid size-7 shrink-0 place-items-center font-mono text-xs font-bold", active ? "bg-accent text-accent-foreground" : "bg-muted")}>
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {r.name} <span className="text-[10px] font-normal text-muted-foreground">{r.area}</span>
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {s.covered.map((c) => weaponById.get(c.key)!.name).join(", ")}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 border px-1.5 py-0.5 text-[11px]">
                <Lock className="size-3" />
                {label(s.config.lock.category, s.config.lock.stat)}
              </span>
            </button>
          </li>
        );
      })}
      {plan.unreachable.length > 0 && (
        <li className="border border-dashed p-2.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">파밍 불가:</span> {plan.unreachable.map((k) => weaponById.get(k)!.name).join(", ")} —
          필요한 추가·스킬 속성이 함께 나오는 구역이 없어요.
        </li>
      )}
    </ol>
  );
}

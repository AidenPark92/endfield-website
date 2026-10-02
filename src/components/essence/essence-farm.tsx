"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ArrowDown, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { planFarming, rankLocks, type FarmTarget } from "@/lib/calc/essence";
import { LOW_TIER_ESSENCES } from "@/lib/essence-images";
import { makeStatLabel } from "./stat-chip";
import { WeaponPicker } from "./weapon-picker";
import { RouteList, ZoneDetail, ZoneMap, type ZoneSummary } from "./zone-board";
import type { EssenceRegion, EssenceStats, Weapon, WeaponType } from "@/types/game";

const STORAGE_KEY = "ef:essence:v2";

interface Props {
  weapons: Weapon[];
  regions: EssenceRegion[];
  stats: EssenceStats;
}

/**
 * 기질 파밍 화면
 * 01 무기 선택 → 02 구역 효율(4번 협곡/무릉) → 03 기질 선택권 설정
 */
export function EssenceFarm({ weapons, regions, stats }: Props) {
  const label = useMemo(() => makeStatLabel(stats), [stats]);
  const baseIds = useMemo(() => stats.base.map((s) => s.id), [stats]);
  const weaponById = useMemo(() => new Map(weapons.map((w) => [w.id, w])), [weapons]);
  const regionById = useMemo(() => new Map(regions.map((r) => [r.id, r])), [regions]);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<WeaponType | "전체">("전체");
  const [showLow, setShowLow] = useState(false);
  const [focus, setFocus] = useState<{ regionId: string; lock: string | null } | null>(null);
  const [loaded, setLoaded] = useState(false);

  // 선택 복원/저장 (브라우저별 편의 기능 — 실패해도 무시)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as string[];
      setSelectedIds(saved.filter((id) => weaponById.has(id)));
    } catch {}
    setLoaded(true);
  }, [weaponById]);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedIds));
    } catch {}
  }, [selectedIds, loaded]);

  const targets: FarmTarget[] = useMemo(
    () => selectedIds.map((id) => ({ key: id, essence: weaponById.get(id)!.essence })),
    [selectedIds, weaponById],
  );

  // 구역별 고정 속성 후보 + 전체 루트
  const optionsByRegion = useMemo(
    () => new Map(regions.map((r) => [r.id, targets.length ? rankLocks(targets, r, baseIds) : []])),
    [regions, targets, baseIds],
  );
  const plan = useMemo(() => planFarming(targets, regions, baseIds), [targets, regions, baseIds]);

  const zones: ZoneSummary[] = regions.map((r) => {
    const opts = optionsByRegion.get(r.id)!;
    return {
      region: r,
      best: opts[0]?.score ?? 0,
      reachable: new Set(opts.flatMap((o) => o.covered.map((c) => c.key))).size,
      routeIndex: plan.steps.findIndex((s) => s.config.regionId === r.id),
    };
  });

  // 지금 보고 있는 구역 (기본: 루트 1번 구역)
  const focusRegionId =
    focus && optionsByRegion.get(focus.regionId)?.length ? focus.regionId : (plan.steps[0]?.config.regionId ?? null);
  const focusOptions = focusRegionId ? optionsByRegion.get(focusRegionId)! : [];
  // 고정 속성: 직접 고른 값 > 루트에서 이 구역에 쓰는 값 > 구역 최고 설정
  const stepLock = plan.steps.find((s) => s.config.regionId === focusRegionId)?.config.lock.stat;
  const wantLock = focus?.regionId === focusRegionId && focus.lock ? focus.lock : stepLock;
  const chosen = focusOptions.find((o) => o.config.lock.stat === wantLock) ?? focusOptions[0];

  const toggle = (id: string) => {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    setFocus(null);
  };
  const clear = () => {
    setSelectedIds([]);
    setFocus(null);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_440px]">
      {/* STEP 01 */}
      <section>
        <StepHeader no="01" title="무기 선택" hint="기질을 맞출 무기를 고르세요. 무기마다 필요한 속성 3개가 정해져 있어요." />
        <WeaponPicker
          weapons={weapons}
          selectedIds={selectedIds}
          onToggle={toggle}
          query={query}
          onQuery={setQuery}
          typeFilter={typeFilter}
          onTypeFilter={setTypeFilter}
          showLow={showLow}
          onShowLow={setShowLow}
          label={label}
        />
      </section>

      <aside id="result" className="scroll-mt-20 space-y-8 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
        {/* 선택한 무기 */}
        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {selectedIds.map((id) => (
              <button
                key={id}
                onClick={() => toggle(id)}
                className="inline-flex h-7 cursor-pointer items-center gap-1 border bg-card px-2 text-xs hover:bg-muted"
              >
                {weaponById.get(id)!.name} <X className="size-3 text-muted-foreground" />
              </button>
            ))}
            <Button variant="ghost" size="sm" onClick={clear}>
              <RotateCcw /> 초기화
            </Button>
          </div>
        )}

        {/* STEP 02 */}
        <section>
          <StepHeader
            no="02"
            title="파밍 구역"
            hint={
              selectedIds.length
                ? "숫자는 추천 순서예요. 구역을 누르면 기질 선택권 설정을 볼 수 있어요."
                : "무기를 고르면 구역별 효율이 표시돼요."
            }
          />
          <ZoneMap zones={zones} total={selectedIds.length} focusId={focusRegionId} onFocus={(id) => setFocus({ regionId: id, lock: null })} />
        </section>

        {/* STEP 03 */}
        <section>
          <StepHeader no="03" title="기질 선택권 설정" hint="기초 3개 + 추가/스킬 중 1개를 고정해서 파밍해요." />
          {focusRegionId && chosen ? (
            <ZoneDetail
              region={regionById.get(focusRegionId)!}
              options={focusOptions}
              chosen={chosen}
              onLock={(stat) => setFocus({ regionId: focusRegionId, lock: stat })}
              weaponById={weaponById}
              selectedIds={selectedIds}
              stats={stats}
              label={label}
            />
          ) : (
            <Placeholder text="무기를 고르면 가장 효율적인 구역의 설정이 여기에 표시됩니다." />
          )}
        </section>

        {/* 전체 루트 */}
        {plan.steps.length > 1 && (
          <section>
            <StepHeader no="04" title="전부 모으는 순서" hint={`구역 ${plan.steps.length}곳을 돌면 선택한 무기 기질을 모두 노릴 수 있어요.`} />
            <RouteList
              plan={plan}
              regionById={regionById}
              weaponById={weaponById}
              label={label}
              focus={focusRegionId && chosen ? { regionId: focusRegionId, lock: chosen.config.lock.stat } : null}
              onPick={(regionId, lock) => setFocus({ regionId, lock })}
            />
          </section>
        )}
        {plan.steps.length <= 1 && plan.unreachable.length > 0 && (
          <RouteList plan={{ steps: [], unreachable: plan.unreachable }} regionById={regionById} weaponById={weaponById} label={label} focus={null} onPick={() => {}} />
        )}

        {/* 뉴비용 4성 기질 안내 */}
        <section className="border border-dashed p-3">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {LOW_TIER_ESSENCES.map((e) => (
                <Image key={e.id} src={e.image} alt={e.name} width={32} height={32} unoptimized className="opacity-70 grayscale" />
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              <b className="text-foreground">4성 기질(안정·세련·순수)</b>은 최대 속성까지 올릴 수 없어 초반에만 써요. 위 계산은 5성 무결 기질 기준입니다.
            </p>
          </div>
          {/* TODO: 4성 기질의 속성 규칙은 자료 확인 후 추가 */}
        </section>
      </aside>

      {/* 모바일: 결과로 이동 */}
      {selectedIds.length > 0 && (
        <a
          href="#result"
          className="fixed inset-x-4 bottom-4 z-30 flex items-center justify-between bg-panel px-4 py-3 text-sm text-panel-foreground shadow-lg animate-in slide-in-from-bottom-4 lg:hidden"
        >
          <span>
            무기 <b className="text-accent">{selectedIds.length}개</b> · 구역 {plan.steps.length}곳
          </span>
          <span className="flex items-center gap-1 font-medium">
            결과 보기 <ArrowDown className="size-4" />
          </span>
        </a>
      )}
    </div>
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

function Placeholder({ text }: { text: string }) {
  return (
    <div className={cn("ef-cut relative overflow-hidden border bg-card px-4 py-10 text-center text-sm text-muted-foreground")}>
      <div className="ef-hatch absolute inset-0 text-foreground/[0.04]" />
      <p className="relative">{text}</p>
    </div>
  );
}

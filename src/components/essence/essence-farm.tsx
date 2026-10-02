"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ArrowDown, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FarmTarget } from "@/lib/calc/essence";
import { SCORE_WEIGHTS, rankConfigs, uniqueByZoneLock } from "@/lib/calc/essence-score";
import { LOW_TIER_ESSENCES } from "@/lib/essence-images";
import { makeStatLabel } from "./stat-chip";
import { WeaponPicker } from "./weapon-picker";
import { BestZoneCard, CandidateList } from "./farm-result";
import type { EssenceRegion, EssenceStats, Weapon, WeaponType } from "@/types/game";

const STORAGE_KEY = "ef:essence:v3";

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

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<WeaponType | "전체">("전체");
  const [showLow, setShowLow] = useState(false);
  const [pick, setPick] = useState(0); // 후보 index
  const [showWeak, setShowWeak] = useState(false); // 1/3 일치도 표시
  const [loaded, setLoaded] = useState(false);

  // 선택 복원/저장 (브라우저별 편의 기능 — 실패해도 무시)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && weaponById.has(saved)) setSelectedId(saved);
    } catch {}
    setLoaded(true);
  }, [weaponById]);
  useEffect(() => {
    if (!loaded) return;
    try {
      if (selectedId) localStorage.setItem(STORAGE_KEY, selectedId);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, [selectedId, loaded]);

  const targets: FarmTarget[] = useMemo(
    () => (selectedId ? [{ key: selectedId, essence: weaponById.get(selectedId)!.essence }] : []),
    [selectedId, weaponById],
  );

  // 함께 챙길 "다른 무기" = 우선 무기를 뺀 나머지 (목록 필터의 등급 기준과 같게)
  const others: FarmTarget[] = useMemo(
    () =>
      weapons
        .filter((w) => w.id !== selectedId && (showLow || w.rarity >= 5))
        .map((w) => ({ key: w.id, essence: w.essence })),
    [weapons, selectedId, showLow],
  );

  // 전수 탐색 → 구역+고정 속성별 최고 설정만 후보로
  const candidates = useMemo(
    () => uniqueByZoneLock(rankConfigs(targets, others, regions, baseIds)).slice(0, 8),
    [targets, others, regions, baseIds],
  );
  const active = candidates[Math.min(pick, candidates.length - 1)];

  const select = (id: string) => {
    setSelectedId((cur) => (cur === id ? null : id));
    setPick(0);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_440px]">
      {/* STEP 01 */}
      <section>
        <StepHeader no="01" title="무기 선택" hint="기질을 맞출 무기 하나를 고르세요. 무기마다 필요한 속성 3개가 정해져 있어요." />
        <WeaponPicker
          weapons={weapons}
          selectedId={selectedId}
          onSelect={select}
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
        {selectedId && (
          <div className="flex items-center gap-2 border bg-card px-3 py-2 text-sm">
            <span className="ef-label">TARGET</span>
            <b className="flex-1 truncate">{weaponById.get(selectedId)!.name}</b>
            <Button variant="ghost" size="sm" onClick={() => select(selectedId)}>
              <RotateCcw /> 선택 해제
            </Button>
          </div>
        )}

        {/* STEP 02 — 최적 파밍 존 */}
        <section>
          <StepHeader
            no="02"
            title="최적 파밍 존"
            hint="이 무기를 노리면서, 같이 나오는 기질로 다른 무기까지 챙기는 설정을 찾아요."
            action={
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
                <input type="checkbox" checked={showWeak} onChange={(e) => setShowWeak(e.target.checked)} className="size-3.5 accent-foreground" />
                1/3 일치도 표시
              </label>
            }
          />
          {active ? (
            <BestZoneCard
              key={`${active.config.regionId}-${active.config.lock.stat}`}
              ev={active}
              region={regionById.get(active.config.regionId)!}
              rank={Math.min(pick, candidates.length - 1)}
              weaponById={weaponById}
              label={label}
              showWeak={showWeak}
            />
          ) : (
            <Placeholder
              text={selectedId ? "이 무기를 완벽하게 얻을 수 있는 구역이 없어요." : "왼쪽에서 노릴 무기를 고르면 가장 효율적인 파밍 존이 표시됩니다."}
            />
          )}
        </section>

        {/* STEP 03 — 다른 후보 */}
        {candidates.length > 1 && (
          <section>
            <StepHeader no="03" title="다른 후보" hint="점수순이에요. 눌러서 비교해 보세요." />
            <CandidateList candidates={candidates} activeIndex={pick} onPick={setPick} regionById={regionById} label={label} />
          </section>
        )}

        {/* 점수 계산 방식 */}
        <details className="group border p-3 text-xs">
          <summary className="cursor-pointer list-none font-semibold">
            <span className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span>
            점수는 어떻게 계산하나요?
          </summary>
          <div className="mt-2 space-y-1.5 leading-relaxed text-muted-foreground">
            <p>기질 1개를 얻을 때 줄마다 따로 정해져요: 기초는 고른 3개 중 1개(1/3), 고정한 속성은 그대로, 나머지 하나는 구역 풀 8개 중 1개(1/8).</p>
            <p className="space-y-0.5 bg-muted px-2 py-1.5 font-mono text-[11px] text-foreground">
              <span className="block">점수 = {SCORE_WEIGHTS.priority} × 선택 무기 완벽 확률 ÷ 1/24</span>
              <span className="block">{"    "}+ {SCORE_WEIGHTS.otherPerfect} × 다른 무기 완벽 확률 ÷ 1/24</span>
              <span className="block">{"    "}+ {SCORE_WEIGHTS.otherPartial} × 다른 무기 2/3 확률 ÷ 9/24</span>
            </p>
            <p>
              선택한 무기를 최대 확률(1/24)로 노리면 100점이에요. 같은 기질이 다른 무기에도 맞으면 무기마다 완벽 최대 +{SCORE_WEIGHTS.otherPerfect}점, 2/3 최대 +{SCORE_WEIGHTS.otherPartial}점이 더해져요. 순위는 선택 무기 점수를 먼저 비교하고, 같으면 보너스가 큰 쪽이 위로 와요.
            </p>
            <p>12개 구역 × 고정 16가지 × 기초 조합 10가지 = 1,920가지 설정을 모두 계산해서 고릅니다.</p>
          </div>
        </details>

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
      {selectedId && (
        <a
          href="#result"
          className="fixed inset-x-4 bottom-4 z-30 flex items-center justify-between bg-panel px-4 py-3 text-sm text-panel-foreground shadow-lg animate-in slide-in-from-bottom-4 lg:hidden"
        >
          <span>
            <b className="text-accent">{weaponById.get(selectedId)!.name}</b>{active && <> · {active.score}점</>}
          </span>
          <span className="flex items-center gap-1 font-medium">
            결과 보기 <ArrowDown className="size-4" />
          </span>
        </a>
      )}
    </div>
  );
}

function StepHeader({ no, title, hint, action }: { no: string; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end gap-3">
      <span className="font-mono text-3xl leading-none font-bold text-foreground/15">{no}</span>
      <div className="flex-1">
        <h2 className="text-base leading-tight font-bold">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {action}
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

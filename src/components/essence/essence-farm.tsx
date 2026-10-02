"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Repeat, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FarmTarget } from "@/lib/calc/essence";
import { SCORE_WEIGHTS, rankConfigs, uniqueByZoneLock } from "@/lib/calc/essence-score";
import { LOW_TIER_ESSENCES } from "@/lib/essence-images";
import { StatChip, makeStatLabel, type StatLabelFn } from "./stat-chip";
import { EssenceOrb } from "./essence-orb";
import { WeaponThumb } from "./weapon-thumb";
import { NAV_RESET_EVENT } from "@/components/nav-link";
import { WeaponPicker } from "./weapon-picker";
import { BestZoneCard, CandidateList } from "./farm-result";
import type { EssenceRegion, EssenceStats, Weapon, WeaponType } from "@/types/game";



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

  // 선택한 무기는 주소(?w=무기id)에 담는다 → 브라우저 뒤로가기 시 무기 목록으로 돌아감
  const router = useRouter();
  const searchParams = useSearchParams();
  const wParam = searchParams.get("w");
  const selectedId = wParam && weaponById.has(wParam) ? wParam : null;
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<WeaponType | "전체">("전체");
  const [showLow, setShowLow] = useState(false);
  const [pick, setPick] = useState(0); // 후보 index
  const [pickerOpen, setPickerOpen] = useState(true);
  const [scrollTick, setScrollTick] = useState(0);
  const topRef = useRef<HTMLDivElement>(null);

  // 이전 선택은 저장하지 않음 — 메뉴로 들어오면 항상 무기 선택 화면부터.
  // 이미 이 페이지에 있을 때 상단 메뉴를 다시 누르면(같은 주소라 화면이 그대로 남음) 처음 상태로 되돌린다.
  useEffect(() => {
    const reset = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== "/essence") return;
      setPick(0);
      setPickerOpen(true);
      setQuery("");
      setTypeFilter("전체");
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener(NAV_RESET_EVENT, reset);
    return () => window.removeEventListener(NAV_RESET_EVENT, reset);
  }, []);

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

  // 무기가 바뀌면(선택·뒤로가기) 후보 선택과 목록 펼침 상태를 초기화
  useEffect(() => {
    setPick(0);
    setPickerOpen(false);
  }, [selectedId]);

  const select = (id: string) => {
    setPick(0);
    setPickerOpen(false);
    if (id !== selectedId) router.push(`/essence?w=${encodeURIComponent(id)}`, { scroll: false });
    setScrollTick((n) => n + 1);
  };
  const openPicker = () => {
    setPickerOpen(true);
    setScrollTick((n) => n + 1);
  };

  // 무기를 고르거나 바꾸기를 누르면 화면 맨 위(작업 영역)로 부드럽게 이동
  useEffect(() => {
    if (scrollTick === 0) return;
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [scrollTick]);

  const weapon = selectedId ? weaponById.get(selectedId)! : null;
  const showPicker = pickerOpen || !weapon;

  return (
    <div ref={topRef} className="scroll-mt-20">
      {showPicker ? (
        /* STEP 01 — 무기 선택 (전체 폭) */
        <section>
          <StepHeader
            no="01"
            title="무기 선택"
            hint="기질을 맞출 무기 하나를 고르세요. 무기마다 필요한 속성 3개가 정해져 있어요."
            action={
              weapon && (
                <Button variant="outline" size="sm" onClick={() => setPickerOpen(false)}>
                  <X /> 닫기
                </Button>
              )
            }
          />
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
      ) : (
        <div className="space-y-6">
          {/* 선택한 무기 — 접힌 상태 */}
          <TargetBar weapon={weapon} label={label} onChange={openPicker} />

          {/* 결과: 왼쪽 최적 존 / 오른쪽 후보·설명 (한 페이지 스크롤) */}
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section className="min-w-0">
              <StepHeader
                no="02"
                title="최적 파밍 존"
                hint="이 무기의 기질 3줄을 노리면서, 같은 설정으로 다른 무기 기질까지 완벽하게 얻을 수 있는 곳이에요."
              />
              {active ? (
                <BestZoneCard
                  key={`${active.config.regionId}-${active.config.lock.stat}`}
                  ev={active}
                  region={regionById.get(active.config.regionId)!}
                  rank={Math.min(pick, candidates.length - 1)}
                  weaponById={weaponById}
                  label={label}
                />
              ) : (
                <Placeholder text="이 무기를 완벽하게 얻을 수 있는 구역이 없어요." />
              )}
            </section>

            <div className="space-y-6">
              {candidates.length > 1 && (
                <section>
                  <StepHeader no="03" title="다른 후보" hint="점수순이에요. 눌러서 비교해 보세요." />
                  <CandidateList candidates={candidates} activeIndex={pick} onPick={setPick} regionById={regionById} label={label} />
                </section>
              )}

              {/* 점수 계산 방식 */}
              <details className="group border bg-card p-3 text-xs">
                <summary className="cursor-pointer list-none font-semibold">
                  <span className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span>
                  점수는 어떻게 계산하나요?
                </summary>
                <div className="mt-2 space-y-1.5 leading-relaxed text-muted-foreground">
                  <p>기질 1개를 얻을 때 줄마다 따로 정해져요: 기초는 고른 3개 중 1개(1/3), 고정한 속성은 그대로, 나머지 하나는 구역 풀 8개 중 1개(1/8).</p>
                  <p className="space-y-0.5 bg-muted px-2 py-1.5 font-mono text-[11px] text-foreground">
                    <span className="block">점수 = {SCORE_WEIGHTS.priority} × 선택 무기 완벽 확률 ÷ 1/24</span>
                    <span className="block">{"    "}+ {SCORE_WEIGHTS.otherPerfect} × 다른 무기 완벽 확률 ÷ 1/24</span>
                  </p>
                  <p>
                    선택한 무기를 최대 확률(1/24)로 노리면 100점이에요. 같은 설정에서 다른 무기의 3줄도 전부 맞을 수 있으면 무기마다 최대 +{SCORE_WEIGHTS.otherPerfect}점이 더해져요.
                    2줄만 맞는 기질은 쓸 수 없어서 점수에 넣지 않아요. 순위는 선택 무기 점수를 먼저 비교하고, 같으면 함께 얻는 무기가 많은 쪽이 위로 와요.
                  </p>
                  <p>12개 구역 × 고정 16가지 × 기초 조합 10가지 = 1,920가지 설정을 모두 계산해서 고릅니다.</p>
                </div>
              </details>

              {/* 뉴비용 4성 기질 안내 */}
              <section className="border border-dashed p-3">
                <div className="flex items-center gap-3">
                  <div className="flex shrink-0 -space-x-2">
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 선택한 무기 요약 바 — 무기 목록 대신 접혀서 표시 */
function TargetBar({ weapon, label, onChange }: { weapon: Weapon; label: StatLabelFn; onChange: () => void }) {
  return (
    <div className="ef-cut flex flex-wrap items-center gap-3 border bg-card p-3 animate-in fade-in slide-in-from-top-1">
      <WeaponThumb weapon={weapon} size={160} className="size-20" />
      <div className="min-w-0 flex-1">
        <p className="ef-label whitespace-nowrap">01 // 선택한 무기</p>
        <p className="truncate text-lg leading-tight font-bold">{weapon.name}</p>
        <p className="mt-1 flex flex-wrap items-center gap-1">
          <span className="mr-1 text-[11px] text-muted-foreground">
            {weapon.rarity}★ · {weapon.type}
          </span>
          {(["base", "extra", "skill"] as const).map((c) =>
            weapon.essence[c] ? <StatChip key={c} category={c} id={weapon.essence[c]!} label={label} showCategory /> : null,
          )}
        </p>
      </div>
      <EssenceOrb skill={weapon.essence.skill} size={48} alt="목표 기질" className="hidden sm:block" />
      <Button variant="outline" onClick={onChange} className="w-full sm:w-auto">
        <Repeat /> 무기 변경
      </Button>
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

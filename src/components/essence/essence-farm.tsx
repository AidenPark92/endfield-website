"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Megaphone, Repeat, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FarmTarget } from "@/lib/calc/essence";
import {
  SCORE_WEIGHTS,
  rankConfigs,
  uniqueByZoneLock,
} from "@/lib/calc/essence-score";
import { LOW_TIER_ESSENCES } from "@/lib/essence-images";
import { makeStatLabel, type StatLabelFn } from "./stat-chip";
import { EssenceOrb } from "./essence-orb";
import { WeaponMedia } from "./weapon-media";
import { CustomTargetPicker, type CustomTarget } from "./custom-target-picker";

/** 속성으로 직접 찾기(예고 무기)의 가상 무기 id */
const CUSTOM_ID = "custom";
import { EssenceSlots } from "./essence-slots";
import { NAV_RESET_EVENT } from "@/components/nav-link";
import { MIN_RARITY, WeaponPicker, type RarityFilter } from "./weapon-picker";
import { BestZoneCard, CandidateList } from "./farm-result";
import type {
  EssenceRegion,
  EssenceStats,
  Operator,
  Weapon,
  WeaponType,
} from "@/types/game";
import type { WeaponUser } from "@/lib/weapon-users";
import { WeaponUsersList, type WeaponUserInfo } from "./weapon-users";

interface Props {
  weapons: Weapon[];
  operators: Operator[];
  weaponUsers: Record<string, WeaponUser[]>;
  regions: EssenceRegion[];
  stats: EssenceStats;
}

/**
 * 기질 파밍 화면
 * 01 무기 선택 → 02 구역 효율(4번 협곡/무릉) → 03 기질 선택권 설정
 */
export function EssenceFarm({
  weapons,
  operators,
  weaponUsers,
  regions,
  stats,
}: Props) {
  const operatorById = useMemo(
    () => new Map(operators.map((o) => [o.id, o])),
    [operators],
  );
  const usersOf = useMemo(() => {
    const cache = new Map<string, WeaponUserInfo[]>();
    return (weaponId: string) => {
      if (!cache.has(weaponId)) {
        cache.set(
          weaponId,
          (weaponUsers[weaponId] ?? []).flatMap((user) => {
            const op = operatorById.get(user.operatorId);
            return op ? [{ op, user }] : [];
          }),
        );
      }
      return cache.get(weaponId)!;
    };
  }, [weaponUsers, operatorById]);
  const label = useMemo(() => makeStatLabel(stats), [stats]);
  const baseIds = useMemo(() => stats.base.map((s) => s.id), [stats]);
  const weaponById = useMemo(
    () => new Map(weapons.map((w) => [w.id, w])),
    [weapons],
  );
  const regionById = useMemo(
    () => new Map(regions.map((r) => [r.id, r])),
    [regions],
  );

  // 선택한 무기는 주소(?w=무기id)에 담는다 → 브라우저 뒤로가기 시 무기 목록으로 돌아감
  const router = useRouter();
  const searchParams = useSearchParams();
  const wParam = searchParams.get("w");
  const selectedId = wParam && weaponById.has(wParam) ? wParam : null;

  // 속성으로 직접 찾기(예고 무기): ?b=기초&e=추가&s=스킬&n=이름
  const statIds = useMemo(
    () => ({
      base: new Set(baseIds),
      extra: new Set(stats.extra.map((s) => s.id)),
      skill: new Set(stats.skill.map((s) => s.id)),
    }),
    [stats, baseIds],
  );
  const cb = searchParams.get("b") ?? "";
  const ce = searchParams.get("e") ?? "";
  const cs = searchParams.get("s") ?? "";
  const cName = (searchParams.get("n") ?? "").slice(0, 30);
  const customWeapon: Weapon | null = useMemo(
    () =>
      !selectedId &&
      statIds.base.has(cb) &&
      statIds.extra.has(ce) &&
      statIds.skill.has(cs)
        ? {
            id: CUSTOM_ID,
            name: cName.trim() || "예고 무기",
            rarity: 6,
            type: "한손검",
            essence: { base: cb, extra: ce, skill: cs },
            trait: "",
            cover: "",
          }
        : null,
    [selectedId, statIds, cb, ce, cs, cName],
  );
  const selectedKey = selectedId ?? (customWeapon ? CUSTOM_ID : null);
  const weaponByIdAll = useMemo(
    () =>
      customWeapon
        ? new Map(weaponById).set(CUSTOM_ID, customWeapon)
        : weaponById,
    [weaponById, customWeapon],
  );
  const [mode, setMode] = useState<"weapon" | "custom">(() =>
    searchParams.get("b") ? "custom" : "weapon",
  );
  const [customForm, setCustomForm] = useState<CustomTarget>(() => ({
    base: statIds.base.has(cb) ? cb : null,
    extra: statIds.extra.has(ce) ? ce : null,
    skill: statIds.skill.has(cs) ? cs : null,
    name: cName,
  }));
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<WeaponType | "전체">("전체");
  const [rarity, setRarity] = useState<RarityFilter>("전체");
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
      setRarity("전체");
      setMode("weapon");
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener(NAV_RESET_EVENT, reset);
    return () => window.removeEventListener(NAV_RESET_EVENT, reset);
  }, []);

  const targets: FarmTarget[] = useMemo(
    () =>
      selectedKey
        ? [
            {
              key: selectedKey,
              essence: weaponByIdAll.get(selectedKey)!.essence,
            },
          ]
        : [],
    [selectedKey, weaponByIdAll],
  );

  // 함께 챙길 "다른 무기" = 선택 무기를 뺀 4~6성 전체 (목록 등급 필터와는 무관)
  const others: FarmTarget[] = useMemo(
    () =>
      weapons
        .filter((w) => w.id !== selectedId && w.rarity >= MIN_RARITY)
        .map((w) => ({ key: w.id, essence: w.essence })),
    [weapons, selectedId],
  );

  // 전수 탐색 → 구역+고정 속성별 최고 설정만 후보로
  const candidates = useMemo(
    () =>
      uniqueByZoneLock(rankConfigs(targets, others, regions, baseIds)).slice(
        0,
        8,
      ),
    [targets, others, regions, baseIds],
  );
  const active = candidates[Math.min(pick, candidates.length - 1)];

  // 무기가 바뀌면(선택·뒤로가기) 후보 선택과 목록 펼침 상태를 초기화
  useEffect(() => {
    setPick(0);
    setPickerOpen(false);
  }, [selectedKey]);

  const select = (id: string) => {
    setPick(0);
    setPickerOpen(false);
    if (id !== selectedId)
      router.push(`/essence?w=${encodeURIComponent(id)}`, { scroll: false });
    setScrollTick((n) => n + 1);
  };
  const submitCustom = () => {
    const { base, extra, skill, name } = customForm;
    if (!base || !extra || !skill) return;
    const q = new URLSearchParams({ b: base, e: extra, s: skill });
    if (name.trim()) q.set("n", name.trim());
    setPick(0);
    setPickerOpen(false);
    router.push(`/essence?${q}`, { scroll: false });
    setScrollTick((n) => n + 1);
  };
  const openPicker = () => {
    setPickerOpen(true);
    setScrollTick((n) => n + 1);
  };

  // 무기를 고르거나 바꾸기를 누르면 화면 맨 위(작업 영역)로 부드럽게 이동
  useEffect(() => {
    if (scrollTick === 0) return;
    // 화면 전환(목록 → 결과)이 그려진 뒤 위치를 계산해 헤더(80px) 아래로 맞춘다
    requestAnimationFrame(() => {
      const el = topRef.current;
      if (!el) return;
      const y = el.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    });
  }, [scrollTick, selectedKey]);

  const weapon = selectedKey ? weaponByIdAll.get(selectedKey)! : null;
  const showPicker = pickerOpen || !weapon;

  return (
    <div ref={topRef} className="scroll-mt-20">
      {showPicker ? (
        /* STEP 01 — 무기 선택 (전체 폭) */
        <section>
          <StepHeader
            no="01"
            title={mode === "weapon" ? "무기 선택" : "속성으로 찾기"}
            hint={
              mode === "weapon"
                ? "기질을 맞출 무기 하나를 고르세요. 무기마다 필요한 속성 3개가 정해져 있어요."
                : "아직 목록에 없는 무기는 속성 3가지만 골라도 파밍 위치를 찾을 수 있어요."
            }
            action={
              weapon && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPickerOpen(false)}
                >
                  <X /> 닫기
                </Button>
              )
            }
          />
          {/* 찾는 방법 전환 */}
          <div
            className="mb-4 grid grid-cols-2 border bg-card p-1 sm:inline-grid sm:w-auto"
            role="tablist"
            aria-label="찾는 방법"
          >
            {(
              [
                ["weapon", "무기 목록에서 고르기", "출시된 무기"],
                ["custom", "속성으로 직접 찾기", "출시 예고 무기"],
              ] as const
            ).map(([m, title, sub]) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  "cursor-pointer px-4 py-2 text-left transition-colors",
                  mode === m
                    ? "bg-foreground text-background"
                    : "hover:bg-muted",
                )}
              >
                <span className="block text-sm font-bold">{title}</span>
                <span
                  className={cn(
                    "block text-[10px]",
                    mode === m ? "opacity-70" : "text-muted-foreground",
                  )}
                >
                  {sub}
                  {m === "custom" && (
                    <span className="ml-1 bg-accent px-1 font-bold text-accent-foreground">
                      NEW
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>

          {mode === "custom" ? (
            <CustomTargetPicker
              value={customForm}
              onChange={setCustomForm}
              onSubmit={submitCustom}
              stats={stats}
              regions={regions}
              weapons={weapons}
              label={label}
            />
          ) : (
            <WeaponPicker
              weapons={weapons}
              usersOf={usersOf}
              selectedId={selectedId}
              onSelect={select}
              query={query}
              onQuery={setQuery}
              typeFilter={typeFilter}
              onTypeFilter={setTypeFilter}
              rarity={rarity}
              onRarity={setRarity}
              label={label}
            />
          )}
        </section>
      ) : (
        <div className="space-y-6">
          {/* 선택한 무기 — 접힌 상태 */}
          {selectedKey === CUSTOM_ID ? (
            <CustomTargetBar
              weapon={weapon}
              label={label}
              onChange={() => {
                setMode("custom");
                openPicker();
              }}
            />
          ) : (
            <TargetBar
              weapon={weapon}
              users={usersOf(weapon.id)}
              label={label}
              onChange={() => {
                setMode("weapon");
                openPicker();
              }}
            />
          )}

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
                  usersOf={usersOf}
                  key={`${active.config.regionId}-${active.config.lock.stat}`}
                  ev={active}
                  region={regionById.get(active.config.regionId)!}
                  rank={Math.min(pick, candidates.length - 1)}
                  weaponById={weaponByIdAll}
                  baseIds={baseIds}
                  label={label}
                />
              ) : (
                <Placeholder text="이 무기를 완벽하게 얻을 수 있는 구역이 없어요." />
              )}
            </section>

            <div className="space-y-6">
              {candidates.length > 1 && (
                <section>
                  <StepHeader
                    no="03"
                    title="다른 후보"
                    hint="점수순이에요. 눌러서 비교해 보세요."
                  />
                  <CandidateList
                    candidates={candidates}
                    activeIndex={pick}
                    onPick={setPick}
                    regionById={regionById}
                    label={label}
                  />
                </section>
              )}

              {/* 점수 계산 방식 */}
              <details className="group border bg-card p-3 text-xs">
                <summary className="cursor-pointer list-none font-semibold">
                  <span className="mr-1 inline-block transition-transform group-open:rotate-90">
                    ▸
                  </span>
                  점수는 어떻게 계산하나요?
                </summary>
                <div className="mt-2 space-y-1.5 leading-relaxed text-muted-foreground">
                  <p>
                    기질 1개를 얻을 때 줄마다 따로 정해져요: 기초는 고른 3개 중
                    1개(1/3), 고정한 속성은 그대로, 나머지 하나는 구역 풀 8개 중
                    1개(1/8).
                  </p>
                  <p className="space-y-0.5 bg-muted px-2 py-1.5 font-mono text-[11px] text-foreground">
                    <span className="block">
                      점수 = {SCORE_WEIGHTS.priority} × 선택 무기 완벽 확률 ÷
                      1/24
                    </span>
                    <span className="block">
                      {"    "}+ {SCORE_WEIGHTS.otherPerfect} × 다른 무기 완벽
                      확률 ÷ 1/24
                    </span>
                  </p>
                  <p>
                    선택한 무기를 최대 확률(1/24)로 노리면 100점이에요. 같은
                    설정에서 다른 무기의 3줄도 전부 맞을 수 있으면 무기마다 최대
                    +{SCORE_WEIGHTS.otherPerfect}점이 더해져요. 2줄만 맞는
                    기질은 쓸 수 없어서 점수에 넣지 않아요. 순위는 선택 무기
                    점수를 먼저 비교하고, 같으면 함께 얻는 무기가 많은 쪽이 위로
                    와요.
                  </p>
                  <p>
                    12개 구역 × 고정 16가지 × 기초 조합 10가지 = 1,920가지
                    설정을 모두 계산해서 고릅니다.
                  </p>
                </div>
              </details>

              {/* 뉴비용 4성 기질 안내 */}
              <section className="border border-dashed p-3">
                <div className="flex items-center gap-3">
                  <div className="flex shrink-0 -space-x-2">
                    {LOW_TIER_ESSENCES.map((e) => (
                      <Image
                        key={e.id}
                        src={e.image}
                        alt={e.name}
                        width={32}
                        height={32}
                        unoptimized
                        className="opacity-70 grayscale"
                      />
                    ))}
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    <b className="text-foreground">4성 기질(안정·세련·순수)</b>
                    은 최대 속성까지 올릴 수 없어 초반에만 써요. 위 계산은 5성
                    무결 기질 기준입니다.
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
/** 속성으로 찾기 결과 상단 — 예고 무기는 이미지가 없어 목표 기질 구슬을 크게 보여준다 */
function CustomTargetBar({
  weapon,
  label,
  onChange,
}: {
  weapon: Weapon;
  label: StatLabelFn;
  onChange: () => void;
}) {
  return (
    <div className="ef-cut grid overflow-hidden border bg-card animate-in fade-in slide-in-from-top-1 sm:grid-cols-[minmax(0,420px)_1fr]">
      <div className="relative grid aspect-video place-items-center bg-gradient-to-br from-muted/30 to-muted">
        <span className="absolute inset-x-0 top-0 h-1 bg-accent" />
        <span className="absolute top-3 left-3 inline-flex items-center gap-1 bg-accent px-2 py-1 text-[11px] font-bold text-accent-foreground">
          <Megaphone className="size-3.5" /> 출시 예고 · 속성으로 찾기
        </span>
        <EssenceOrb skill={weapon.essence.skill} size={140} alt="목표 기질" />
      </div>

      <div className="flex flex-col justify-between gap-4 p-4 sm:p-5">
        <div>
          <p className="ef-label whitespace-nowrap">01 // 직접 입력한 무기</p>
          <p className="mt-1 text-2xl leading-tight font-bold tracking-tight">
            {weapon.name}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            공지된 속성 3가지로 계산했어요. 출시 후 실제 정보와 다를 수 있어요.
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-bold">
            필요한 기질 속성 3가지{" "}
            <span className="font-normal text-muted-foreground">
              · 3줄이 전부 맞아야 써요
            </span>
          </p>
          <EssenceSlots essence={weapon.essence} label={label} size="lg" />
        </div>

        <Button
          variant="outline"
          onClick={onChange}
          className="w-full sm:w-auto sm:self-start"
        >
          <Repeat /> 속성 다시 고르기
        </Button>
      </div>
    </div>
  );
}

function TargetBar({
  weapon,
  users,
  label,
  onChange,
}: {
  weapon: Weapon;
  users: WeaponUserInfo[];
  label: StatLabelFn;
  onChange: () => void;
}) {
  return (
    <div className="ef-cut grid overflow-hidden border bg-card animate-in fade-in slide-in-from-top-1 sm:grid-cols-[minmax(0,420px)_1fr]">
      {/* 회전 연출 */}
      <WeaponMedia
        weapon={weapon}
        mode="auto"
        className="aspect-video w-full"
      />

      <div className="flex flex-col justify-between gap-4 p-4 sm:p-5">
        <div>
          <p className="ef-label whitespace-nowrap">01 // 선택한 무기</p>
          <p className="mt-1 text-2xl leading-tight font-bold tracking-tight">
            {weapon.name}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {weapon.rarity}★ · {weapon.type}
            {weapon.trait && <> · {weapon.trait}</>}
          </p>
        </div>

        {/* 필요한 기질 속성 3가지 */}
        <div>
          <p className="mb-1.5 flex items-center gap-2 text-xs font-bold">
            <EssenceOrb
              skill={weapon.essence.skill}
              size={28}
              alt="목표 기질"
            />
            이 무기에 필요한 기질 속성 3가지
            <span className="font-normal text-muted-foreground">
              · 3줄이 전부 맞아야 써요
            </span>
          </p>
          <EssenceSlots essence={weapon.essence} label={label} size="lg" />
        </div>

        {/* 이 무기를 쓰는 오퍼레이터 */}
        <div>
          <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">
            이 무기를 쓰는 오퍼레이터 (위키 게임 내 추천)
          </p>
          <WeaponUsersList users={users} />
        </div>

        <Button
          variant="outline"
          onClick={onChange}
          className="w-full sm:w-auto sm:self-start"
        >
          <Repeat /> 무기 변경
        </Button>
      </div>
    </div>
  );
}

function StepHeader({
  no,
  title,
  hint,
  action,
}: {
  no: string;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end gap-3">
      <span className="font-mono text-3xl leading-none font-bold text-foreground/15">
        {no}
      </span>
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
    <div
      className={cn(
        "ef-cut relative overflow-hidden border bg-card px-4 py-10 text-center text-sm text-muted-foreground",
      )}
    >
      <div className="ef-hatch absolute inset-0 text-foreground/[0.04]" />
      <p className="relative">{text}</p>
    </div>
  );
}

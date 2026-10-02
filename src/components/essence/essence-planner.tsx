"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { planFarming } from "@/lib/calc/essence";
import { OperatorPicker } from "./operator-picker";
import { SelectionList, type Selection } from "./selection-list";
import { FarmingResult } from "./farming-result";
import { makeStatLabel } from "./stat-chip";
import type { EssenceRegion, EssenceStats, Operator, Weapon, WeaponType } from "@/types/game";

const STORAGE_KEY = "ef:essence-planner:v1";

interface Props {
  operators: Operator[];
  weapons: Weapon[];
  regions: EssenceRegion[];
  stats: EssenceStats;
}

export function EssencePlanner({ operators, weapons, regions, stats }: Props) {
  const operatorById = useMemo(() => new Map(operators.map((o) => [o.id, o])), [operators]);
  const weaponById = useMemo(() => new Map(weapons.map((w) => [w.id, w])), [weapons]);
  const regionById = useMemo(() => new Map(regions.map((r) => [r.id, r])), [regions]);
  const label = useMemo(() => makeStatLabel(stats), [stats]);
  const baseIds = useMemo(() => stats.base.map((s) => s.id), [stats]);

  const [selections, setSelections] = useState<Selection[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<WeaponType | "전체">("전체");
  const [openStep, setOpenStep] = useState(0);
  const [altByStep, setAltByStep] = useState<Record<number, number>>({});
  const [loaded, setLoaded] = useState(false);

  // 이전 선택 복원 (브라우저별 편의 기능 — 실패해도 무시)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as Selection[];
      setSelections(saved.filter((s) => operatorById.has(s.operatorId) && weaponById.has(s.weaponId)));
    } catch {}
    setLoaded(true);
  }, [operatorById, weaponById]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selections));
    } catch {}
  }, [selections, loaded]);

  const plan = useMemo(
    () =>
      planFarming(
        selections.map((s) => ({ key: s.operatorId, essence: weaponById.get(s.weaponId)!.essence })),
        regions,
        baseIds,
      ),
    [selections, weaponById, regions, baseIds],
  );

  // 선택이 바뀌면 루트를 처음 상태로 되돌림
  const update = (next: Selection[]) => {
    setSelections(next);
    setOpenStep(0);
    setAltByStep({});
  };

  const toggle = (id: string) => {
    if (selections.some((s) => s.operatorId === id)) {
      update(selections.filter((s) => s.operatorId !== id));
    } else {
      const op = operatorById.get(id)!;
      update([...selections, { operatorId: id, weaponId: op.recommendedWeapons.skill[0] }]);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
      {/* STEP 01 */}
      <section>
        <StepHeader no="01" title="오퍼레이터 선택" hint="기질을 맞춰 줄 오퍼레이터를 여러 명 골라 보세요." />
        <OperatorPicker
          operators={operators}
          selectedIds={selections.map((s) => s.operatorId)}
          query={query}
          onQuery={setQuery}
          typeFilter={typeFilter}
          onTypeFilter={setTypeFilter}
          onToggle={toggle}
        />
      </section>

      <aside className="space-y-8 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
        {/* STEP 02 */}
        <section>
          <StepHeader
            no="02"
            title="무기 확인"
            hint="게임 내 추천 무기가 기본으로 들어가요."
            action={
              selections.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => update([])}>
                  <RotateCcw /> 초기화
                </Button>
              )
            }
          />
          <SelectionList
            selections={selections}
            operatorById={operatorById}
            weaponById={weaponById}
            weapons={weapons}
            label={label}
            onWeapon={(opId, wId) => update(selections.map((s) => (s.operatorId === opId ? { ...s, weaponId: wId } : s)))}
            onRemove={(opId) => update(selections.filter((s) => s.operatorId !== opId))}
          />
        </section>

        {/* STEP 03 */}
        <section id="route" className="scroll-mt-20">
          <StepHeader
            no="03"
            title="파밍 루트"
            hint={
              plan.steps.length > 0
                ? `각인 설정 ${plan.steps.length}가지로 ${selections.length - plan.unreachable.length}명의 기질을 모두 노릴 수 있어요.`
                : "한 번의 각인으로 가장 많은 무기를 노리는 순서로 정렬돼요."
            }
          />
          <FarmingResult
            plan={plan}
            openStep={openStep}
            onOpenStep={setOpenStep}
            altByStep={altByStep}
            onAlt={(step, alt) => setAltByStep((m) => ({ ...m, [step]: alt }))}
            selections={selections}
            operatorById={operatorById}
            weaponById={weaponById}
            regionById={regionById}
            label={label}
          />
        </section>
      </aside>

      {/* 모바일: 선택 후 결과로 바로 이동하는 하단 바 */}
      {selections.length > 0 && (
        <a
          href="#route"
          className="fixed inset-x-4 bottom-4 z-30 flex items-center justify-between bg-panel px-4 py-3 text-sm text-panel-foreground shadow-lg animate-in slide-in-from-bottom-4 lg:hidden"
        >
          <span>
            <b className="text-accent">{selections.length}명</b> 선택 · 루트 {plan.steps.length}단계
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

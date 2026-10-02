"use client";

import { useMemo } from "react";
import { Check, MapPin, Megaphone, Search, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { regionsForPair } from "@/lib/calc/essence";
import { EssenceOrb } from "./essence-orb";
import { EssenceSlots } from "./essence-slots";
import type { StatLabelFn } from "./stat-chip";
import type {
  EssenceRegion,
  EssenceStats,
  StatCategory,
  Weapon,
} from "@/types/game";

export interface CustomTarget {
  base: string | null;
  extra: string | null;
  skill: string | null;
  /** 무기 이름 (선택) */
  name: string;
}

const GROUPS: {
  cat: StatCategory;
  no: number;
  title: string;
  bar: string;
  hint: string;
}[] = [
  {
    cat: "base",
    no: 1,
    title: "기초 속성",
    bar: "bg-stat-base",
    hint: "힘·민첩·지능·의지·주요 능력치 중 1개",
  },
  {
    cat: "extra",
    no: 2,
    title: "추가 속성",
    bar: "bg-stat-extra",
    hint: "공격력·피해 증가 등 1개",
  },
  {
    cat: "skill",
    no: 3,
    title: "스킬 속성",
    bar: "bg-stat-skill",
    hint: "강공·억제 등 1개",
  },
];

/**
 * 속성으로 직접 찾기 — 출시 예고 무기처럼 아직 목록에 없는 무기를
 * 공개된 속성 3가지만으로 파밍 위치를 찾는다.
 */
export function CustomTargetPicker({
  value,
  onChange,
  onSubmit,
  stats,
  regions,
  weapons,
  label,
}: {
  value: CustomTarget;
  onChange: (v: CustomTarget) => void;
  onSubmit: () => void;
  stats: EssenceStats;
  regions: EssenceRegion[];
  weapons: Weapon[];
  label: StatLabelFn;
}) {
  const { base, extra, skill } = value;
  const done = !!(base && extra && skill);

  // 추가·스킬이 함께 나오는 구역 (기초 속성은 어느 구역이든 고를 수 있어 위치와 무관)
  const zones = useMemo(
    () => (extra || skill ? regionsForPair(extra, skill, regions) : []),
    [extra, skill, regions],
  );
  // 이미 출시된 무기 중 같은 조합
  const same = useMemo(
    () =>
      done
        ? weapons.filter(
            (w) =>
              w.essence.base === base &&
              w.essence.extra === extra &&
              w.essence.skill === skill,
          )
        : [],
    [done, weapons, base, extra, skill],
  );

  const set = (cat: StatCategory, id: string) =>
    onChange({ ...value, [cat]: value[cat] === id ? null : id });

  return (
    <div className="space-y-4">
      {/* 안내 */}
      <div className="flex gap-3 border-l-4 border-accent bg-card p-3">
        <Megaphone className="mt-0.5 size-4 shrink-0 text-accent-strong" />
        <p className="text-sm leading-relaxed">
          <b>출시 예고된 무기</b>처럼 아직 목록에 없는 무기는, 공지에 나온{" "}
          <b>속성 3가지</b>를 순서대로 고르면 어디서 파밍해야 하는지 바로
          알려드려요.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* 속성 고르기 */}
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">
              무기 이름 (선택)
            </span>
            <input
              value={value.name}
              onChange={(e) => onChange({ ...value, name: e.target.value })}
              placeholder="예: 예고된 신규 무기 이름"
              maxLength={30}
              className="h-9 w-full border bg-card px-3 text-sm outline-none focus:border-foreground sm:max-w-80"
            />
          </label>

          {GROUPS.map((g) => (
            <div key={g.cat}>
              <p className="mb-1.5 flex items-center gap-1.5 text-sm font-bold">
                <span
                  className={cn(
                    "grid size-5 place-items-center font-mono text-[11px] text-background",
                    g.bar,
                  )}
                >
                  {g.no}
                </span>
                {g.title} 1개를 골라 주세요
                <span className="font-mono text-xs font-normal text-muted-foreground">
                  ({value[g.cat] ? 1 : 0}/1)
                </span>
                <span className="hidden text-xs font-normal text-muted-foreground sm:inline">
                  · {g.hint}
                </span>
              </p>
              <div
                className={cn(
                  "grid gap-1.5",
                  g.cat === "base"
                    ? "grid-cols-2 sm:grid-cols-5"
                    : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4",
                )}
              >
                {stats[g.cat].map((s) => {
                  const on = value[g.cat] === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => set(g.cat, s.id)}
                      aria-pressed={on}
                      className={cn(
                        "relative flex h-10 cursor-pointer items-center gap-1.5 border px-2.5 text-left text-xs transition-colors",
                        on
                          ? "border-accent bg-accent font-bold text-accent-foreground"
                          : "bg-card hover:border-foreground/40",
                      )}
                    >
                      {g.cat === "skill" && (
                        <EssenceOrb skill={s.id} size={22} />
                      )}
                      <span className="min-w-0 flex-1 truncate">{s.label}</span>
                      {on && <Check className="size-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* 미리보기 + 찾기 */}
        <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <div className="border bg-card p-3">
            <p className="mb-2 flex items-center gap-2 text-xs font-bold">
              <EssenceOrb skill={skill} size={26} />
              {value.name.trim() || "예고 무기"}에 필요한 기질
            </p>
            <EssenceSlots
              essence={{ base, extra, skill }}
              label={label}
              size="lg"
            />

            {/* 위치 미리보기 */}
            <div className="mt-3 border-t pt-3 text-xs">
              {!extra && !skill ? (
                <p className="text-muted-foreground">
                  추가·스킬 속성을 고르면 파밍할 수 있는 구역이 바로 표시돼요.
                </p>
              ) : zones.length > 0 ? (
                <>
                  <p className="mb-1.5 flex items-center gap-1 font-semibold">
                    <MapPin className="size-3.5 text-accent-strong" />
                    {extra && skill
                      ? "두 속성이 함께 나오는 구역"
                      : "이 속성이 나오는 구역"}{" "}
                    <b className="font-mono">{zones.length}곳</b>
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {zones.map((r) => (
                      <span
                        key={r.id}
                        className="border bg-background px-1.5 py-0.5 text-[11px]"
                      >
                        {r.name}{" "}
                        <span className="text-muted-foreground">{r.area}</span>
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <p className="flex items-start gap-1.5 text-red-600 dark:text-red-400">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />이
                  추가·스킬 속성이 함께 나오는 구역이 없어요. 속성을 다시 확인해
                  주세요.
                </p>
              )}
            </div>

            {same.length > 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                같은 조합의 기존 무기:{" "}
                <b className="text-foreground">
                  {same.map((w) => w.name).join(", ")}
                </b>{" "}
                — 같은 기질을 그대로 쓸 수 있어요.
              </p>
            )}

            <Button
              variant="accent"
              className="mt-3 w-full"
              disabled={!done || zones.length === 0}
              onClick={onSubmit}
            >
              <Search />{" "}
              {done ? "파밍 위치 찾기" : "속성 3가지를 모두 골라 주세요"}
            </Button>
          </div>
        </aside>
      </div>
      {/* 모바일: 다 고르면 하단에 바로 찾기 버튼 */}
      {done && zones.length > 0 && (
        <div className="fixed inset-x-4 bottom-4 z-30 animate-in slide-in-from-bottom-4 lg:hidden">
          <Button variant="accent" className="h-12 w-full shadow-lg" onClick={onSubmit}>
            <Search /> 파밍 위치 찾기 · {zones.length}곳
          </Button>
        </div>
      )}
    </div>
  );
}

import { Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { EssenceOrb } from "./essence-orb";
import type { StatLabelFn } from "./stat-chip";
import type { Weapon, WeaponType } from "@/types/game";

const WEAPON_TYPES: (WeaponType | "전체")[] = ["전체", "한손검", "양손검", "장병기", "권총", "아츠 유닛"];
const RARITY_BG: Record<number, string> = { 6: "bg-rarity-6", 5: "bg-rarity-5", 4: "bg-rarity-4", 3: "bg-rarity-3" };

export const CATEGORY_NAME = { base: "기초", extra: "추가", skill: "스킬" } as const;
const CATEGORY_DOT = { base: "bg-stat-base", extra: "bg-stat-extra", skill: "bg-stat-skill" } as const;

interface Props {
  weapons: Weapon[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  query: string;
  onQuery: (q: string) => void;
  typeFilter: WeaponType | "전체";
  onTypeFilter: (t: WeaponType | "전체") => void;
  showLow: boolean;
  onShowLow: (v: boolean) => void;
  label: StatLabelFn;
}

/** 무기 선택 그리드 — 이미지는 비워 두고, 무기마다 고정된 3가지 기질 속성을 보여준다 */
export function WeaponPicker(props: Props) {
  const { weapons, selectedId, onSelect, query, onQuery, typeFilter, onTypeFilter, showLow, onShowLow, label } = props;
  const q = query.trim();
  const list = weapons.filter(
    (w) => (showLow || w.rarity >= 5) && (typeFilter === "전체" || w.type === typeFilter) && (!q || w.name.includes(q)),
  );

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1 sm:max-w-56">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="무기 검색"
            className="h-9 w-full border bg-card pr-3 pl-8 text-sm outline-none focus:border-foreground"
          />
        </label>
        <div className="flex flex-wrap gap-1" role="group" aria-label="무기 유형">
          {WEAPON_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => onTypeFilter(t)}
              aria-pressed={typeFilter === t}
              className={cn(
                "h-8 cursor-pointer border px-2.5 text-xs font-medium transition-colors",
                typeFilter === t ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={showLow} onChange={(e) => onShowLow(e.target.checked)} className="size-3.5 accent-foreground" />
        뉴비용 3~4성 무기도 보기
      </label>

      <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
        {list.map((w) => {
          const active = w.id === selectedId;
          return (
            <li key={w.id}>
              <button
                onClick={() => onSelect(w.id)}
                aria-pressed={active}
                data-active={active}
                className={cn(
                  "ef-bracket relative flex w-full cursor-pointer flex-col border bg-card text-left transition-all hover:-translate-y-0.5 hover:shadow-md",
                  active && "border-foreground",
                )}
              >
                {/* 무기 이미지 자리 (공백) */}
                <span className="relative block h-16 border-b bg-muted/60">
                  <span className={cn("absolute top-0 left-0 h-1 w-full", RARITY_BG[w.rarity])} />
                  <span className="absolute bottom-1.5 left-2 font-mono text-[10px] text-muted-foreground">
                    {w.rarity}★ · {w.type}
                  </span>
                  {active && (
                    <span className="absolute top-2 right-2 grid size-6 place-items-center bg-accent text-accent-foreground animate-in zoom-in-50">
                      <Check className="size-4" />
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1 px-2 pt-2">
                  <span className="flex-1 truncate text-sm font-semibold">{w.name}</span>
                </span>
                {/* 고정 3속성 + 목표 기질 */}
                <span className="flex items-end gap-2 px-2 pt-1 pb-2">
                  <span className="min-w-0 flex-1 space-y-0.5">
                    {(["base", "extra", "skill"] as const).map((c) =>
                      w.essence[c] ? (
                        <span key={c} className="flex items-center gap-1.5 text-[11px]">
                          <span className={cn("size-1.5 shrink-0", CATEGORY_DOT[c])} />
                          <span className="w-6 shrink-0 text-muted-foreground">{CATEGORY_NAME[c]}</span>
                          <span className="truncate">{label(c, w.essence[c]!)}</span>
                        </span>
                      ) : null,
                    )}
                  </span>
                  <EssenceOrb skill={w.essence.skill} size={32} alt="목표 기질" />
                </span>
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="col-span-full py-10 text-center text-sm text-muted-foreground">검색 결과가 없습니다.</li>}
      </ul>
    </div>
  );
}

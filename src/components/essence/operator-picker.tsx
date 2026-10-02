import Image from "next/image";
import { Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Operator, WeaponType } from "@/types/game";

const WEAPON_TYPES: (WeaponType | "전체")[] = ["전체", "한손검", "양손검", "장병기", "권총", "아츠 유닛"];

const RARITY_BG: Record<number, string> = {
  6: "bg-rarity-6",
  5: "bg-rarity-5",
  4: "bg-rarity-4",
  3: "bg-rarity-3",
};

interface Props {
  operators: Operator[];
  selectedIds: string[];
  query: string;
  onQuery: (q: string) => void;
  typeFilter: WeaponType | "전체";
  onTypeFilter: (t: WeaponType | "전체") => void;
  onToggle: (id: string) => void;
}

export function OperatorPicker({ operators, selectedIds, query, onQuery, typeFilter, onTypeFilter, onToggle }: Props) {
  const q = query.trim();
  const list = operators.filter(
    (o) => (typeFilter === "전체" || o.weaponType === typeFilter) && (!q || o.name.includes(q)),
  );

  return (
    <div>
      {/* 검색 + 무기 유형 필터 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1 sm:max-w-56">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="오퍼레이터 검색"
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

      {/* 오퍼레이터 그리드 */}
      <ul className="mt-4 grid grid-cols-4 gap-1.5 sm:grid-cols-5 sm:gap-2 md:grid-cols-6">
        {list.map((o) => {
          const order = selectedIds.indexOf(o.id);
          const active = order >= 0;
          return (
            <li key={o.id}>
              <button
                onClick={() => onToggle(o.id)}
                data-active={active}
                aria-pressed={active}
                className={cn(
                  "ef-bracket group relative block w-full cursor-pointer border bg-card text-left transition-all",
                  "hover:-translate-y-0.5 hover:shadow-md",
                  active && "border-foreground",
                )}
              >
                <div className="relative aspect-[3/4] overflow-hidden bg-muted">
                  <Image
                    src={o.cover}
                    alt={o.name}
                    fill
                    sizes="(min-width:768px) 140px, 25vw"
                    className={cn(
                      "object-cover object-top transition-all duration-300 group-hover:scale-105",
                      active ? "" : "saturate-[0.85]",
                    )}
                    unoptimized
                  />
                  {/* 희귀도 바 */}
                  <span className={cn("absolute top-0 left-0 h-1 w-full", RARITY_BG[o.rarity])} />
                  {/* 선택 순번 */}
                  {active && (
                    <span className="absolute top-2 right-2 grid size-6 place-items-center bg-accent font-mono text-xs font-bold text-accent-foreground animate-in zoom-in-50">
                      {order + 1}
                    </span>
                  )}
                  <span className="absolute bottom-1.5 left-1.5 bg-black/60 px-1 font-mono text-[10px] text-white">
                    {o.rarity}★
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1 px-1.5 py-1 sm:px-2 sm:py-1.5">
                  <span className="truncate text-xs font-semibold sm:text-sm">{o.name}</span>
                  {active ? (
                    <Check className="size-3.5 shrink-0" />
                  ) : (
                    <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:inline">{o.weaponType}</span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="col-span-full py-10 text-center text-sm text-muted-foreground">검색 결과가 없습니다.</li>}
      </ul>
    </div>
  );
}

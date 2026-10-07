import { Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { EssenceOrb } from "./essence-orb";
import { WeaponThumb } from "./weapon-thumb";
import { EssenceSlots } from "./essence-slots";
import { WeaponUsersInline, type WeaponUserInfo } from "./weapon-users";
import type { StatLabelFn } from "./stat-chip";
import type { Weapon, WeaponType } from "@/types/game";

/** 목록에 보이는 등급: 4~6성 (3성은 기질 줄이 3개가 아니라 제외) */
export const MIN_RARITY = 4;
export type RarityFilter = "전체" | 6 | 5 | 4;
const RARITY_FILTERS: RarityFilter[] = ["전체", 6, 5, 4];
const RARITY_DOT: Record<number, string> = { 6: "bg-rarity-6", 5: "bg-rarity-5", 4: "bg-rarity-4" };
export const matchRarity = (r: number, f: RarityFilter) => (f === "전체" ? r >= MIN_RARITY : r === f);

const WEAPON_TYPES: (WeaponType | "전체")[] = ["전체", "한손검", "양손검", "장병기", "권총", "아츠 유닛"];

interface Props {
  weapons: Weapon[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  query: string;
  onQuery: (q: string) => void;
  typeFilter: WeaponType | "전체";
  onTypeFilter: (t: WeaponType | "전체") => void;
  rarity: RarityFilter;
  onRarity: (r: RarityFilter) => void;
  label: StatLabelFn;
  usersOf: (weaponId: string) => WeaponUserInfo[];
}

/** 무기 선택 그리드 — 이미지는 비워 두고, 무기마다 고정된 3가지 기질 속성을 보여준다 */
export function WeaponPicker(props: Props) {
  const { weapons, usersOf, selectedId, onSelect, query, onQuery, typeFilter, onTypeFilter, rarity, onRarity, label } = props;
  const q = query.trim();
  // 검색: 무기 이름 또는 그 무기를 쓰는 오퍼레이터 이름
  const list = weapons.filter(
    (w) =>
      matchRarity(w.rarity, rarity) &&
      (typeFilter === "전체" || w.type === typeFilter) &&
      (!q || w.name.includes(q) || usersOf(w.id).some(({ op }) => op.name.includes(q))),
  );

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1 sm:max-w-64">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="무기 · 오퍼레이터 이름 검색"
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
      {/* 등급 필터 (4~6성) */}
      <div className="mt-3 flex flex-wrap items-center gap-1" role="group" aria-label="무기 등급">
        <span className="mr-1 text-xs text-muted-foreground">등급</span>
        {RARITY_FILTERS.map((r) => (
          <button
            key={r}
            onClick={() => onRarity(r)}
            aria-pressed={rarity === r}
            className={cn(
              "inline-flex h-8 cursor-pointer items-center gap-1.5 border px-2.5 text-xs font-medium transition-colors",
              rarity === r ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted",
            )}
          >
            {r !== "전체" && <span className={cn("size-2", RARITY_DOT[r])} />}
            {r === "전체" ? "전체 (4~6성)" : `${r}성`}
          </button>
        ))}
      </div>

      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {list.map((w) => (
          <WeaponCard key={w.id} w={w} users={usersOf(w.id)} active={w.id === selectedId} onSelect={onSelect} label={label} />
        ))}
        {list.length === 0 && <li className="col-span-full py-10 text-center text-sm text-muted-foreground">검색 결과가 없습니다.</li>}
      </ul>
    </div>
  );
}

/** 무기 카드 — 무기 아이콘(PNG) 사용, 영상은 쓰지 않음 */
function WeaponCard({
  w,
  users,
  active,
  onSelect,
  label,
}: {
  w: Weapon;
  users: WeaponUserInfo[];
  active: boolean;
  onSelect: (id: string) => void;
  label: StatLabelFn;
}) {
  return (
    <li>
      <button
        onClick={() => onSelect(w.id)}
        aria-pressed={active}
        data-active={active}
        className={cn(
          "ef-bracket group relative flex w-full cursor-pointer flex-col overflow-hidden border bg-card text-left transition-all hover:-translate-y-0.5 hover:shadow-lg",
          active && "border-foreground",
        )}
      >
        <WeaponThumb
          weapon={w}
          size={256}
          bar="top"
          className="aspect-video w-full border-0 border-b bg-gradient-to-b from-muted/40 to-muted [&_img]:transition-transform [&_img]:duration-300 group-hover:[&_img]:scale-110"
        >
          <span className="absolute bottom-1.5 left-2 bg-black/55 px-1.5 py-0.5 font-mono text-[10px] text-white">
            {w.rarity}★ · {w.type}
          </span>
          {active && (
            <span className="absolute top-2 right-2 grid size-6 place-items-center bg-accent text-accent-foreground animate-in zoom-in-50">
              <Check className="size-4" />
            </span>
          )}
        </WeaponThumb>
        <span className="block px-2.5 pt-2 pb-2.5">
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-bold">{w.name}</span>
            <EssenceOrb skill={w.essence.skill} size={26} alt="목표 기질" />
          </span>
          {/* 필요한 기질 속성 3가지 */}
          <EssenceSlots essence={w.essence} label={label} className="mt-1.5" />
        </span>
        {/* 이 무기를 쓰는 오퍼레이터 */}
        <WeaponUsersInline users={users} className="border-t px-2.5 py-1.5" />
      </button>
    </li>
  );
}

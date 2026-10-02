"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { RotateCcw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { CLASSES, ELEMENTS, ELEMENT_BG, RARITY_BG } from "@/lib/operator-meta";
import type { Operator, WeaponType } from "@/types/game";

const WEAPON_TYPES: WeaponType[] = ["한손검", "양손검", "장병기", "권총", "아츠 유닛"];
const RARITIES = [6, 5, 4] as const;

type Multi = Set<string>;

/** 캐릭터 목록 + 필터 (속성 · 직업 · 무기 · 등급 · 진영) */
export function OperatorBrowser({ operators }: { operators: Operator[] }) {
  const [query, setQuery] = useState("");
  const [elements, setElements] = useState<Multi>(new Set());
  const [classes, setClasses] = useState<Multi>(new Set());
  const [weaponTypes, setWeaponTypes] = useState<Multi>(new Set());
  const [rarities, setRarities] = useState<Multi>(new Set());
  const [faction, setFaction] = useState("전체");

  const factions = useMemo(() => ["전체", ...new Set(operators.map((o) => o.faction))], [operators]);
  const q = query.trim();
  const has = (s: Multi, v: string) => s.size === 0 || s.has(v);

  const list = operators.filter(
    (o) =>
      (!q || o.name.includes(q)) &&
      has(elements, o.element) &&
      has(classes, o.profile?.class ?? "") &&
      has(weaponTypes, o.weaponType) &&
      has(rarities, String(o.rarity)) &&
      (faction === "전체" || o.faction === faction),
  );

  const filtered = q || elements.size || classes.size || weaponTypes.size || rarities.size || faction !== "전체";
  const reset = () => {
    setQuery("");
    setElements(new Set());
    setClasses(new Set());
    setWeaponTypes(new Set());
    setRarities(new Set());
    setFaction("전체");
  };

  return (
    <div>
      {/* 필터 */}
      <div className="space-y-2.5 border bg-card p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-48 flex-1 sm:max-w-64">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="캐릭터 이름 검색"
              className="h-9 w-full border bg-background pr-3 pl-8 text-sm outline-none focus:border-foreground"
            />
          </label>
          <select
            value={faction}
            onChange={(e) => setFaction(e.target.value)}
            aria-label="진영"
            className="h-9 cursor-pointer border bg-background px-2 text-sm outline-none focus:border-foreground"
          >
            {factions.map((f) => (
              <option key={f} value={f}>
                {f === "전체" ? "진영 전체" : f}
              </option>
            ))}
          </select>
          <span className="ml-auto text-xs text-muted-foreground">
            <b className="font-mono text-sm text-foreground">{list.length}</b> / {operators.length}명
          </span>
          {filtered && (
            <button onClick={reset} className="inline-flex h-8 cursor-pointer items-center gap-1 px-2 text-xs hover:bg-muted">
              <RotateCcw className="size-3.5" /> 초기화
            </button>
          )}
        </div>

        <FilterRow label="속성">
          {ELEMENTS.map((e) => (
            <Chip key={e} active={elements.has(e)} onClick={() => setElements(toggle(elements, e))}>
              <span className={cn("size-2 rounded-full", ELEMENT_BG[e])} />
              {e}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="직업">
          {CLASSES.map((c) => (
            <Chip key={c} active={classes.has(c)} onClick={() => setClasses(toggle(classes, c))}>
              {c}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="무기">
          {WEAPON_TYPES.map((w) => (
            <Chip key={w} active={weaponTypes.has(w)} onClick={() => setWeaponTypes(toggle(weaponTypes, w))}>
              {w}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="등급">
          {RARITIES.map((r) => (
            <Chip key={r} active={rarities.has(String(r))} onClick={() => setRarities(toggle(rarities, String(r)))}>
              <span className={cn("size-2", RARITY_BG[r])} />
              {r}성
            </Chip>
          ))}
        </FilterRow>
      </div>

      {/* 목록 */}
      <ul className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
        {list.map((o) => (
          <li key={o.id}>
            <Link
              href={`/operators/${o.id}`}
              className="ef-bracket group relative block overflow-hidden border bg-card transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <span className="relative block aspect-[4/5] overflow-hidden bg-muted">
                {o.face && (
                  <Image
                    src={o.face}
                    alt={o.name}
                    fill
                    sizes="(min-width:1280px) 160px, (min-width:768px) 20vw, 33vw"
                    unoptimized
                    className="object-cover object-top transition-transform duration-300 group-hover:scale-105"
                  />
                )}
                <span className={cn("absolute inset-x-0 bottom-0 h-1", RARITY_BG[o.rarity])} />
                <span className={cn("absolute top-1.5 left-1.5 grid size-5 place-items-center text-[10px] font-bold text-white", ELEMENT_BG[o.element])}>
                  {o.element[0]}
                </span>
                <span className="absolute top-1.5 right-1.5 bg-black/60 px-1 font-mono text-[10px] text-white">{o.rarity}★</span>
              </span>
              <span className="block px-2 py-1.5">
                <span className="block truncate text-sm font-bold">{o.name}</span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {o.profile?.class} · {o.weaponType}
                </span>
              </span>
            </Link>
          </li>
        ))}
        {list.length === 0 && <li className="col-span-full py-12 text-center text-sm text-muted-foreground">조건에 맞는 캐릭터가 없어요.</li>}
      </ul>
    </div>
  );
}

function toggle(s: Multi, v: string): Multi {
  const n = new Set(s);
  if (n.has(v)) n.delete(v);
  else n.add(v);
  return n;
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={label}>
      <span className="w-10 shrink-0 text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 cursor-pointer items-center gap-1.5 border px-2.5 text-xs font-medium transition-colors",
        active ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

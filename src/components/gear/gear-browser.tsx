"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Rich } from "@/components/rich-text";
import { GearCard, SlotHeader } from "@/components/gear/gear-card";
import { formatGearValue, gearTier, pieceStats, type AttrTypes } from "@/lib/calc/gear-stats";
import type { GearPiece, GearSuit } from "@/types/build";

type GearImages = { pieces: Record<string, string>; suits: Record<string, string> };
const SLOTS = ["방어구", "장갑", "부품"];
/** 피해·전투 관련 옵션 (필터 칩) */
const STAT_FILTERS: { label: string; types: number[] }[] = [
  { label: "치명타", types: [9, 10] },
  { label: "배틀 스킬 피해", types: [32] },
  { label: "연계 스킬 피해", types: [33] },
  { label: "궁극기 피해", types: [28] },
  { label: "궁극기 에너지", types: [44] },
  { label: "물리 피해", types: [50] },
  { label: "아츠 속성 피해", types: [51, 52, 53, 54] },
  { label: "아츠 강도", types: [87] },
  { label: "불균형 대상 피해", types: [61] },
  { label: "치유", types: [29] },
];

/** 장비 전체 — 세트별 카드 + 세트 없는 장비, 부위·옵션·검색 필터, 단조 단계 선택 */
export function GearBrowser({
  pieces,
  suits,
  attrTypes,
  images,
}: {
  pieces: Record<string, GearPiece>;
  suits: Record<string, GearSuit>;
  attrTypes: AttrTypes;
  images: GearImages;
}) {
  const [q, setQ] = useState("");
  const [slot, setSlot] = useState<number | null>(null);
  const [stat, setStat] = useState<string | null>(null);
  const [forge, setForge] = useState(0);
  const [topOnly, setTopOnly] = useState(true);

  const statTypes = STAT_FILTERS.find((f) => f.label === stat)?.types;
  const match = (id: string, p: GearPiece) =>
    (!topOnly || p.minWearLv >= 70) &&
    (slot === null || p.partType === slot) &&
    (!statTypes || p.attrs.some((a) => statTypes.includes(a.attrType))) &&
    (!q || (p.name ?? "").includes(q) || (p.suitId && (suits[p.suitId]?.name ?? "").includes(q)) || id.includes(q));

  const groups = useMemo(() => {
    const bySuit = new Map<string | null, [string, GearPiece][]>();
    for (const [id, p] of Object.entries(pieces)) {
      if (!match(id, p)) continue;
      const k = p.suitId && suits[p.suitId] ? p.suitId : null;
      bySuit.set(k, [...(bySuit.get(k) ?? []), [id, p]]);
    }
    const suitOrder = Object.entries(suits).sort((a, b) => b[1].tier - a[1].tier || (a[1].name ?? "").localeCompare(b[1].name ?? "", "ko"));
    return { suitOrder: suitOrder.filter(([sid]) => bySuit.has(sid)), bySuit };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces, suits, q, slot, stat, topOnly]);

  const total = [...groups.bySuit.values()].reduce((n, l) => n + l.length, 0);

  return (
    <div>
      {/* 필터 */}
      <div className="space-y-2.5 border bg-card p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-48 flex-1 sm:max-w-64">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="장비 · 세트 이름 검색"
              className="h-9 w-full border bg-background pr-3 pl-8 text-sm outline-none focus:border-foreground"
            />
          </label>
          <Chip active={topOnly} onClick={() => setTopOnly(!topOnly)}>
            최고 등급(70레벨)만
          </Chip>
          <span className="ml-auto flex items-center gap-1 text-xs">
            <span className="mr-1 text-muted-foreground">단조</span>
            {[0, 1, 2, 3].map((f) => (
              <Chip key={f} active={forge === f} onClick={() => setForge(f)}>
                {f}
              </Chip>
            ))}
          </span>
        </div>
        <Row label="부위">
          <Chip active={slot === null} onClick={() => setSlot(null)}>
            전체
          </Chip>
          {SLOTS.map((s, i) => (
            <Chip key={s} active={slot === i} onClick={() => setSlot(slot === i ? null : i)}>
              {s}
            </Chip>
          ))}
        </Row>
        <Row label="옵션">
          {STAT_FILTERS.map((f) => (
            <Chip key={f.label} active={stat === f.label} onClick={() => setStat(stat === f.label ? null : f.label)}>
              {f.label}
            </Chip>
          ))}
        </Row>
        <p className="text-xs text-muted-foreground">
          <b className="font-mono text-sm text-foreground">{total}</b>개 장비
        </p>
      </div>

      {/* 세트 — 인게임 세트 효과 패널 + 장비 카드 */}
      <div className="mt-5 space-y-4">
        {groups.suitOrder.map(([sid, s]) => {
          const list = groups.bySuit.get(sid) ?? [];
          const eff = s.effects.find((e) => e.pieces === 3) ?? s.effects[0];
          return (
            <section key={sid} className="border bg-card">
              <header className="grid gap-3 border-b p-4 md:grid-cols-[minmax(0,16rem)_1fr] md:gap-6">
                <div className="flex items-center gap-3">
                  <GearCard src={images.suits[sid]} tier={s.tier} compact className="size-16 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 rounded-full bg-muted py-1 pr-3 pl-2.5">
                      <span className="size-2.5 shrink-0 rounded-full border-2 border-accent-strong" />
                      <h2 className="truncate text-lg font-bold">{s.name}</h2>
                    </div>
                    <p className="mt-1 pl-1 font-mono text-[11px] text-muted-foreground">
                      T{s.tier} · {list.length}종{eff ? ` · ${eff.pieces}개 세트` : ""}
                    </p>
                  </div>
                </div>
                {eff && (
                  <div className="flex gap-2 text-[14px] leading-6">
                    <span className="mt-2 size-2 shrink-0 rounded-full border-2 border-accent-strong" />
                    <Rich template={eff.desc} bb={eff.bb} className="whitespace-pre-line" />
                  </div>
                )}
              </header>
              <PieceGrid list={list} forge={forge} attrTypes={attrTypes} images={images.pieces} />
            </section>
          );
        })}

        {/* 세트 없는 장비 */}
        {(groups.bySuit.get(null)?.length ?? 0) > 0 && (
          <section className="border bg-card">
            <header className="border-b px-4 py-3">
              <h2 className="text-lg font-bold">세트 없는 장비</h2>
            </header>
            <PieceGrid list={groups.bySuit.get(null)!} forge={forge} attrTypes={attrTypes} images={images.pieces} />
          </section>
        )}
      </div>
      {total === 0 && <p className="py-12 text-center text-sm text-muted-foreground">조건에 맞는 장비가 없어요.</p>}
    </div>
  );
}

/** 장비 카드 격자 — 부위 헤더 · 인게임 카드 · 이름 · 옵션 */
function PieceGrid({ list, forge, attrTypes, images }: { list: [string, GearPiece][]; forge: number; attrTypes: AttrTypes; images: Record<string, string> }) {
  const sorted = [...list].sort((a, b) => a[1].partType - b[1].partType || b[1].minWearLv - a[1].minWearLv || (a[1].name ?? "").localeCompare(b[1].name ?? "", "ko"));
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-5 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {sorted.map(([id, p]) => (
        <li key={id} className="flex min-w-0 flex-col">
          <div className="mb-1.5 flex items-center justify-between gap-1">
            <SlotHeader partType={p.partType} size="sm" />
            <span className="font-mono text-[10px] text-muted-foreground">Lv.{p.minWearLv}</span>
          </div>
          <GearCard src={images[id]} tier={gearTier(id)} className="aspect-[4/3]" />
          <p className="mt-1.5 truncate text-sm font-bold" title={p.name ?? undefined}>
            {p.name}
          </p>
          <ul className="mt-1 space-y-0.5 text-[12px]">
            {pieceStats(p, forge, attrTypes).map((r, i) => {
              const grows = new Set(p.attrs[i].values).size > 1;
              return (
                <li key={i} className="flex items-baseline justify-between gap-2 border-b border-dashed pb-0.5 last:border-0">
                  <span className="truncate text-muted-foreground">{r.name}</span>
                  <b className={cn("shrink-0 font-mono", grows && i > 0 && "text-accent-strong")}>{formatGearValue(r.value, r.kind)}</b>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
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
        "inline-flex h-8 cursor-pointer items-center border px-2.5 text-xs font-medium transition-colors",
        active ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

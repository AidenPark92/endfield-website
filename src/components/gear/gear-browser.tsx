"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Rich } from "@/components/rich-text";
import type { GearPiece, GearSuit } from "@/types/build";

type AttrTypes = Record<string, { name: string; kind: string }>;
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

function fmt(v: number, kind: string) {
  if (kind === "ratio") return `${(v * 100).toFixed(v * 100 < 10 ? 1 : 0)}%`;
  if (kind === "mult") return `×${v}`;
  return String(Math.round(v * 10) / 10);
}

/** 장비 전체 — 세트별 카드 + 세트 없는 장비, 부위·옵션·검색 필터, 단조 단계 선택 */
export function GearBrowser({ pieces, suits, attrTypes }: { pieces: Record<string, GearPiece>; suits: Record<string, GearSuit>; attrTypes: AttrTypes }) {
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

      {/* 세트 */}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {groups.suitOrder.map(([sid, s]) => {
          const list = groups.bySuit.get(sid) ?? [];
          const eff = s.effects.find((e) => e.pieces === 3) ?? s.effects[0];
          return (
            <section key={sid} className="flex flex-col border bg-card">
              <header className="border-b px-4 py-3">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-xl font-bold">{s.name}</h2>
                  <span className="font-mono text-xs text-muted-foreground">T{s.tier} · {list.length}종</span>
                </div>
                {eff && <Rich template={eff.desc} bb={eff.bb} className="mt-2 text-[14px] leading-6 whitespace-pre-line" />}
              </header>
              <PieceList list={list} forge={forge} attrTypes={attrTypes} />
            </section>
          );
        })}
      </div>

      {/* 세트 없는 장비 */}
      {(groups.bySuit.get(null)?.length ?? 0) > 0 && (
        <section className="mt-4 border bg-card">
          <header className="border-b px-4 py-3">
            <h2 className="text-xl font-bold">세트 없는 장비</h2>
          </header>
          <PieceList list={groups.bySuit.get(null)!} forge={forge} attrTypes={attrTypes} />
        </section>
      )}
      {total === 0 && <p className="py-12 text-center text-sm text-muted-foreground">조건에 맞는 장비가 없어요.</p>}
    </div>
  );
}

function PieceList({ list, forge, attrTypes }: { list: [string, GearPiece][]; forge: number; attrTypes: AttrTypes }) {
  const sorted = [...list].sort((a, b) => a[1].partType - b[1].partType || b[1].minWearLv - a[1].minWearLv || (a[1].name ?? "").localeCompare(b[1].name ?? "", "ko"));
  return (
    <ul className="divide-y">
      {sorted.map(([id, p]) => (
        <li key={id} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[minmax(0,13rem)_1fr] sm:gap-4">
          <div className="min-w-0">
            <p className="truncate font-semibold">{p.name}</p>
            <p className="text-[11px] text-muted-foreground">
              {SLOTS[p.partType] ?? "-"} · Lv.{p.minWearLv}
            </p>
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {p.attrs.map((a, i) => {
              const t =
                a.attrType === 0
                  ? { name: a.target === 1 ? "주요 능력치" : a.target === 2 ? "보조 능력치" : "능력치", kind: a.modifierType === 6 ? "ratio" : "flat" }
                  : (attrTypes[String(a.attrType)] ?? { name: `#${a.attrType}`, kind: "flat" });
              const v = a.values[Math.min(forge, a.values.length - 1)];
              const grows = new Set(a.values).size > 1;
              return (
                <li key={i} className="whitespace-nowrap">
                  <span className="text-muted-foreground">{t.name}</span>{" "}
                  <b className={cn("font-mono", grows && i > 0 && "text-accent-strong")}>{fmt(v, a.modifierType === 7 ? "flat" : t.kind)}</b>
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

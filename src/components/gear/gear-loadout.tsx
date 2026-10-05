"use client";

// 추천 장비 세트 — 인게임 장착 화면 풍 (왼쪽 부위 카드 · 오른쪽 장착 보너스 + 세트 효과)
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Rich } from "@/components/rich-text";
import { GearCard, SlotHeader } from "@/components/gear/gear-card";
import { formatGearValue, gearTier, sumGearStats, type AttrName, type AttrTypes } from "@/lib/calc/gear-stats";
import type { GearPiece } from "@/types/build";
import type { Blackboard } from "@/types/combat";

export interface LoadoutSet {
  suitId: string;
  suitName: string | null;
  /** 1위 대비 */
  relative: number;
  icon?: string;
  /** [방어구, 장갑, 부품 I, 부품 II] */
  pieces: { id: string; name: string | null; inSuit: boolean; src?: string }[];
  effect: { desc: string | null; bb: Blackboard } | null;
  /** 세트 효과가 켜지는 개수 */
  need: number;
  /** 피해 유형별 보너스 요약 (계산 결과) */
  summary: string;
  /** 커뮤니티 빌드(endfieldtools.dev)에서 이 오퍼레이터가 이 세트를 쓴 비율 · 표본 수 */
  community?: { share: number; n: number };
}

const SLOT_LABEL = ["방어구", "보호 장갑", "부품 I", "부품 II"];
const SLOT_PART = [0, 1, 2, 2];
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export function GearLoadout({
  sets,
  pieces,
  attrTypes,
  attrs,
}: {
  sets: LoadoutSet[];
  pieces: Record<string, GearPiece>;
  attrTypes: AttrTypes;
  attrs?: { main: AttrName; sub: AttrName };
}) {
  const [idx, setIdx] = useState(0);
  const [forge, setForge] = useState(0);
  const set = sets[idx];
  if (!set) return null;
  const stats = sumGearStats(
    set.pieces.map((p) => pieces[p.id]).filter(Boolean),
    forge,
    attrTypes,
    attrs,
  );
  const inSuit = set.pieces.filter((p) => p.inSuit).length;
  const [head, ...rest] = stats;

  return (
    <div>
      {/* 세트 탭 */}
      <div className="flex overflow-x-auto border-b" role="tablist" aria-label="추천 장비 세트">
        {sets.map((s, i) => (
          <button
            key={s.suitId}
            role="tab"
            aria-selected={i === idx}
            onClick={() => setIdx(i)}
            className={cn(
              "relative flex min-w-0 shrink-0 cursor-pointer items-center gap-2.5 border-r px-4 py-2.5 text-left transition-colors",
              i === idx ? "bg-background" : "text-muted-foreground hover:bg-muted/50",
            )}
          >
            <GearCard src={s.icon} tier={gearTier(s.pieces[0]?.id ?? "")} compact className="size-9" />
            <span className="min-w-0">
              <span className="block text-sm leading-5 font-bold">
                <span className={cn("mr-1 font-mono", i === 0 && "text-accent-strong")}>{i + 1}</span>
                {s.suitName}
              </span>
              <span className="block font-mono text-[11px] leading-4">
                {pct(s.relative)}
                {s.community && s.community.share > 0 && (
                  <span className="ml-1.5 text-muted-foreground" title={`커뮤니티 빌드 ${s.community.n}개 중 이 세트 비율 (endfieldtools.dev)`}>
                    커뮤니티 {Math.round(s.community.share * 100)}%
                  </span>
                )}
              </span>
            </span>
            {i === idx && <span className="absolute inset-x-0 top-0 h-[3px] bg-accent" />}
          </button>
        ))}
      </div>

      <div className="grid gap-5 bg-background p-4 lg:grid-cols-[minmax(0,30rem)_minmax(0,26rem)] lg:justify-between lg:gap-8">
        {/* 왼쪽: 부위 카드 — 방어구·장갑 / 부품 I·II */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 self-start">
          {[0, 1].map((col) => (
            <div key={col} className="space-y-5">
              {[col * 2, col * 2 + 1].map((j) => {
                const p = set.pieces[j];
                if (!p) return null;
                return (
                  <div key={j}>
                    <SlotHeader partType={SLOT_PART[j]} label={SLOT_LABEL[j]} className="mb-2" />
                    <GearCard src={p.src} tier={gearTier(p.id)} dim={!p.inSuit} className={col === 0 ? "aspect-square" : "aspect-[5/3]"}>
                      {!p.inSuit && (
                        <span className="absolute top-1.5 right-2 z-20 bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background">세트 외</span>
                      )}
                    </GearCard>
                    <p className={cn("mt-1.5 text-sm leading-5 font-semibold", !p.inSuit && "text-muted-foreground")}>{p.name}</p>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* 오른쪽: 장착 보너스 · 세트 효과 */}
        <aside className="space-y-5">
          <div>
            <div className="flex items-end justify-between gap-2 border-b-4 border-muted pb-1">
              <h4 className="text-lg font-bold">장착 보너스</h4>
              <span className="flex items-center gap-0.5 pb-0.5 text-[11px]">
                <span className="mr-1 text-muted-foreground">단조</span>
                {[0, 1, 2, 3].map((f) => (
                  <button
                    key={f}
                    onClick={() => setForge(f)}
                    aria-pressed={forge === f}
                    className={cn(
                      "size-6 cursor-pointer border font-mono text-[11px]",
                      forge === f ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted",
                    )}
                  >
                    {f}
                  </button>
                ))}
              </span>
            </div>
            {head && (
              <div className="mt-2 flex items-center justify-between bg-foreground px-3 py-2 text-background">
                <span className="text-[15px] font-semibold">{head.name}</span>
                <b className="border-l border-background/30 pl-3 font-mono text-xl">+{formatGearValue(head.value, head.kind)}</b>
              </div>
            )}
            <ul className="mt-1">
              {rest.map((r) => (
                <li key={r.key} className="flex items-baseline justify-between gap-3 border-b border-dashed px-3 py-1.5 text-[14px] last:border-0">
                  <span>{r.name}</span>
                  <b className="font-mono">
                    {r.kind === "mult" ? "" : "+"}
                    {formatGearValue(r.value, r.kind)}
                  </b>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="border-b-4 border-muted pb-1 text-lg font-bold">세트 효과</h4>
            <div className="mt-2 flex items-center gap-2 rounded-full bg-muted px-3 py-1.5">
              <span className="size-2.5 shrink-0 rounded-full border-2 border-accent-strong" />
              <span className="font-bold">{set.suitName}</span>
            </div>
            <p className="mt-2 flex items-center gap-2 border-l-2 border-muted pl-3 text-sm">
              장착 완료:{" "}
              <b className={cn("font-mono", inSuit >= set.need ? "text-foreground" : "text-muted-foreground")}>
                {inSuit}/{set.need}
              </b>
            </p>
            {set.effect && (
              <div className="mt-2 flex gap-2 text-[14px] leading-6">
                <span className="mt-2 size-2 shrink-0 rounded-full border-2 border-accent-strong" />
                <Rich template={set.effect.desc} bb={set.effect.bb} className="whitespace-pre-line" />
              </div>
            )}
          </div>

          <p className="border-t pt-2 text-[11px] leading-5 text-muted-foreground">
            세트 효과 포함 계산: {set.summary}
            <br />
            장착 보너스는 세트 효과(조건부)를 뺀 장비 옵션 합계예요.
          </p>
        </aside>
      </div>
    </div>
  );
}

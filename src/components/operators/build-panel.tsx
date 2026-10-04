// 추천 빌드 (서버 컴포넌트) — 계산은 lib/calc/build.ts, 데이터 준비는 lib/data.ts getBuildRecommendation
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Rich } from "@/components/rich-text";
import { DMG_TYPE_LABEL, DMG_TYPES } from "@/lib/calc/build";
import type { BuildRecommendation } from "@/lib/data";
import type { GearSuit } from "@/types/build";
import { RARITY_BG } from "@/lib/operator-meta";

const SLOT = ["방어구", "장갑", "부품 I", "부품 II"];
const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;

interface Mate {
  id: string;
  name: string;
  face?: string;
}

export function BuildPanel({
  rec,
  suits,
  mates,
}: {
  rec: BuildRecommendation;
  suits: Record<string, GearSuit>;
  mates: Record<string, Mate>;
}) {
  const shownWeapons = [
    ...rec.weapons.slice(0, 5),
    ...rec.weapons.slice(5).filter((w) => w.official), // 게임 추천 무기는 순위 밖이어도 보여 줌
  ];
  const topGear = rec.gear.slice(0, 3);

  return (
    <div className="space-y-6">
      {/* 계산 기준 */}
      <div className="flex flex-wrap gap-1.5 text-xs">
        {["레벨 90", "잠재 0", "무기 재련 0", "기질로 무기 스킬 상한까지", "재능 배열 완료", "장비 단조 0", "조건부 효과 제외"].map((t) => (
          <span key={t} className="border bg-card px-2 py-1">
            {t}
          </span>
        ))}
      </div>

      {/* 무기 */}
      <section className="border bg-card">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
          <h3 className="text-lg font-bold">추천 무기</h3>
          <p className="text-xs text-muted-foreground">1위 대비 스킬 피해 지수 (배틀·연계·궁극기 평균) · 고유 특성은 조건 없는 효과만 반영</p>
        </header>
        <ol className="divide-y">
          {shownWeapons.map((w) => {
            const rank = rec.weapons.indexOf(w) + 1;
            return (
              <li key={w.id} className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.2fr)]">
                <div className="flex items-center gap-3">
                  <span className={cn("w-6 text-center font-mono text-lg font-bold", rank === 1 && "text-accent-strong")}>{rank}</span>
                  <span className="relative size-12 shrink-0 border bg-muted/60">
                    {w.image && <Image src={w.image} alt="" fill sizes="48px" unoptimized className="object-contain p-1" />}
                    <span className={cn("absolute inset-x-0 bottom-0 h-1", RARITY_BG[w.rarity])} />
                  </span>
                </div>
                <div className="min-w-0">
                  <Link href={`/essence?w=${w.id}`} className="font-bold hover:underline">
                    {w.name}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap gap-1 text-[11px]">
                    <span className="font-mono text-rarity-5">{"★".repeat(w.rarity)}</span>
                    {w.official && (
                      <span className="bg-foreground px-1.5 font-semibold text-background">게임 추천 · {w.official === "skill" ? "스킬 조합" : "속성 조합"}</span>
                    )}
                  </p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-muted-foreground">
                      공격력 <b className="font-mono text-foreground">{Math.floor(w.score.atk)}</b> · 치명 {pct(w.score.critRate, 0)} · 피해 +{pct(w.score.dmgPct.battle, 0)}
                    </span>
                    <b className="font-mono text-base">{pct(w.relative)}</b>
                  </div>
                  <div className="mt-1 h-2 bg-muted">
                    <div className={cn("h-full", rank === 1 ? "bg-accent" : "bg-foreground/70")} style={{ width: `${Math.max(2, w.relative * 100)}%` }} />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* 장비 */}
      <section className="border bg-card">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
          <h3 className="text-lg font-bold">추천 장비 세트</h3>
          <p className="text-xs text-muted-foreground">1위 무기 착용 · 세트 3개 + 1칸 자유 · 최고 등급 장비 기준</p>
        </header>
        <div className="grid gap-px bg-border lg:grid-cols-3">
          {topGear.map((g, i) => {
            const suit = suits[g.suitId];
            const effect = suit?.effects.find((e) => e.pieces === 3) ?? suit?.effects[0];
            return (
              <article key={g.suitId} className="flex flex-col bg-background p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="text-lg font-bold">
                    <span className={cn("mr-1.5 font-mono", i === 0 && "text-accent-strong")}>{i + 1}</span>
                    {g.suitName}
                  </h4>
                  <b className="font-mono">{pct(g.relative)}</b>
                </div>
                <ul className="mt-3 space-y-1 text-sm">
                  {g.pieces.map((p, j) => (
                    <li key={p.id + j} className="flex gap-2">
                      <span className="w-12 shrink-0 text-xs text-muted-foreground">{SLOT[j]}</span>
                      <span className={cn(!p.inSuit && "text-muted-foreground")}>
                        {p.name}
                        {!p.inSuit && <span className="ml-1 border px-1 text-[10px]">세트 외</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                {effect && (
                  <div className="mt-3 border-t pt-2 text-[13px] leading-6 whitespace-pre-line">
                    <Rich template={effect.desc} bb={effect.bb} />
                  </div>
                )}
                <p className="mt-auto pt-3 text-[11px] text-muted-foreground">
                  {DMG_TYPES.map((t) => `${DMG_TYPE_LABEL[t]} +${pct(g.score.dmgPct[t], 0)}`).join(" · ")} · 치명 {pct(g.score.critRate, 0)}
                </p>
              </article>
            );
          })}
        </div>
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
          <Link href="/gear" className="font-semibold underline underline-offset-2">
            전체 장비 보기 →
          </Link>
        </p>
      </section>

      {/* 연계 시너지 */}
      <section className="border bg-card">
        <header className="border-b px-4 py-3">
          <h3 className="text-lg font-bold">연계 시너지</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            연계 스킬 발동 조건: <b className="text-foreground">{rec.synergy.condition || "-"}</b>
          </p>
        </header>
        <div className="space-y-4 p-4">
          {rec.synergy.selfOnly.length > 0 && (
            <p className="text-sm">
              <b>{rec.synergy.selfOnly.join(" · ")}</b> 조건은 조작 캐릭터가 직접 만들 수 있어요.
            </p>
          )}
          {rec.synergy.needs.map((n) => (
            <div key={n.keyword}>
              <p className="text-sm">
                <b className="bg-accent/30 px-1">{n.keyword}</b> 을(를) 만들어 주는 동료 {n.self && <span className="text-xs text-muted-foreground">(본인도 가능)</span>}
              </p>
              <MateList ids={n.providers} mates={mates} />
            </div>
          ))}
          {rec.synergy.needs.length === 0 && rec.synergy.selfOnly.length === 0 && (
            <p className="text-sm text-muted-foreground">특정 상태가 필요 없는 조건이라 동료 조합에 크게 좌우되지 않아요.</p>
          )}
          <div className="border-t pt-4">
            <p className="text-sm">
              이 오퍼레이터가 <b>연계 조건을 만들어 주는 동료</b>
            </p>
            <MateList ids={rec.synergy.enables} mates={mates} />
          </div>
          <p className="text-[11px] text-muted-foreground">게임 내 전투 태그(전기 부착, 띄우기 등)와 연계 스킬 발동 조건 문구를 맞춰 찾았어요.</p>
        </div>
      </section>

      <details className="border bg-card px-4 py-3 text-sm">
        <summary className="cursor-pointer font-semibold">어떻게 계산했나요?</summary>
        <div className="mt-2 space-y-1 text-[13px] leading-6 text-muted-foreground">
          <p>스킬 피해 지수 = 공격력 × (1 + 속성 피해 + 스킬 종류 피해) × (1 + 치명타 확률 × 치명타 피해)</p>
          <p>공격력 = (캐릭터 + 무기 기초 공격력) × (1 + 공격력%) × (1 + 0.5% × 주 능력치 + 0.2% × 보조 능력치)</p>
          <p>
            방어력·저항·스킬 배율은 같은 오퍼레이터끼리 비교할 때 똑같이 곱해지므로 빼고, 순위만 비교해요. 무기 고유 특성과 세트 효과 중
            &quot;…할 때 / …후 / …동안&quot; 같은 조건부 효과는 반영하지 않았어요(실전에서는 더 강할 수 있음). 무기의 게임 추천은 공식 위키 기준이에요.
          </p>
        </div>
      </details>
    </div>
  );
}

function MateList({ ids, mates }: { ids: string[]; mates: Record<string, Mate> }) {
  if (!ids.length) return <p className="mt-1 text-xs text-muted-foreground">해당 동료 없음</p>;
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {ids.map((id) => {
        const m = mates[id];
        if (!m) return null;
        return (
          <li key={id}>
            <Link href={`/operators/${id}`} className="flex items-center gap-2 border bg-background py-1 pr-3 pl-1 text-sm hover:border-foreground">
              <span className="relative size-8 overflow-hidden bg-muted">
                {m.face && <Image src={m.face} alt="" fill sizes="32px" unoptimized className="object-cover object-top" />}
              </span>
              {m.name}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// 추천 빌드 (서버 컴포넌트) — 계산은 lib/calc/build.ts, 데이터 준비는 lib/data.ts getBuildRecommendation
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Rich } from "@/components/rich-text";
import { BASIC_CHAIN_SECONDS, DMG_TYPE_LABEL, DMG_TYPES } from "@/lib/calc/build";
import { STAGGER_UPTIME } from "@/lib/calc/weapon-value";
import type { BuildRecommendation } from "@/lib/data";
import type { GearSuit } from "@/types/build";
import { RARITY_BG } from "@/lib/operator-meta";
import { TeamCard, type TeamMate, type TeamView } from "@/components/teams/team-card";

const SLOT = ["방어구", "장갑", "부품 I", "부품 II"];
const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;

type Mate = TeamMate;

export function BuildPanel({
  rec,
  suits,
  mates,
  teams,
  opId,
}: {
  rec: BuildRecommendation;
  suits: Record<string, GearSuit>;
  mates: Record<string, Mate>;
  teams: TeamView[];
  opId: string;
}) {
  const shownWeapons = [
    ...rec.weapons.slice(0, 5),
    ...rec.weapons.slice(5).filter((w) => w.official), // 게임 추천 무기는 순위 밖이어도 보여 줌
  ];
  const topGear = rec.gear.slice(0, 3);
  // 점수 표시: 서포터는 내부 지표(메인 딜러 피해 증가)를 1위 대비로 환산 — 수치 자체는 화면에 쓰지 않음
  const shown = (w: (typeof rec.weapons)[number]) => w.relative;
  // 비중 문장 (치유 스킬이 없으면 치유 몫은 메인 딜러로)
  const roleParts = [
    ["본인 피해", rec.role.self],
    ["메인 딜러 강화", rec.role.dealer + (rec.heals ? 0 : rec.role.heal)],
    ["치유량", rec.heals ? rec.role.heal : 0],
    ["생존", rec.role.survival],
  ].filter(([, v]) => (v as number) > 0) as [string, number][];

  return (
    <div className="space-y-6">
      {/* 계산 기준 */}
      <div className="flex flex-wrap gap-1.5 text-xs">
        {["레벨 90", "잠재 0", "무기 재련 0", "기질로 무기 스킬 상한까지", "재능 배열 완료", "장비 단조 0", "조건부 효과는 가동률만큼", "메인 딜러 = 스트라이커 평균", "일반 공격 피해 제외 (실측 전)", `적 불균형 ${Math.round(STAGGER_UPTIME * 100)}% (가정)`].map((t) => (
          <span key={t} className="border bg-card px-2 py-1">
            {t}
          </span>
        ))}
      </div>

      {/* 무기 */}
      <section className="border bg-card">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
          <h3 className="text-lg font-bold">추천 무기</h3>
          <p className="text-xs text-muted-foreground">1위 = 100%</p>
        </header>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/40 px-4 py-2 text-sm">
          <span className="bg-foreground px-2 py-0.5 text-xs font-semibold text-background">{rec.role.label}</span>
          <span>
            {roleParts.map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(" + ")} 비중으로 무기의 모든 능력치를 합쳐 봐요.
            {rec.role.self === 1 && " 팀원을 강화하는 효과는 메인 딜러에게 의미가 없어서 빼요."}
            {rec.role.self === 0 && " 본인 공격력은 의미가 없어서 같은 점수일 때만 비교해요."}
          </span>
        </div>
        {rec.selfBuffs.length > 0 && (
          <p className="border-b px-4 py-2 text-xs text-muted-foreground">
            계산에 넣은 오퍼레이터 자체 버프(재능·스킬, 가동률 반영): <span className="text-foreground">{rec.selfBuffs.join(" · ")}</span>
          </p>
        )}
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
                      공격력 <b className="font-mono text-foreground">{Math.floor(w.score.atk)}</b> · 치명 {pct(w.score.critRate, 0)}
                    </span>
                    <b className="font-mono text-base">{pct(shown(w))}</b>
                  </div>
                  <div className="mt-1 h-2 bg-muted">
                    <div className={cn("h-full", rank === 1 ? "bg-accent" : "bg-foreground/70")} style={{ width: `${Math.max(2, shown(w) * 100)}%` }} />
                  </div>
                </div>
                {(w.applied.length > 0 || w.team.length > 0 || w.extraHits.length > 0 || w.excluded.length > 0 || w.trait?.desc) && (
                  <div className="col-span-2 sm:col-span-3">
                    <ul className="flex flex-wrap gap-1.5 text-[12px]">
                      {w.statSkills.map((st, i) => (
                        <li key={`s${i}`} className="border border-dashed bg-background px-2 py-0.5">
                          <Rich template={st.desc} bb={st.bb} className="[&>span]:mx-0 [&>span]:bg-transparent [&>span]:px-0.5 [&>span]:text-accent-strong" />
                        </li>
                      ))}
                      {w.applied.map((a, i) => (
                        <li key={i} className="border bg-background px-2 py-0.5" title={a.via}>
                          {a.text.replace(/\s*\+\s*$/, "").replace(/\+\[.*\]$/, "")}{" "}
                          <b className="font-mono text-accent-strong">+{a.pct ? pct(a.value, 1) : Math.round(a.value)}</b>
                          {a.maxStack > 1 && <span className="text-muted-foreground"> × {a.stacks.toFixed(a.stacks % 1 ? 1 : 0)}스택</span>}
                          {a.uptime < 1 && a.maxStack === 1 ? (
                            <span className="text-muted-foreground"> × 가동 {Math.round(a.uptime * 100)}%</span>
                          ) : a.via !== "항상" ? (
                            <span className="text-muted-foreground"> · 상시 유지</span>
                          ) : null}
                          {a.via !== "항상" && <span className="ml-1 text-[11px] text-muted-foreground">({a.via})</span>}
                        </li>
                      ))}
                      {w.extraHits.map((x, i) => (
                        <li key={`x${i}`} className="border bg-background px-2 py-0.5" title={x.via}>
                          추가 타격 <b className="font-mono text-accent-strong">공격력 {Math.round(x.scale * 100)}%</b>
                          <span className="text-muted-foreground"> · {x.rate > 0 ? `${(1 / x.rate).toFixed(0)}초마다` : "발동 없음"} ({x.via})</span>
                        </li>
                      ))}
                      {w.team.map((a, i) => (
                        <li key={`t${i}`} className="border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5" title={a.via}>
                          <span className="mr-1 bg-emerald-600 px-1 text-[10px] font-semibold text-white">{a.target === "적" ? "적 약화" : "메인 딜러에게"}</span>
                          {a.text.replace(/\s*\+\s*$/, "").replace(/\+\[.*\]$/, "")}{" "}
                          <b className="font-mono text-emerald-700 dark:text-emerald-300">+{a.pct ? pct(a.value, 1) : Math.round(a.value)}</b>
                          {a.maxStack > 1 ? (
                            <span className="text-muted-foreground"> × {a.stacks.toFixed(a.stacks % 1 ? 1 : 0)}스택</span>
                          ) : (
                            a.uptime < 0.995 && <span className="text-muted-foreground"> × 가동 {Math.round(a.uptime * 100)}%</span>
                          )}

                          {a.via !== "항상" && <span className="ml-1 text-[11px] text-muted-foreground">({a.via})</span>}
                        </li>
                      ))}
                    </ul>
                    {w.trait?.desc && (
                      <details className="mt-1 text-[12px]">
                        <summary className="cursor-pointer text-muted-foreground">
                          무기 효과 원문 · {w.trait.name} (레벨 {w.trait.level})
                        </summary>
                        <Rich template={w.trait.desc} bb={w.trait.bb} className="mt-1 border-l-2 pl-3 text-[13px] leading-6" autoTerms />
                      </details>
                    )}
                    {w.excluded.length > 0 && (
                      <details className="mt-1 text-[12px] text-muted-foreground">
                        <summary className="cursor-pointer">반영하지 않은 효과 {w.excluded.length}개</summary>
                        <ul className="mt-1 space-y-0.5 pl-3">
                          {w.excluded.map((e, i) => (
                            <li key={i}>
                              {e.text.replace(/\s*\+\s*$/, "")} — <span className="text-foreground">{e.reason}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {/* 장비 */}
      <section className="border bg-card">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
          <h3 className="text-lg font-bold">추천 장비 세트</h3>
          <p className="text-xs text-muted-foreground">1위 무기 착용 · 무기와 같은 역할별 점수 · 세트 효과도 조건·가동률 반영 · 세트 3개 + 1칸 자유 · 최고 등급</p>
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

      {/* 베스트 조합 */}
      {teams.length > 0 && (
        <section className="border bg-card">
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
            <h3 className="text-lg font-bold">베스트 조합</h3>
            <p className="text-xs text-muted-foreground">연계 스킬이 서로 이어지는 4인 조합 · 캐릭터 성능(딜량)은 제외</p>
          </header>
          <div className="grid gap-3 p-4 lg:grid-cols-3">
            {teams.map((t, i) => (
              <TeamCard key={t.ids.join("-")} team={t} mates={mates} rank={i + 1} focus={opId} />
            ))}
          </div>
          <p className="border-t px-4 py-2 text-xs text-muted-foreground">
            <Link href={`/teams?op=${opId}`} className="font-semibold text-foreground underline underline-offset-2">
              조합 더 보기 →
            </Link>{" "}
            점수 = 연계 발동 가능 인원 × 10 + 동료 연결 점수
          </p>
        </section>
      )}

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
          <p className="font-semibold text-foreground">추천 무기 점수 — 무기의 모든 능력치를 이 오퍼레이터 기준으로</p>
          <p>점수 = 본인 피해 비중 × (본인 피해 ÷ 1위) + 메인 딜러 강화 비중 × (1 + 메인 딜러 피해 증가 ÷ 1위) + 치유 비중 × (치유량 ÷ 1위) + 생존 비중 × (실질 생명력 ÷ 1위)</p>
          <p>
            비중(직업): 스트라이커 본인 100% · 캐스터/가드 본인 50% + 메인 딜러 50% · 뱅가드 본인 25% + 메인 딜러 75% · 서포터 메인 딜러 70% + 치유 30% · 디펜더 메인 딜러
            40% + 치유 20% + 생존 40%. 치유 스킬이 없으면 치유 몫은 메인 딜러로 옮겨요.
          </p>
          <p>
            <b className="text-foreground">본인 피해</b> = 스킬(배틀·연계·궁극기 초당 사용 횟수 × 피해 배율) + 이상 피해(아츠 폭발 160% · 강타 150%+150%×4스택 · 갑옷 파괴
            50%+50%×4 · 띄우기 120%, 그리고 &quot;강타 피해로 간주&quot;되는 스킬 피해 — 모두 × (1 + 아츠 강도/100), 피해 보너스는 미확인이라 미적용) + 추가 타격, 각각 × 공격력 × (1 + 피해%) × 치명 기대값 × (1 + 적이 받는 피해%). 궁극기 충전 효율은 궁극기 횟수로, 아츠 강도는 이상
            피해로 들어가요.
          </p>
          <p>
            <b className="text-foreground">메인 딜러 강화</b> = 스트라이커 전원(각자 1위 무기)에 팀 버프·적 약화를 더했을 때 피해 증가율 평균. 속성이 안 맞는 딜러는 0.{" "}
            <b className="text-foreground">치유량</b> = 스킬 표의 (기초 치유 + 능력치 계수 × 능력치) × 빈도 × (1 + 치유 효율).{" "}
            <b className="text-foreground">실질 생명력</b> = (기초 생명력 + 힘 × 5) × (1 + 생명력%) × (1 + 보호 효과% — 보호를 주는 오퍼레이터만).
          </p>
          <p>
            조건부 효과: 가동률 = min(1, 발동 빈도 × 지속 시간), 중첩형은 평균 스택. 혼자 못 만드는 조건은 그 상태를 만드는 오퍼레이터가 3인 편성에 들어올 확률만큼. 적 상태(방어
            불능·동결 등)는 그 상태를 만드는 빈도 × 상태 지속 시간, 불균형은 가정값. 치명타 조건은 타수 × 치명률. 속성이 안 맞거나 능력치 조건이 안 되면 0이고, 무기마다
            &quot;반영하지 않은 효과&quot;에 이유를 적었어요.
          </p>
          <p>
            일반 공격 피해는 1세트에 걸리는 시간이 실측되지 않아 넣지 않아요(가정값으로 넣으면 일반 공격이 피해의 대부분을 차지해 공격력% 무기가 과대평가돼요). 가정값(실측 필요): 강력한 일격·치명타 빈도 계산용 일반 공격 1세트 {BASIC_CHAIN_SECONDS}초 · 적 불균형 가동 {Math.round(STAGGER_UPTIME * 100)}% · &quot;생명력 N% 이상&quot; 조건은 항상 유지.
          </p>
          <p>
            <b className="text-foreground">무기 ↔ 장비</b>: 무기만으로 1위를 정하고 → 그 무기로 장비 세트를 고른 뒤 → 그 장비(치명률·아츠 강도 등)를 낀 상태로 무기를 다시 비교해요. 장비
            세트 효과도 무기 고유 특성과 같은 방식(조건·가동률·팀 효과·이상 피해)으로 계산해요. 궁극기 동안 강화되는 일반 공격(레바테인 등)은 &quot;궁극기 사용 시
            일반 공격 피해&quot; 버프를 궁극기 내내 받는다고 봐요.
          </p>
          <p>
            검증: 커뮤니티 빌드 집계(endfieldtools.dev Best Build)의 1위 무기·장비가 우리 추천에서 몇 위인지 테스트로 확인해요. 커뮤니티 집계는 무기 보유 여부·인기도
            영향도 있어서 점수에 직접 쓰지는 않아요.
          </p>
          <p>점수는 1위 무기를 100%로 나눈 값이에요. 방어력·저항은 같은 오퍼레이터끼리 비교하면 똑같이 곱해지므로 빼요. 게임 추천 표시는 공식 위키 기준이에요.</p>
          <p>공격력 = (캐릭터 + 무기 기초 공격력) × (1 + 공격력%) × (1 + 0.5% × 주 능력치 + 0.2% × 보조 능력치)</p>
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

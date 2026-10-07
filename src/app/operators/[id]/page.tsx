import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, BookOpen, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { attrScaleMax, essenceStats, gearSuits, getBuildRecommendation, getCombatCharacter, operators, weapons } from "@/lib/data";
import { teamsForOperator } from "@/lib/teams-cache";
import { CLASS_ICON, ELEMENT_BG, ELEMENT_ICON, ELEMENT_TEXT, RARITY_BG } from "@/lib/operator-meta";
import { essenceImage } from "@/lib/essence-images";
import type { StatCategory, Weapon } from "@/types/game";
import { EssenceSlots } from "@/components/essence/essence-slots";
import { OperatorStatsPanel } from "@/components/operators/operator-stats";
import { CombatPanel } from "@/components/operators/combat-panel";
import { BuildPanel } from "@/components/operators/build-panel";

export function generateStaticParams() {
  return operators.map((o) => ({ id: o.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const op = operators.find((o) => o.id === id);
  if (!op) return {};
  return { title: op.name, description: op.profile?.summary };
}

const weaponById = new Map(weapons.map((w) => [w.id, w]));
const statLabel = new Map(
  (["base", "extra", "skill"] as const).flatMap((c) => essenceStats[c].map((s) => [`${c}:${s.id}`, s.label] as const)),
);
const labelOf = (c: StatCategory, id: string) => statLabel.get(`${c}:${id}`) ?? id;

export default async function OperatorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const op = operators.find((o) => o.id === id);
  if (!op) notFound();
  const p = op.profile;
  const combat = getCombatCharacter(op.id);
  const build = getBuildRecommendation(op.id);
  // 베스트 조합은 미리 계산한 캐시(data/generated/teams.json)에서
  const teams = build ? await teamsForOperator(op.id, 3) : [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Link href="/operators" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> 캐릭터 목록
      </Link>

      {/* 히어로 */}
      <section className="mt-3 grid gap-6 border bg-card lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-muted/30 to-muted">
          <span className={cn("absolute -top-1/4 -left-1/4 size-3/4 rounded-full opacity-20 blur-3xl", ELEMENT_BG[op.element])} />
          {op.image && (
            <Image src={op.image} alt={op.name} fill priority sizes="(min-width:1024px) 600px, 100vw" unoptimized className="object-contain" />
          )}
          <span className={cn("absolute inset-x-0 bottom-0 h-1.5", RARITY_BG[op.rarity])} />
        </div>

        <div className="flex flex-col gap-5 p-5 lg:py-8 lg:pr-8 lg:pl-2">
          <div>
            <p className="font-mono text-sm tracking-widest text-rarity-5">{"★".repeat(op.rarity)}</p>
            <h1 className="mt-1 text-4xl font-bold tracking-tight">{op.name}</h1>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Tag>
                <TagIcon src={ELEMENT_ICON[op.element]} fallback={ELEMENT_BG[op.element]} />
                <span className={ELEMENT_TEXT[op.element]}>{op.element}</span>
              </Tag>
              {p && (
                <Tag>
                  <TagIcon src={CLASS_ICON[p.class]} />
                  {p.class}
                </Tag>
              )}
              <Tag>{op.weaponType}</Tag>
              <Tag>{op.faction}</Tag>
            </div>
          </div>

          {/* 스토리 */}
          {p && (
            <div className="border-l-4 border-accent bg-muted/50 p-4">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-accent-strong">
                <BookOpen className="size-3.5" /> 스토리
              </p>
              <p className="text-[15px] leading-relaxed">{p.summary}</p>
              <a
                href={p.wiki}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold underline-offset-2 hover:underline"
              >
                공식 위키에서 프로필 파일 · 스토리 전문 보기 <ArrowUpRight className="size-3.5" />
              </a>
            </div>
          )}

          {/* 기본 정보 */}
          {p && (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <Info k="성별" v={p.gender} />
              <Info k="생일" v={p.birthday} />
              <Info k="종족" v={p.race} />
              <Info k="진영" v={op.faction} />
              <Info k="주요 능력치" v={op.mainStat} />
              <Info k="보조 능력치" v={op.subStat} />
            </dl>
          )}
        </div>
      </section>

      {/* 기본 능력치 (게임 데이터 테이블) */}
      <div className="mt-6">
        <Section title="기본 능력치" hint="레벨을 바꿔 보세요 · 무기·장비 제외 기본치">
          {op.stats || op.statMilestones ? (
            <OperatorStatsPanel stats={op.stats} milestones={op.statMilestones} scaleMax={attrScaleMax} />
          ) : (
            <p className="border bg-card p-4 text-sm text-muted-foreground">아직 능력치 데이터가 없는 캐릭터예요. 데이터가 들어오면 바로 표시돼요.</p>
          )}
        </Section>
      </div>

      {/* 추천 빌드 (무기 · 장비 · 연계 시너지) */}
      {build && (
        <div className="mt-6">
          <Section title="추천 빌드" hint="게임 데이터로 계산한 상대 비교 · 잠재 0 기준">
            <BuildPanel
              rec={build}
              suits={gearSuits}
              mates={Object.fromEntries(
                operators.map((o) => [o.id, { id: o.id, name: o.name, face: o.face, element: o.element, cls: o.profile?.class }]),
              )}
              teams={teams}
              opId={op.id}
            />
          </Section>
        </div>
      )}

      {/* 전투 데이터 (스킬 레벨별 수치 · 재능 · 잠재) */}
      {combat && (
        <div className="mt-6">
          <Section title="전투 데이터" hint="스킬 레벨을 바꾸면 설명과 수치가 함께 바뀌어요 · 게임 데이터 기준">
            <CombatPanel data={combat} />
          </Section>
        </div>
      )}

      {p && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* 특기 · 취미 */}
          <Section title="특기 · 취미">
            <ul className="grid gap-2 sm:grid-cols-2">
              {[...p.specialties.map((s) => ({ ...s, kind: "특기" })), ...p.hobbies.map((s) => ({ ...s, kind: "취미" }))].map((s, i) => (
                <li key={i} className="border bg-card p-3">
                  <p className="text-[10px] font-semibold text-muted-foreground">{s.kind}</p>
                  <p className="font-bold">{s.name}</p>
                  {s.title && <p className="text-xs text-muted-foreground">{s.title}</p>}
                </li>
              ))}
              {p.specialties.length + p.hobbies.length === 0 && <li className="text-sm text-muted-foreground">공개된 정보가 없어요.</li>}
            </ul>
          </Section>

          {/* 성우 */}
          <Section title="성우">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border bg-card p-3 text-sm">
              <Info k="한국어" v={p.cv.ko} />
              <Info k="일본어" v={p.cv.ja} />
              <Info k="영어" v={p.cv.en} />
              <Info k="중국어" v={p.cv.zh} />
            </dl>
          </Section>

          {/* 추천 무기 */}
          <Section title="추천 무기" hint="위키 게임 내 추천 · 누르면 그 무기의 기질 파밍으로 이동">
            <div className="space-y-3">
              <WeaponRow title="스킬 조합" ids={op.recommendedWeapons.skill} />
              <WeaponRow title="속성 조합" ids={op.recommendedWeapons.attribute} />
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex h-7 items-center gap-1.5 border bg-background px-2.5 text-xs font-medium">{children}</span>;
}

/** 태그 앞 속성·직업 아이콘 (아이콘이 없으면 색 점으로 대체) */
function TagIcon({ src, fallback }: { src?: string; fallback?: string }) {
  if (!src) return fallback ? <span className={cn("size-2 rounded-full", fallback)} /> : null;
  return <Image src={src} alt="" width={20} height={20} unoptimized className="-ml-1 size-5" />;
}

function Info({ k, v }: { k: string; v?: string }) {
  return (
    <div>
      <dt className="text-[11px] text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v || "-"}</dd>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className="shrink-0 text-lg font-bold">{title}</h2>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function WeaponRow({ title, ids }: { title: string; ids: string[] }) {
  const list = ids.map((id) => weaponById.get(id)).filter((w): w is Weapon => !!w);
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold text-muted-foreground">{title}</p>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {list.map((w, i) => (
          <li key={w.id}>
            <Link
              href={`/essence?w=${w.id}`}
              className={cn(
                "group flex items-center gap-2.5 border bg-card p-2 transition-colors hover:border-foreground",
                title === "스킬 조합" && i === 0 && "border-accent-strong/60 bg-accent/10",
              )}
            >
              <span className="relative size-12 shrink-0 border bg-muted/60">
                {w.image && <Image src={w.image} alt={w.name} fill sizes="48px" unoptimized className="object-contain p-1" />}
                <span className={cn("absolute inset-x-0 bottom-0 h-1", RARITY_BG[w.rarity])} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">
                  {w.name}
                  {title === "스킬 조합" && i === 0 && <span className="ml-1 text-[10px] font-semibold text-accent-strong">1순위</span>}
                </span>
                <EssenceSlots essence={w.essence} label={labelOf} className="mt-1" />
                <span className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-semibold group-hover:underline">
                  <Sparkles className="size-3" /> 기질 파밍
                </span>
              </span>
              <Image src={essenceImage(w.essence.skill)} alt="" width={28} height={28} unoptimized className="shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

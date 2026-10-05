// 베스트 조합 카드 (서버·클라이언트 공용, 상태 없음) — 평가는 lib/calc/rotation.ts(팀 피해) · team.ts(연계 조건)
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ComboStatus, TeamEval } from "@/lib/calc/team";
import type { TeamGearView, TeamPowerView } from "@/lib/data";
import { GearCard } from "@/components/gear/gear-card";

export interface TeamMate {
  id: string;
  name: string;
  face?: string;
  element?: string;
  cls?: string;
}

export type TeamView = TeamEval & { classes: number; healer: boolean; gear?: TeamGearView; power?: TeamPowerView; contribution?: number };

const STATUS: Record<ComboStatus, { label: string; tone: string }> = {
  team: { label: "동료가 조건을 만들어 줌", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  self: { label: "혼자서도 발동 · 동료가 보조", tone: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  free: { label: "조건 없이 발동", tone: "bg-muted text-muted-foreground" },
  off: { label: "이 조합에선 발동 어려움", tone: "bg-red-500/15 text-red-700 dark:text-red-300" },
};

export function TeamCard({
  team,
  mates,
  rank,
  focus,
}: {
  team: TeamView;
  mates: Record<string, TeamMate>;
  rank?: number;
  /** 강조할 오퍼레이터 */
  focus?: string;
}) {
  const name = (id: string) => mates[id]?.name ?? id;
  return (
    <article className="border bg-background">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2">
        {rank !== undefined && <span className={cn("font-mono text-lg font-bold", rank === 1 && "text-accent-strong")}>{rank}</span>}
        {team.power && (
          <span className="text-sm" title="전체 1위 조합 대비 팀 피해 기대치 (파티 장비 · SP 배분 · 버프 가동률 반영)">
            팀 화력 <b className="font-mono text-base">{Math.round(team.power.relative * 100)}</b>
          </span>
        )}
        {focus && team.contribution !== undefined && (
          <span className="text-sm" title="이 오퍼레이터가 빠지면 줄어드는 팀 피해 비율 (본인 피해 + 버프·디버프 + 연계 조건 + 궁극기 에너지)">
            {name(focus)} 기여 <b className="font-mono text-base">{Math.round(team.contribution * 100)}%</b>
          </span>
        )}
        <span className="text-sm">
          연계 발동 <b className="font-mono text-base">{team.active}/4</b>
        </span>
        <span className="ml-auto flex flex-wrap gap-1 text-[11px]">
          <span className={cn("border px-1.5", team.healer ? "" : "text-muted-foreground")}>{team.healer ? "치유 담당 있음" : "치유 담당 없음"}</span>
          <span className="border px-1.5" title="연계 시너지 점수 (연계 발동 인원 × 10 + 동료 연결)">시너지 {team.score}점</span>
        </span>
      </header>
      <ul className="grid grid-cols-4 border-b">
        {team.ids.map((id) => {
          const m = mates[id];
          return (
            <li key={id} className={cn("border-r last:border-r-0", focus === id && "bg-accent/25")}>
              <Link href={`/operators/${id}`} className="block p-1.5 text-center hover:bg-muted/60">
                <span className="relative mx-auto block aspect-square w-full max-w-16 overflow-hidden bg-muted">
                  {m?.face && <Image src={m.face} alt="" fill sizes="64px" unoptimized className="object-cover object-top" />}
                </span>
                <span className="mt-1 block truncate text-xs font-semibold">{name(id)}</span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {[m?.element, m?.cls].filter(Boolean).join(" · ")}
                </span>
                {team.power && (() => {
                  const pm = team.power.members.find((x) => x.id === id);
                  if (!pm) return null;
                  return (
                    <span className="mt-1 block" title="팀 피해 중 이 오퍼레이터 비중">
                      <span className="block h-1 bg-muted">
                        <span className={cn("block h-full", team.power.mainId === id ? "bg-accent-strong" : "bg-foreground/40")} style={{ width: `${Math.round(pm.share * 100)}%` }} />
                      </span>
                      <span className="mt-0.5 block font-mono text-[10px] leading-3">
                        {team.power.mainId === id ? "메인 " : ""}
                        {Math.round(pm.share * 100)}%
                      </span>
                    </span>
                  );
                })()}
              </Link>
            </li>
          );
        })}
      </ul>
      {team.power && <CycleSection power={team.power} name={name} />}
      {team.gear && (
        <div className="border-b px-3 py-2">
          <p className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-2 text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">이 파티 장비</span>
            {team.gear.gain > 1.0005 && <span>개인 추천 장비 그대로보다 파티 피해 +{((team.gear.gain - 1) * 100).toFixed(1)}%</span>}
          </p>
          <ul className="grid grid-cols-4 gap-1.5">
            {team.ids.map((id) => {
              const g = team.gear!.members.find((x) => x.id === id);
              if (!g) return <li key={id} />;
              return (
                <li key={id} className="min-w-0" title={g.reason}>
                  <span className="flex items-center gap-1">
                    <GearCard src={g.icon} tier={4} compact className="size-6 shrink-0" />
                    <span className={cn("truncate text-[11px] leading-4 font-semibold", !g.same && "text-accent-strong")}>{g.suitName}</span>
                  </span>
                  {!g.same && <span className="mt-0.5 block text-[10px] leading-3 text-muted-foreground">파티 맞춤</span>}
                </li>
              );
            })}
          </ul>
          {team.gear.members.some((g) => !g.same && g.reason) && (
            <ul className="mt-1.5 space-y-0.5 text-[11px] leading-4 text-muted-foreground">
              {team.gear.members
                .filter((g) => !g.same && g.reason)
                .map((g) => (
                  <li key={g.id}>
                    <b className="text-foreground">{name(g.id)}</b> {g.reason}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
      <ul className="divide-y text-[13px]">
        {team.members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-3 py-1.5">
            <b className="w-24 shrink-0 truncate">{name(m.id)}</b>
            <span className={cn("px-1.5 text-[11px] font-semibold", STATUS[m.status].tone)}>{STATUS[m.status].label}</span>
            {m.from.map((f) => (
              <span key={f.keyword} className="text-muted-foreground">
                <b className="bg-accent/30 px-1 font-semibold text-foreground">{f.keyword}</b> ← {f.ids.map(name).join(", ")}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </article>
  );
}

const sec = (v: number) => (Number.isFinite(v) ? `${v < 10 ? v.toFixed(1) : Math.round(v)}초` : "—");
const EFFECT: Record<TeamPowerView["buffs"][number]["effect"], string> = { amp: "증폭", vuln: "취약", atk: "공격력" };

/** 스킬 사이클: SP 수입, 멤버별 배틀 스킬(SP 배분)·연계·궁극기 간격, 가동 중인 버프 */
function CycleSection({ power, name }: { power: TeamPowerView; name: (id: string) => string }) {
  return (
    <div className="border-b px-3 py-2 text-[11px] leading-4">
      <p className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-2 text-muted-foreground">
        <span className="font-semibold text-foreground">스킬 사이클</span>
        <span>
          SP 수입 <b className="font-mono text-foreground">{power.spIncome.toFixed(1)}</b>/초 · 조작 {name(power.controlId)} · 연계 가동 {Math.round(power.comboUptime * 100)}%
        </span>
      </p>
      <table className="w-full table-fixed text-left">
        <thead className="text-muted-foreground">
          <tr>
            <th className="w-1/4 font-normal" />
            <th className="font-normal">배틀(SP)</th>
            <th className="font-normal">연계</th>
            <th className="font-normal">궁극기</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {power.members.map((m) => (
            <tr key={m.id}>
              <td className="truncate font-sans font-semibold">{name(m.id)}</td>
              <td>{m.spShare > 0.005 ? `${sec(m.battleEvery)} · ${Math.round(m.spShare * 100)}%` : "—"}</td>
              <td>{sec(m.comboEvery)}</td>
              <td>{sec(m.ultEvery)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {power.buffs.length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-1">
          {power.buffs
            .slice()
            .sort((a, b) => b.value * b.uptime - a.value * a.uptime)
            .slice(0, 6)
            .map((b, i) => (
              <li key={i} className="border px-1.5 py-0.5" title={b.text}>
                <b>{b.from}</b> {EFFECT[b.effect]} +{Math.round(b.value * 100)}% · 가동 {Math.round(b.uptime * 100)}%
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { effectBlackboard, renderTemplate, type TextSegment } from "@/lib/skill-text";
import type { Blackboard, CombatCharacter, SkillGroup } from "@/types/combat";

const LEVEL_LABELS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "M1", "M2", "M3"];
const TYPE_STYLE: Record<string, string> = {
  "일반 공격": "bg-muted text-foreground",
  "배틀 스킬": "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "연계 스킬": "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  궁극기: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
};
type Tab = "skills" | "talents" | "potentials";

/** 스킬 레벨별 수치 · 재능 · 잠재 — 게임 데이터 그대로, 설명 문구의 {값} 을 선택한 레벨로 채워서 보여 준다 */
export function CombatPanel({ data }: { data: CombatCharacter }) {
  const [tab, setTab] = useState<Tab>("skills");
  const [level, setLevel] = useState(12);

  return (
    <div className="border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b p-2" role="tablist">
        {(
          [
            ["skills", "스킬"],
            ["talents", "재능"],
            ["potentials", "잠재"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              "h-8 cursor-pointer px-3 text-sm font-semibold transition-colors",
              tab === k ? "bg-foreground text-background" : "hover:bg-muted",
            )}
          >
            {label}
          </button>
        ))}
        {tab === "skills" && (
          <div className="ml-auto flex flex-wrap items-center gap-1" role="group" aria-label="스킬 레벨">
            <span className="mr-1 text-[11px] text-muted-foreground">스킬 레벨</span>
            {LEVEL_LABELS.map((l, i) => (
              <button
                key={l}
                onClick={() => setLevel(i + 1)}
                aria-pressed={level === i + 1}
                className={cn(
                  "h-7 min-w-7 cursor-pointer border px-1.5 font-mono text-[11px] transition-colors",
                  level === i + 1 ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted",
                  i === 9 && "ml-1",
                )}
              >
                {l}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-3">
        {tab === "skills" && (
          <div className="grid gap-3 lg:grid-cols-2">
            {data.skillGroups.map((g) => (
              <SkillCard key={g.groupId} group={g} level={level} />
            ))}
          </div>
        )}
        {tab === "talents" && <Talents data={data} />}
        {tab === "potentials" && (
          <ol className="space-y-2">
            {data.potentials.map((p) => (
              <li key={p.level} className="flex gap-3 border bg-background p-3">
                <span className="grid size-8 shrink-0 place-items-center bg-foreground font-mono text-sm font-bold text-background">{p.level}</span>
                <div className="min-w-0">
                  <p className="font-bold">{p.name}</p>
                  <Rich template={p.desc} bb={effectBlackboard(p.effects)} className="mt-0.5 text-sm" />
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
      <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
        게임 데이터 기준 수치예요. M1~M3 = 마스터리 I~III. 데미지 계산기는 이 값을 그대로 씁니다.
      </p>
    </div>
  );
}

function SkillCard({ group, level }: { group: SkillGroup; level: number }) {
  // 그룹 안 모든 세부 스킬의 해당 레벨 수치를 모아 설명을 채움
  const { bb, rows, main } = useMemo(() => {
    const bb: Blackboard = {};
    const rows: { label: string; value: string }[] = [];
    let main: { cost?: number; cd?: number; costType?: number } = {};
    for (const s of group.skills) {
      const l = s.levels[level - 1] ?? s.levels.at(-1);
      if (!l) continue;
      Object.assign(bb, l.bb);
      for (const d of l.display) if (d.label) rows.push({ label: d.label, value: d.value });
      if (/normal_skill|combo_skill|ultimate_skill/.test(s.part)) main = { cost: l.costValue, cd: l.coolDown, costType: l.costType };
    }
    return { bb, rows, main };
  }, [group, level]);

  const chips: string[] = [];
  if (group.type === "배틀 스킬" && main.cost) chips.push(`SP ${main.cost}`);
  if (group.type === "궁극기" && main.cost) chips.push(`궁극기 에너지 ${main.cost}`);
  if (main.cd) chips.push(`쿨타임 ${main.cd}초`);

  return (
    <article className="flex flex-col border bg-background">
      <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <span className={cn("px-1.5 py-0.5 text-[11px] font-bold", TYPE_STYLE[group.type])}>{group.type}</span>
        <h3 className="font-bold">{group.name}</h3>
        <span className="ml-auto flex gap-1">
          {chips.map((c) => (
            <span key={c} className="border px-1.5 py-0.5 font-mono text-[10px]">
              {c}
            </span>
          ))}
        </span>
      </header>
      <Rich template={group.desc} bb={bb} className="px-3 py-2 text-[13px] leading-relaxed whitespace-pre-line" />
      {rows.length > 0 && (
        <dl className="mt-auto grid grid-cols-[1fr_auto] gap-x-3 border-t px-3 py-2 text-xs">
          {rows.map((r, i) => (
            <div key={i} className="contents">
              <dt className="py-0.5 text-muted-foreground">{r.label}</dt>
              <dd className="py-0.5 text-right font-mono font-semibold tabular-nums">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}

function Talents({ data }: { data: CombatCharacter }) {
  // 재능 배열(능력치): 정예화 단계별 증가량 요약
  const attrs = data.talents.attributes;
  const byIndex = new Map<number, typeof data.talents.passives>();
  for (const p of data.talents.passives) byIndex.set(p.index, [...(byIndex.get(p.index) ?? []), p]);
  return (
    <div className="space-y-3">
      {attrs.length > 0 && (
        <section className="border bg-background p-3">
          <h3 className="text-sm font-bold">재능 배열 · 능력치</h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {attrs.map((a) => (
              <li key={a.nodeId} className="border px-2 py-1 text-xs">
                <span className="text-muted-foreground">정예화 {a.breakStage} · 신뢰도 {a.favorability / 3}%</span>{" "}
                <b>{a.desc?.replace("오퍼레이터 ", "")}</b>
              </li>
            ))}
          </ul>
        </section>
      )}
      {[...byIndex.values()].map((stages) => (
        <section key={stages[0].nodeId} className="border bg-background p-3">
          <h3 className="text-sm font-bold">{stages[0].name}</h3>
          <ol className="mt-1.5 space-y-1.5">
            {stages.map((s) => (
              <li key={s.nodeId} className="flex gap-2 text-sm">
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">단계 {s.level} · 정예화 {s.breakStage}</span>
                <Rich template={s.desc} bb={effectBlackboard(s.effects)} />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function Rich({ template, bb, className }: { template: string | null; bb: Blackboard; className?: string }) {
  const { segments } = renderTemplate(template, bb);
  if (!segments.length) return null;
  return (
    <p className={className}>
      {segments.map((s: TextSegment, i) => (
        <span
          key={i}
          className={cn(s.tone === "value" && "font-semibold text-accent-strong", s.tone === "keyword" && "font-semibold underline decoration-dotted underline-offset-2")}
        >
          {s.text}
        </span>
      ))}
    </p>
  );
}

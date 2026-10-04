"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { effectBlackboard, renderTemplate, type TextSegment } from "@/lib/skill-text";
import { lookupTerm, splitTerms } from "@/lib/glossary";
import { Term } from "@/components/ui/term";
import type { Blackboard, CombatCharacter, CombatPassive, SkillGroup } from "@/types/combat";

const LEVEL_LABELS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "M1", "M2", "M3"];
const MAX_LEVEL = LEVEL_LABELS.length;
/** 스킬 종류별 색 (탭 · 배지 · 강조 수치) */
const TYPE_TONE: Record<string, { badge: string; bar: string; text: string }> = {
  "일반 공격": { badge: "bg-foreground text-background", bar: "bg-foreground", text: "text-foreground" },
  "배틀 스킬": { badge: "bg-sky-600 text-white", bar: "bg-sky-600", text: "text-sky-700 dark:text-sky-300" },
  "연계 스킬": { badge: "bg-violet-600 text-white", bar: "bg-violet-600", text: "text-violet-700 dark:text-violet-300" },
  궁극기: { badge: "bg-amber-500 text-black", bar: "bg-amber-500", text: "text-amber-700 dark:text-amber-300" },
};
const ORDER = ["일반 공격", "배틀 스킬", "연계 스킬", "궁극기"];
type Tab = "skills" | "talents" | "potentials";

/** 스킬 레벨별 수치 · 재능 · 잠재 — 게임 데이터 그대로, 설명 문구의 {값} 을 선택한 레벨로 채워 보여 준다 */
export function CombatPanel({ data }: { data: CombatCharacter }) {
  const [tab, setTab] = useState<Tab>("skills");
  const [groupIdx, setGroupIdx] = useState(0);
  const [level, setLevel] = useState(MAX_LEVEL);
  // 형태 스킬(결): 형태는 능력치로 정해져 모든 스킬에 함께 적용되므로 패널 단위로 한 번만 고른다
  const formNames = useMemo(() => data.skillGroups.find((g) => g.forms)?.forms?.map((f) => f.name) ?? [], [data.skillGroups]);
  const formConditions = useMemo(() => data.skillGroups.find((g) => g.forms)?.forms?.map((f) => f.condition) ?? [], [data.skillGroups]);
  const [form, setForm] = useState(data.defaultForm ?? formNames[0]);
  // 일반 공격 → 배틀 → 연계 → 궁극기 순서 (결처럼 형태가 둘인 스킬은 나란히)
  const groups = useMemo(() => [...data.skillGroups].sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type)), [data.skillGroups]);
  const group = groups[groupIdx];

  return (
    <div className="border bg-card">
      {/* 상단 탭 */}
      <div className="flex border-b" role="tablist">
        {(
          [
            ["skills", "스킬", data.skillGroups.length],
            ["talents", "재능", new Set(data.talents.passives.map((p) => p.index)).size],
            ["potentials", "잠재", data.potentials.length],
          ] as const
        ).map(([k, label, count]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              "relative h-12 flex-1 cursor-pointer text-[15px] font-bold transition-colors sm:flex-none sm:px-8",
              tab === k ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            <span className="ml-1.5 font-mono text-xs font-normal text-muted-foreground">{count}</span>
            {tab === k && <span className="absolute inset-x-0 bottom-0 h-[3px] bg-accent" />}
          </button>
        ))}
      </div>

      {tab === "skills" && (
        <>
          {formNames.length > 1 && (
            <FormPicker
              names={formNames}
              conditions={formConditions}
              value={form}
              onChange={setForm}
              defaultForm={data.defaultForm}
              attrs={data.formAttrs}
            />
          )}
          {/* 스킬 선택: 하나씩 크게 */}
          <div className="grid grid-cols-2 gap-px border-b bg-border sm:grid-cols-4" role="tablist" aria-label="스킬">
            {groups.map((g, i) => {
              const tone = TYPE_TONE[g.type];
              const active = i === groupIdx;
              return (
                <button
                  key={g.groupId}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setGroupIdx(i)}
                  className={cn(
                    "relative flex cursor-pointer flex-col items-start gap-1 px-3 py-2.5 text-left transition-colors",
                    active ? "bg-background" : "bg-card hover:bg-muted/60",
                  )}
                >
                  <span className={cn("px-1.5 py-0.5 text-[11px] font-bold", tone.badge)}>{g.type}</span>
                  <span className={cn("line-clamp-2 text-sm leading-snug", active ? "font-bold" : "text-muted-foreground")}>{g.name}</span>
                  {active && <span className={cn("absolute inset-x-0 top-0 h-[3px]", tone.bar)} />}
                </button>
              );
            })}
          </div>
          <SkillDetail group={group} level={level} setLevel={setLevel} form={form} />
        </>
      )}
      {tab === "talents" && <Talents data={data} />}
      {tab === "potentials" && <Potentials data={data} />}

      <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
        게임 데이터 기준 수치예요 · M1~M3 = 마스터리 I~III · 데미지 계산기는 이 값을 그대로 써요
      </p>
    </div>
  );
}

interface Row {
  label: string;
  values: string[];
}

function SkillDetail({ group, level, setLevel, form }: { group: SkillGroup; level: number; setLevel: (n: number) => void; form?: string }) {
  const tone = TYPE_TONE[group.type];
  const activeForm = group.forms ? (group.forms.find((f) => f.name === form) ?? group.forms[0]) : undefined;

  // 레벨 1~12 전체 표 + 현재 레벨 설명용 값
  const { rows, bb } = useMemo(() => {
    const map = new Map<string, string[]>();
    const add = (label: string, i: number, v: string) => {
      if (!map.has(label)) map.set(label, Array(MAX_LEVEL).fill("-"));
      map.get(label)![i] = v;
    };
    for (const s of group.skills)
      s.levels.forEach((l, i) => {
        if (/normal_skill/.test(s.part) && l.costValue) add("스킬 게이지 소모", i, String(l.costValue));
        if (/ultimate_skill/.test(s.part) && l.costValue) add("필요한 궁극기 에너지", i, String(l.costValue));
        if (/combo_skill|ultimate_skill/.test(s.part) && l.coolDown) add("쿨타임", i, `${l.coolDown}초`);
        // 같은 레벨 안에서 라벨이 겹치면(결처럼 형태가 둘인 스킬) "(2)" 를 붙여 따로 보여 준다
        const seen = new Map<string, number>();
        for (const d of l.display) {
          if (!d.label || (d.label === "쿨타임" && map.has("쿨타임") && !seen.has("쿨타임"))) continue;
          const n = (seen.get(d.label) ?? 0) + 1;
          seen.set(d.label, n);
          add(n > 1 ? `${d.label} (${n})` : d.label, i, d.value);
        }
      });
    const bb: Blackboard = {};
    for (const s of group.skills) Object.assign(bb, (s.levels[level - 1] ?? s.levels.at(-1))?.bb);
    // 형태 스킬은 형태별로 나뉜 표(공식 위키)를 쓴다
    const rows: Row[] = activeForm ? activeForm.rows : [...map].map(([label, values]) => ({ label, values }));
    return { rows, bb };
  }, [group, level, activeForm]);

  const isMain = (label: string) => /배율/.test(label);
  const main = rows.filter((r) => isMain(r.label));
  const sub = rows.filter((r) => !isMain(r.label));
  const changes = (r: Row) => new Set(r.values).size > 1;

  return (
    <div className="space-y-5 p-4 sm:p-5">
      {/* 이름 + 레벨 조절 */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className={cn("px-2 py-0.5 text-xs font-bold", tone.badge)}>{group.type}</span>
          <h3 className="mt-1.5 text-2xl font-bold tracking-tight">
            {group.name}
            {activeForm && <span className="ml-2 align-middle text-base font-semibold text-muted-foreground">({activeForm.name})</span>}
          </h3>
        </div>
        <LevelControl level={level} setLevel={setLevel} />
      </div>

      {/* 핵심 수치: 크게 */}
      {main.length > 0 && (
        <div className="flex flex-wrap border-t border-l">
          {main.map((r) => (
            <Stat key={r.label} label={r.label} value={r.values[level - 1]} big toneClass={tone.text} />
          ))}
        </div>
      )}
      {sub.length > 0 && (
        <div className="flex flex-wrap border-t border-l">
          {sub.map((r) => (
            <Stat key={r.label} label={r.label} value={r.values[level - 1]} />
          ))}
        </div>
      )}

      {/* 설명 */}
      <Rich template={activeForm?.desc ?? group.desc} bb={bb} autoTerms={!!activeForm} className="max-w-3xl text-[15px] leading-7 whitespace-pre-line" />

      {/* 레벨별 표 */}
      {rows.some(changes) && (
        <details className="group border" open>
          <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm font-bold select-none">
            레벨별 수치 비교
            <span className="text-xs font-normal text-muted-foreground group-open:hidden">펼치기</span>
          </summary>
          <div className="overflow-x-auto border-t">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="bg-muted/60">
                  <th className="sticky left-0 z-10 bg-muted px-3 py-2 text-left text-xs font-semibold text-muted-foreground">항목</th>
                  {LEVEL_LABELS.map((l, i) => (
                    <th key={l} className="p-0">
                      <button
                        onClick={() => setLevel(i + 1)}
                        className={cn(
                          "h-full w-full cursor-pointer px-2 py-2 font-mono text-xs",
                          i + 1 === level ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {l}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.filter(changes).map((r) => (
                  <tr key={r.label} className="border-t">
                    <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-xs font-medium whitespace-nowrap">{r.label}</th>
                    {r.values.map((v, i) => (
                      <td
                        key={i}
                        className={cn(
                          "px-2 py-2 text-center font-mono tabular-nums",
                          i + 1 === level ? "bg-accent/25 font-bold" : "text-muted-foreground",
                        )}
                      >
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

function LevelControl({ level, setLevel }: { level: number; setLevel: (n: number) => void }) {
  const clamp = (n: number) => Math.min(MAX_LEVEL, Math.max(1, n));
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">스킬 레벨</span>
      <button
        onClick={() => setLevel(clamp(level - 1))}
        disabled={level === 1}
        aria-label="레벨 내리기"
        className="grid size-9 cursor-pointer place-items-center border hover:bg-muted disabled:cursor-default disabled:opacity-30"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="w-14 text-center font-mono text-2xl font-bold tabular-nums">{LEVEL_LABELS[level - 1]}</span>
      <button
        onClick={() => setLevel(clamp(level + 1))}
        disabled={level === MAX_LEVEL}
        aria-label="레벨 올리기"
        className="grid size-9 cursor-pointer place-items-center border hover:bg-muted disabled:cursor-default disabled:opacity-30"
      >
        <ChevronRight className="size-4" />
      </button>
      <input
        type="range"
        min={1}
        max={MAX_LEVEL}
        value={level}
        onChange={(e) => setLevel(Number(e.target.value))}
        aria-label="스킬 레벨"
        className="hidden w-32 cursor-pointer accent-foreground sm:block"
      />
    </div>
  );
}

function Stat({ label, value, big, toneClass }: { label: string; value: string; big?: boolean; toneClass?: string }) {
  return (
    <div className={cn("min-w-0 flex-1 border-r border-b bg-background", big ? "basis-[150px] px-4 py-3" : "basis-[140px] px-3 py-2.5")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("font-mono font-bold tabular-nums", big ? cn("text-3xl sm:text-4xl", toneClass) : "text-xl")}>{value}</p>
    </div>
  );
}

function Talents({ data }: { data: CombatCharacter }) {
  const attrs = data.talents.attributes;
  const byIndex = new Map<number, CombatPassive[]>();
  for (const p of data.talents.passives) byIndex.set(p.index, [...(byIndex.get(p.index) ?? []), p]);
  return (
    <div className="space-y-4 p-4 sm:p-5">
      {[...byIndex.values()].map((stages) => (
        <section key={stages[0].nodeId} className="border">
          <h3 className="border-b bg-muted/40 px-4 py-2.5 text-lg font-bold">{stages[0].name}</h3>
          <ol className="divide-y">
            {stages.map((s) => (
              <li key={s.nodeId} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-4">
                <span className="shrink-0 sm:w-28">
                  <b className="font-mono text-sm">단계 {s.level}</b>
                  <span className="block text-xs text-muted-foreground">정예화 {s.breakStage} 돌파</span>
                </span>
                <Rich template={s.desc} bb={effectBlackboard(s.effects)} className="text-[15px] leading-7 whitespace-pre-line" />
              </li>
            ))}
          </ol>
        </section>
      ))}
      {attrs.length > 0 && (
        <section className="border">
          <h3 className="border-b bg-muted/40 px-4 py-2.5 text-lg font-bold">재능 배열 · 능력치</h3>
          <ol className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
            {attrs.map((a) => (
              <li key={a.nodeId} className="bg-background px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  정예화 {a.breakStage} · 신뢰도 {Math.round(a.favorability / 3)}%
                </p>
                <p className="mt-0.5 text-lg font-bold">{a.desc?.replace("오퍼레이터 ", "").replace(" 능력치", "")}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function Potentials({ data }: { data: CombatCharacter }) {
  return (
    <ol className="divide-y">
      {data.potentials.map((p) => (
        <li key={p.level} className="flex gap-4 px-4 py-4 sm:px-5">
          {/* 잠재 단계 아이콘 (public/icons/potential, 원본: src/images/잠재이미지) */}
          <span className="relative size-14 shrink-0">
            <Image src={`/icons/potential/${p.level}.webp`} alt={`잠재 ${p.level}단계`} fill sizes="56px" unoptimized className="object-contain" />
            <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center bg-foreground font-mono text-[11px] font-bold text-background">
              {p.level}
            </span>
          </span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">잠재 {p.level}단계</p>
            <p className="text-lg font-bold">{p.name}</p>
            <Rich template={p.desc} bb={effectBlackboard(p.effects)} className="mt-1 text-[15px] leading-7 whitespace-pre-line" />
          </div>
        </li>
      ))}
    </ol>
  );
}

function Rich({ template, bb, className, autoTerms }: { template: string | null; bb: Blackboard; className?: string; autoTerms?: boolean }) {
  const { segments } = renderTemplate(template, bb);
  if (!segments.length) return null;
  return (
    <p className={className}>
      {segments.map((s: TextSegment, i) => {
        if (s.tone === "value")
          return (
            <span key={i} className="mx-0.5 bg-accent/30 px-1 font-mono text-[1.05em] font-bold text-foreground">
              {s.text}
            </span>
          );
        if (s.tone === "keyword") {
          const g = lookupTerm(s.text, s.tag);
          // 설명이 있는 용어만 밑줄 + 툴팁, 캐릭터 고유 명칭 등은 굵게만
          return g ? (
            <Term key={i} title={g.term} desc={g.desc}>
              {s.text}
            </Term>
          ) : (
            <b key={i} className="font-semibold">
              {s.text}
            </b>
          );
        }
        // 태그 없는 문장(공식 위키 설명)은 용어를 찾아 툴팁을 붙인다
        if (autoTerms)
          return (
            <span key={i}>
              {splitTerms(s.text).map((p, j) => {
                const g = p.term ? lookupTerm(p.term) : undefined;
                return g ? (
                  <Term key={j} title={g.term} desc={g.desc}>
                    {p.text}
                  </Term>
                ) : (
                  p.text
                );
              })}
            </span>
          );
        return <span key={i}>{s.text}</span>;
      })}
    </p>
  );
}

/** 형태 선택 — 조건을 크게, 쉬운 말로. 현재 기본 능력치로 어느 쪽인지도 보여 준다 */
function FormPicker({
  names,
  conditions,
  value,
  onChange,
  defaultForm,
  attrs,
}: {
  names: string[];
  conditions: string[];
  value?: string;
  onChange: (f: string) => void;
  defaultForm?: string;
  attrs?: { 지능: number; 의지: number };
}) {
  // "지능 수치 ≥ 의지 수치, 진결 · 지혜 활성화됨." → "지능 ≥ 의지"
  const short = (c: string) => c.replace(/,?\s*[^,]*활성화됨\.?$/, "").replace(/\s*수치/g, "").replace("＞", ">").trim();
  const plain = (c: string) => {
    const x = short(c);
    if (/지능\s*≥\s*의지/.test(x)) return "지능이 의지보다 높거나 같을 때";
    if (/의지\s*>\s*지능/.test(x)) return "의지가 지능보다 높을 때";
    return x;
  };
  return (
    <section className="border-b bg-muted/40 p-4 sm:p-5">
      <h3 className="text-lg font-bold">스킬 형태가 능력치에 따라 바뀌어요</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        <b className="text-foreground">지능</b>과 <b className="text-foreground">의지</b> 중 어느 쪽이 높은지에 따라 배틀 스킬 · 연계 스킬 · 궁극기의 효과와 수치가
        달라집니다. 무기 · 장비로 오른 능력치까지 포함해서 비교해요. 아래에서 형태를 고르면 모든 스킬 수치가 바뀝니다.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="스킬 형태">
        {names.map((f, i) => {
          const active = value === f;
          return (
            <button
              key={f}
              role="radio"
              aria-checked={active}
              onClick={() => onChange(f)}
              className={cn(
                "flex cursor-pointer flex-col items-start gap-1 border-2 bg-background px-4 py-3 text-left transition-colors",
                active ? "border-foreground" : "border-border hover:border-muted-foreground",
              )}
            >
              <span className="flex w-full items-center gap-2">
                <span className={cn("grid size-5 place-items-center rounded-full border-2", active ? "border-foreground" : "border-muted-foreground")}>
                  {active && <span className="size-2.5 rounded-full bg-foreground" />}
                </span>
                <span className="text-lg font-bold">{f}</span>
                {defaultForm === f && (
                  <span className="ml-auto bg-accent px-1.5 py-0.5 text-[11px] font-bold text-accent-foreground">기본 능력치로는 이 형태</span>
                )}
              </span>
              <span className="pl-7 text-[15px] font-semibold">{plain(conditions[i] ?? "")}</span>
              <span className="pl-7 font-mono text-xs text-muted-foreground">조건: {short(conditions[i] ?? "")}</span>
            </button>
          );
        })}
      </div>
      {attrs && (
        <p className="mt-2 text-xs text-muted-foreground">
          레벨 90 기본 능력치(무기·장비 제외): 지능 <b className="font-mono text-foreground">{attrs.지능}</b> · 의지{" "}
          <b className="font-mono text-foreground">{attrs.의지}</b>
        </p>
      )}
    </section>
  );
}

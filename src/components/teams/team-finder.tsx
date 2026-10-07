"use client";
// 베스트 조합 탐색 — 오퍼레이터를 고르면 그 오퍼레이터가 들어간 조합 (목록은 서버에서 미리 계산)
import Image from "next/image";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { TeamCard, type TeamMate, type TeamView } from "./team-card";

/** 콘텐츠 난이도 — lib/data.ts TeamMode 와 같음 */
export type TeamModeKey = "normal" | "hard";
const MODES: { key: TeamModeKey; label: string; hint: string }[] = [
  { key: "normal", label: "일반 콘텐츠", hint: "치유 담당 없이 팀 피해만으로 순위" },
  { key: "hard", label: "고난이도", hint: "생존 담당(치유 스킬 또는 디펜더) 1명 이상 포함한 조합만" },
];

export function TeamFinder({
  overall,
  byOperator,
  mates,
  order,
}: {
  overall: Record<TeamModeKey, TeamView[]>;
  byOperator: Record<TeamModeKey, Record<string, TeamView[]>>;
  mates: Record<string, TeamMate>;
  order: string[];
}) {
  const [pick, setPick] = useState<string | null>(null);
  const [mode, setMode] = useState<TeamModeKey>("normal");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const op = q.get("op");
    if (op && byOperator.normal[op]) setPick(op);
    if (q.get("mode") === "hard") setMode("hard");
  }, [byOperator]);
  const sync = (id: string | null, m: TeamModeKey) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("op", id);
    else url.searchParams.delete("op");
    if (m === "hard") url.searchParams.set("mode", "hard");
    else url.searchParams.delete("mode");
    window.history.replaceState(null, "", url);
  };
  const choose = (id: string | null) => {
    setPick(id);
    sync(id, mode);
  };
  const chooseMode = (m: TeamModeKey) => {
    setMode(m);
    sync(pick, m);
  };
  const list = pick ? byOperator[mode][pick] : overall[mode];

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-sm font-semibold">콘텐츠 난이도</p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="콘텐츠 난이도">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={mode === m.key}
              onClick={() => chooseMode(m.key)}
              title={m.hint}
              className={cn("border px-3 py-2 text-left text-sm", mode === m.key ? "border-foreground bg-foreground text-background" : "bg-card hover:border-foreground")}
            >
              <b className="block font-semibold">{m.label}</b>
              <span className={cn("block text-[11px]", mode === m.key ? "text-background/80" : "text-muted-foreground")}>{m.hint}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">이 오퍼레이터를 넣고 싶어요</p>
        <ul className="flex flex-wrap gap-1.5">
          <li>
            <button
              type="button"
              onClick={() => choose(null)}
              className={cn("h-12 border px-3 text-sm font-semibold", !pick ? "border-foreground bg-foreground text-background" : "bg-card hover:border-foreground")}
            >
              전체
            </button>
          </li>
          {order.map((id) => {
            const m = mates[id];
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => choose(id)}
                  title={m.name}
                  aria-pressed={pick === id}
                  className={cn("relative block size-12 overflow-hidden border bg-muted", pick === id ? "ring-2 ring-foreground" : "opacity-80 hover:opacity-100")}
                >
                  {m.face && <Image src={m.face} alt={m.name} fill sizes="48px" unoptimized className="object-cover object-top" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <h2 className="text-lg font-bold">
        {pick ? `${mates[pick].name} 베스트 조합` : "전체 베스트 조합"}
        <span className="ml-2 text-sm font-normal text-muted-foreground">{MODES.find((m) => m.key === mode)!.label}</span>
      </h2>
      {list.length === 0 && <p className="text-sm text-muted-foreground">이 조건에 맞는 조합이 없어요.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((t, i) => (
          <TeamCard key={t.ids.join("-")} team={t} mates={mates} rank={i + 1} focus={pick ?? undefined} />
        ))}
      </div>
    </div>
  );
}

"use client";
// 베스트 조합 탐색 — 오퍼레이터를 고르면 그 오퍼레이터가 들어간 조합 (목록은 서버에서 미리 계산)
import Image from "next/image";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { TeamCard, type TeamMate, type TeamView } from "./team-card";

export function TeamFinder({
  overall,
  byOperator,
  mates,
  order,
}: {
  overall: TeamView[];
  byOperator: Record<string, TeamView[]>;
  mates: Record<string, TeamMate>;
  order: string[];
}) {
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => {
    const op = new URLSearchParams(window.location.search).get("op");
    if (op && byOperator[op]) setPick(op);
  }, [byOperator]);
  const choose = (id: string | null) => {
    setPick(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("op", id);
    else url.searchParams.delete("op");
    window.history.replaceState(null, "", url);
  };
  const list = pick ? byOperator[pick] : overall;

  return (
    <div className="space-y-6">
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
      <h2 className="text-lg font-bold">{pick ? `${mates[pick].name} 베스트 조합` : "전체 베스트 조합"}</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((t, i) => (
          <TeamCard key={t.ids.join("-")} team={t} mates={mates} rank={i + 1} focus={pick ?? undefined} />
        ))}
      </div>
    </div>
  );
}

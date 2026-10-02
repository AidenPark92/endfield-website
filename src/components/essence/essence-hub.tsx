"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { EssencePlanner } from "./essence-planner";
import { EngraveMatcher } from "./engrave-matcher";
import type { EssenceRegion, EssenceStats, Operator, Weapon } from "@/types/game";

const TABS = [
  { id: "weapon", label: "무기로 맞추기", desc: "무기 → 지역 → 사전 각인" },
  { id: "operator", label: "오퍼레이터로 찾기", desc: "여러 명 한꺼번에 루트 계산" },
] as const;

interface Props {
  operators: Operator[];
  weapons: Weapon[];
  regions: EssenceRegion[];
  stats: EssenceStats;
}

export function EssenceHub(props: Props) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("weapon");
  return (
    <div>
      <div className="mb-6 flex gap-1 border-b" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px cursor-pointer border-b-2 px-4 py-2 text-left transition-colors",
              tab === t.id ? "border-accent font-bold" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="block text-sm">{t.label}</span>
            <span className="hidden text-[10px] font-normal text-muted-foreground sm:block">{t.desc}</span>
          </button>
        ))}
      </div>
      {tab === "weapon" ? (
        <EngraveMatcher weapons={props.weapons} regions={props.regions} stats={props.stats} />
      ) : (
        <EssencePlanner {...props} />
      )}
    </div>
  );
}

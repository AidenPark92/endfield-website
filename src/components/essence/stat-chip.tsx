import { Badge } from "@/components/ui/badge";
import type { EssenceStats, EssenceTarget, StatCategory } from "@/types/game";

const CATEGORY_LABEL: Record<StatCategory, string> = { base: "기초", extra: "추가", skill: "스킬" };

/** 기질 속성 id → 표시 이름 조회기 */
export function makeStatLabel(stats: EssenceStats) {
  const map = new Map<string, string>();
  (["base", "extra", "skill"] as const).forEach((c) => stats[c].forEach((s) => map.set(`${c}:${s.id}`, s.label)));
  return (category: StatCategory, id: string) => map.get(`${category}:${id}`) ?? id;
}

export type StatLabelFn = ReturnType<typeof makeStatLabel>;

export function StatChip({
  category,
  id,
  label,
  showCategory = false,
  highlight = false,
}: {
  category: StatCategory;
  id: string;
  label: StatLabelFn;
  showCategory?: boolean;
  highlight?: boolean;
}) {
  return (
    <Badge variant={highlight ? "accent" : category} title={`${CATEGORY_LABEL[category]} 속성`}>
      {showCategory && <span className="font-mono text-[9px] opacity-60">{CATEGORY_LABEL[category]}</span>}
      {label(category, id)}
    </Badge>
  );
}

/** 무기 하나가 원하는 기질 3줄을 칩으로 표시 */
export function EssenceChips({ essence, label }: { essence: EssenceTarget; label: StatLabelFn }) {
  return (
    <div className="flex flex-wrap gap-1">
      {(["base", "extra", "skill"] as const).map((c) =>
        essence[c] ? <StatChip key={c} category={c} id={essence[c]!} label={label} /> : null,
      )}
    </div>
  );
}

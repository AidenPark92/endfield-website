import { ChevronDown, Lock, MapPin } from "lucide-react";
import { cn, formatPercent } from "@/lib/utils";
import { expectedDrops, type FarmPlan, type FarmRecommendation } from "@/lib/calc/essence";
import { StatChip, type StatLabelFn } from "./stat-chip";
import type { EssenceRegion, Operator, Weapon } from "@/types/game";
import type { Selection } from "./selection-list";

interface Props {
  plan: FarmPlan;
  /** 펼쳐진 단계 index */
  openStep: number;
  onOpenStep: (i: number) => void;
  /** 단계별로 고른 대체 지역 index (0 = 추천) */
  altByStep: Record<number, number>;
  onAlt: (step: number, alt: number) => void;
  selections: Selection[];
  operatorById: Map<string, Operator>;
  weaponById: Map<string, Weapon>;
  regionById: Map<string, EssenceRegion>;
  label: StatLabelFn;
}

// 3줄 모두 일치할 때의 최대 확률 (기초 1/3 × 무작위 1/8) — 막대 길이 기준
const MAX_CHANCE = 1 / 24;

export function FarmingResult(props: Props) {
  const { plan, openStep, onOpenStep, altByStep, onAlt, selections, operatorById } = props;

  if (selections.length === 0) {
    return <Placeholder text="오퍼레이터를 선택하면 파밍 루트가 여기에 표시됩니다." />;
  }

  return (
    <div className="space-y-2">
      {plan.steps.map((step, i) => {
        const options = [step, ...step.alternatives];
        const chosen = options[Math.min(altByStep[i] ?? 0, options.length - 1)];
        const open = i === openStep;
        return (
          <StepCard
            {...props}
            key={i}
            index={i}
            total={plan.steps.length}
            open={open}
            onToggle={() => onOpenStep(open ? -1 : i)}
            rec={chosen}
            options={options}
            altIndex={altByStep[i] ?? 0}
            onAlt={(a) => onAlt(i, a)}
          />
        );
      })}

      {plan.unreachable.length > 0 && (
        <div className="border border-dashed p-2.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">파밍 불가:</span>{" "}
          {plan.unreachable.map((k) => operatorById.get(k)!.name).join(", ")} — 필요한 속성 조합이 나오는 지역이 없습니다.
        </div>
      )}
    </div>
  );
}

function StepCard({
  index,
  total,
  open,
  onToggle,
  rec,
  options,
  altIndex,
  onAlt,
  selections,
  operatorById,
  weaponById,
  regionById,
  label,
}: Props & {
  index: number;
  total: number;
  open: boolean;
  onToggle: () => void;
  rec: FarmRecommendation;
  options: FarmRecommendation[];
  altIndex: number;
  onAlt: (a: number) => void;
}) {
  const region = regionById.get(rec.config.regionId)!;
  const names = rec.covered.map((c) => operatorById.get(c.key)!.name);
  const weaponOf = (key: string) => weaponById.get(selections.find((s) => s.operatorId === key)!.weaponId)!;
  const neededBases = new Set(rec.covered.map((c) => weaponOf(c.key).essence.base));
  // 같은 점수의 대체 지역만 "동일 효율"로 표시
  const sameScore = options.filter((o) => Math.abs(o.score - options[0].score) < 1e-12 && o.covered.length === options[0].covered.length);

  return (
    <div className={cn("border bg-card transition-shadow", open && "shadow-md")}>
      {/* 헤더 (항상 표시) */}
      <button onClick={onToggle} aria-expanded={open} className="flex w-full cursor-pointer items-center gap-3 p-3 text-left">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center font-mono text-xs font-bold transition-colors",
            open ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">
            {region.name} <span className="text-xs font-normal text-muted-foreground">· {region.area}</span>
          </span>
          <span className="block truncate text-xs text-muted-foreground">{names.join(", ")}</span>
        </span>
        <StatChip category={rec.config.lock.category} id={rec.config.lock.stat} label={label} />
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-3 border-t p-3 animate-in fade-in slide-in-from-top-1">
          {/* 각인 설정 — 다크 패널 */}
          <div key={`${rec.config.regionId}-${rec.config.lock.stat}`} className="ef-scan ef-cut relative overflow-hidden bg-panel text-panel-foreground">
            <div className="flex items-center justify-between px-3 pt-3">
              <span className="font-mono text-[10px] tracking-[0.18em] opacity-60">
                ROUTE {String(index + 1).padStart(2, "0")}/{String(total).padStart(2, "0")} {"//"} 각인 설정
              </span>
              <MapPin className="size-4 text-accent" />
            </div>
            <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 p-3 text-sm">
              <span className="font-mono text-[10px] tracking-widest opacity-60">기초 ×3</span>
              <div className="flex flex-wrap gap-1">
                {rec.config.bases.map((b) => (
                  <span
                    key={b}
                    title={neededBases.has(b) ? "필요한 속성" : "아무거나 (빈자리 채우기)"}
                    className={cn(
                      "border px-1.5 py-0.5 text-[11px]",
                      neededBases.has(b) ? "border-panel-foreground/70 font-semibold" : "border-panel-foreground/20 opacity-45",
                    )}
                  >
                    {label("base", b)}
                  </span>
                ))}
              </div>
              <span className="font-mono text-[10px] tracking-widest opacity-60">고정</span>
              <div className="flex items-center gap-1.5">
                <Lock className="size-3.5 text-accent" />
                <span className="bg-accent px-1.5 py-0.5 text-[11px] font-bold text-accent-foreground">
                  {rec.config.lock.category === "extra" ? "부가" : "스킬"} · {label(rec.config.lock.category, rec.config.lock.stat)}
                </span>
              </div>
            </div>
          </div>

          {/* 오퍼레이터별 확률 */}
          <ul className="space-y-2">
            {rec.covered.map((c) => {
              const w = weaponOf(c.key);
              return (
                <li key={c.key}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate">
                      <b>{operatorById.get(c.key)!.name}</b> <span className="text-xs text-muted-foreground">· {w.name}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs">{formatPercent(c.chance)}</span>
                  </div>
                  <div className="mt-1 h-1.5 bg-muted">
                    <div className="ef-fill h-full bg-accent" style={{ width: `${Math.min(100, (c.chance / MAX_CHANCE) * 100)}%` }} />
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">기질 약 {Math.round(expectedDrops(c.chance))}개당 완벽 기질 1개</p>
                </li>
              );
            })}
          </ul>

          {/* 동일 효율 대체 지역 */}
          {sameScore.length > 1 && (
            <div>
              <p className="ef-label mb-1.5">같은 효율의 다른 지역</p>
              <div className="flex flex-wrap gap-1">
                {sameScore.map((o, a) => (
                  <button
                    key={o.config.regionId}
                    onClick={() => onAlt(a)}
                    aria-pressed={a === altIndex}
                    className={cn(
                      "h-7 cursor-pointer border px-2 text-xs transition-colors",
                      a === altIndex ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
                    )}
                  >
                    {regionById.get(o.config.regionId)!.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="ef-cut relative overflow-hidden border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
      <div className="ef-hatch absolute inset-0 text-foreground/[0.04]" />
      <p className="relative">{text}</p>
    </div>
  );
}

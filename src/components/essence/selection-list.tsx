import Image from "next/image";
import { X } from "lucide-react";
import { EssenceChips, type StatLabelFn } from "./stat-chip";
import type { Operator, Weapon } from "@/types/game";

export interface Selection {
  operatorId: string;
  weaponId: string;
}

interface Props {
  selections: Selection[];
  operatorById: Map<string, Operator>;
  weaponById: Map<string, Weapon>;
  weapons: Weapon[];
  label: StatLabelFn;
  onWeapon: (operatorId: string, weaponId: string) => void;
  onRemove: (operatorId: string) => void;
}

export function SelectionList({ selections, operatorById, weaponById, weapons, label, onWeapon, onRemove }: Props) {
  if (selections.length === 0) {
    return (
      <div className="border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        왼쪽에서 기질을 맞출 오퍼레이터를 골라 주세요.
      </div>
    );
  }

  return (
    <ul className="divide-y border bg-card">
      {selections.map((s, i) => {
        const op = operatorById.get(s.operatorId)!;
        const weapon = weaponById.get(s.weaponId)!;
        const recSkill = op.recommendedWeapons.skill;
        const recAttr = op.recommendedWeapons.attribute.filter((id) => !recSkill.includes(id));
        const recSet = new Set([...recSkill, ...recAttr]);
        const others = weapons.filter((w) => w.type === op.weaponType && !recSet.has(w.id));

        return (
          <li key={s.operatorId} className="flex gap-3 p-3 animate-in fade-in slide-in-from-right-2">
            <span className="w-4 pt-1 font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
            <div className="relative size-11 shrink-0 overflow-hidden border bg-muted">
              <Image src={weapon.cover} alt={weapon.name} fill sizes="44px" className="object-contain p-0.5" unoptimized />
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">{op.name}</span>
                <select
                  value={s.weaponId}
                  onChange={(e) => onWeapon(s.operatorId, e.target.value)}
                  aria-label={`${op.name} 무기 선택`}
                  className="h-7 min-w-0 flex-1 cursor-pointer truncate border bg-background px-1.5 text-xs outline-none focus:border-foreground"
                >
                  <optgroup label="게임 내 추천 · 스킬 조합">
                    {recSkill.map((id) => (
                      <option key={id} value={id}>
                        {weaponById.get(id)!.rarity}★ {weaponById.get(id)!.name}
                      </option>
                    ))}
                  </optgroup>
                  {recAttr.length > 0 && (
                    <optgroup label="게임 내 추천 · 속성 조합">
                      {recAttr.map((id) => (
                        <option key={id} value={id}>
                          {weaponById.get(id)!.rarity}★ {weaponById.get(id)!.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label={`그 외 ${op.weaponType}`}>
                    {others.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.rarity}★ {w.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <EssenceChips essence={weapon.essence} label={label} />
            </div>
            <button
              onClick={() => onRemove(s.operatorId)}
              aria-label={`${op.name} 제거`}
              className="grid size-6 shrink-0 cursor-pointer place-items-center text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

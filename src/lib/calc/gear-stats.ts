// 장비 능력치 표시용 순수 함수 — 라벨·형식·합산 (UI와 분리)
import type { GearAttr, GearPiece } from "@/types/build";

export type AttrTypes = Record<string, { name: string; kind: string }>;
export type AttrName = "힘" | "민첩" | "지능" | "의지";
export type StatKind = "flat" | "ratio" | "mult";

export interface GearStatRow {
  /** 합산 키 (같은 키끼리 더함) */
  key: string;
  name: string;
  kind: StatKind;
  value: number;
}

const ATTR_TYPE_OF: Record<AttrName, number> = { 힘: 39, 민첩: 40, 지능: 41, 의지: 42 };
/** 표시 순서: 방어력 → 4대 능력치 → 나머지(처음 나온 순서) */
const ORDER = [3, 39, 40, 41, 42];

/** 장비 id의 등급 (item_equip_t4_… → 4), 없으면 0 */
export function gearTier(id: string): number {
  return Number(id.match(/_t(\d)_/)?.[1] ?? 0);
}

/**
 * 옵션 하나의 이름·형식.
 * modifierType: 5 = 고정값(형식은 attr-types), 6 = 비율, 7 = 고정값, 8 = 배율
 * attrType 0 은 target 1 주요 / 2 보조 능력치 — 오퍼레이터를 알면 실제 능력치 이름으로
 */
export function gearAttrInfo(
  a: GearAttr,
  attrTypes: AttrTypes,
  attrs?: { main: AttrName; sub: AttrName },
): { key: string; name: string; kind: StatKind } {
  const kind: StatKind =
    a.modifierType === 6 ? "ratio" : a.modifierType === 7 ? "flat" : a.modifierType === 8 ? "mult" : ((attrTypes[String(a.attrType)]?.kind as StatKind) ?? "flat");
  if (a.attrType === 0) {
    const which = a.target === 1 ? "main" : a.target === 2 ? "sub" : null;
    const real = which && attrs ? attrs[which] : null;
    if (real) return { key: `${ATTR_TYPE_OF[real]}:${kind}`, name: real, kind };
    const name = which === "main" ? "주요 능력치" : which === "sub" ? "보조 능력치" : "능력치";
    return { key: `0:${a.target ?? 0}:${kind}`, name, kind };
  }
  const name = attrTypes[String(a.attrType)]?.name ?? `#${a.attrType}`;
  return { key: `${a.attrType}:${kind}`, name, kind };
}

/** 단조 단계 값 (단계가 모자라면 마지막 값) */
export const forgeValue = (a: GearAttr, forge: number) => a.values[Math.min(forge, a.values.length - 1)] ?? 0;

/** 수치 형식: 비율 % · 배율 × · 고정값은 소수 1자리까지 */
export function formatGearValue(v: number, kind: StatKind): string {
  if (kind === "ratio") {
    const p = v * 100;
    return `${p.toFixed(p < 10 && p % 1 !== 0 ? 1 : 0)}%`;
  }
  if (kind === "mult") return `×${Math.round(v * 1000) / 1000}`;
  return String(Math.round(v * 10) / 10);
}

/** 장비 한 개의 옵션 목록 */
export function pieceStats(p: GearPiece, forge: number, attrTypes: AttrTypes, attrs?: { main: AttrName; sub: AttrName }): GearStatRow[] {
  return p.attrs.map((a) => ({ ...gearAttrInfo(a, attrTypes, attrs), value: forgeValue(a, forge) }));
}

/**
 * 장착 보너스 합계 — 같은 옵션끼리 더함 (배율은 곱함).
 * 세트 효과는 조건부라 여기 넣지 않음.
 */
export function sumGearStats(pieces: GearPiece[], forge: number, attrTypes: AttrTypes, attrs?: { main: AttrName; sub: AttrName }): GearStatRow[] {
  const rows = new Map<string, GearStatRow>();
  for (const p of pieces)
    for (const r of pieceStats(p, forge, attrTypes, attrs)) {
      const cur = rows.get(r.key);
      if (!cur) rows.set(r.key, { ...r });
      else cur.value = r.kind === "mult" ? cur.value * r.value : cur.value + r.value;
    }
  const rank = (r: GearStatRow) => {
    const t = Number(r.key.split(":")[0]);
    const i = ORDER.indexOf(t);
    return i >= 0 && r.kind === "flat" ? i : ORDER.length;
  };
  return [...rows.values()].map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i).map(({ r }) => r);
}

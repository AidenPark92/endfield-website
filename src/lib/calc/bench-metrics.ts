// 커뮤니티 기준 일치율 계산 (테스트·보정 전용) — data/benchmarks
import { getBuildRecommendation } from "@/lib/data";
import community from "@data/benchmarks/endfieldtools-community-gear.json";
import bestBuild from "@data/benchmarks/endfieldtools-best-build.json";

type CommunityOp = {
  name: string;
  entries: number;
  suits: { suitId: string; name: string | null; count: number }[];
  body: [string, number][];
  hand: [string, number][];
  edc: [string, number][];
};
type BestBuildOp = { name: string; weapons: { id: string; name: string; count: number }[] };

/** 표본 10개 이상 · 1위 세트가 절반 이상(합의가 있는 경우)만 */
export const MIN_ENTRIES = 10;

export interface GearMetrics {
  n: number;
  top1: number;
  top3: number;
  pieceHit: number;
  pieceN: number;
  lines: string[];
}

/** 장비: 커뮤니티 1위 세트가 우리 몇 위인지 + 그 세트에서 고른 4칸이 커뮤니티 부위별 상위(방어구·장갑 2개, 부품 3개)에 드는지 */
export function gearMetrics(): GearMetrics {
  const ops = (community as unknown as { operators: Record<string, CommunityOp> }).operators;
  const m: GearMetrics = { n: 0, top1: 0, top3: 0, pieceHit: 0, pieceN: 0, lines: [] };
  for (const [id, b] of Object.entries(ops)) {
    const best = b.suits.find((s) => s.suitId !== "none");
    if (b.entries < MIN_ENTRIES || !best || best.count < b.entries * 0.5) continue;
    const r = getBuildRecommendation(id);
    if (!r) continue;
    m.n++;
    const ours = r.gear.map((g) => g.suitId);
    const rk = ours.indexOf(best.suitId) + 1 || 99;
    if (rk === 1) m.top1++;
    if (rk <= 3) m.top3++;
    const g = r.gear.find((x) => x.suitId === best.suitId);
    if (g) {
      const topOf = (list: [string, number][], k: number) => list.slice(0, k).map(([x]) => x);
      const want = [topOf(b.body, 2), topOf(b.hand, 2), topOf(b.edc, 3), topOf(b.edc, 3)];
      g.pieces.forEach((p, i) => {
        m.pieceN++;
        if (want[i].includes(p.id)) m.pieceHit++;
      });
    }
    if (rk > 1)
      m.lines.push(
        `${b.name.padEnd(7)} 커뮤 ${b.suits.filter((s) => s.suitId !== "none").slice(0, 2).map((s) => `${s.name}(${s.count})#${ours.indexOf(s.suitId) + 1}`).join(", ")} | 우리 ${r.gear.slice(0, 3).map((x) => x.suitName).join(", ")}`,
      );
  }
  return m;
}

/** 무기: 캐릭터 페이지 Best Build 1위 무기가 우리 몇 위인지 */
export function weaponMetrics(): { n: number; top1: number; top3: number } {
  const ops = (bestBuild as unknown as { operators: Record<string, BestBuildOp> }).operators;
  let n = 0, top1 = 0, top3 = 0;
  for (const [id, b] of Object.entries(ops)) {
    const r = getBuildRecommendation(id);
    if (!r) continue;
    const rk = r.weapons.map((w) => w.id).indexOf(b.weapons[0].id) + 1;
    n++;
    if (rk === 1) top1++;
    if (rk <= 3) top3++;
  }
  return { n, top1, top3 };
}

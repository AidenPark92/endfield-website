// 가정값 보정: ASSUME 조합마다 커뮤니티 일치율 (오래 걸려서 CALIBRATE=1 일 때만)
import { test } from "vitest";
import { ASSUME } from "./build";
import { resetBuildCache } from "@/lib/data";
import { gearMetrics, weaponMetrics } from "./bench-metrics";

test.skipIf(!process.env.CALIBRATE)("ASSUME 보정", { timeout: 3600000 }, () => {
  const grid = JSON.parse(process.env.GRID ?? "null") ?? {
    comboCdrRealized: [0, 0.5, 1],
    stackRefresh: [true, false],
    critHitScale: [1, 2, 4],
  };
  const keys = Object.keys(grid) as (keyof typeof ASSUME)[];
  const saved = { ...ASSUME };
  const combos: Record<string, unknown>[] = [{}];
  for (const k of keys) combos.splice(0, combos.length, ...combos.flatMap((c) => (grid[k] as unknown[]).map((v) => ({ ...c, [k]: v }))));
  for (const c of combos) {
    Object.assign(ASSUME, saved, c);
    resetBuildCache();
    const g = gearMetrics();
    const w = weaponMetrics();
    console.log(`${JSON.stringify(c)} 장비 top1=${g.top1}/${g.n} top3=${g.top3} 부위=${g.pieceHit}/${g.pieceN} | 무기 top1=${w.top1}/${w.n} top3=${w.top3}`);
  }
  Object.assign(ASSUME, saved);
  resetBuildCache();
});

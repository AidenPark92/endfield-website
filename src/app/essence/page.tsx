import type { Metadata } from "next";
import { EssenceHub } from "@/components/essence/essence-hub";
import { essenceRegions, essenceRegionsMeta, essenceStats, operators, weapons } from "@/lib/data";

export const metadata: Metadata = {
  title: "기질 파밍 플래너",
  description: "오퍼레이터별 무기 기질을 한 번에 노릴 수 있는 파밍 지역과 각인 설정 추천",
};

export default function EssencePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-8 border-b pb-6">
        <p className="ef-label">MOD-01 // Essence Planner</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">기질 파밍 플래너</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          무기를 고르면 필요한 기질(기초 · 추가 · 스킬 속성)을 맞출 수 있는 지역과 사전 각인 설정을 알려줍니다.
          여러 오퍼레이터를 한꺼번에 노릴 때는 ‘오퍼레이터로 찾기’를 쓰세요.
        </p>

        <details className="group mt-4 max-w-2xl text-sm">
          <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground hover:text-foreground">
            <span className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span>
            어떻게 계산하나요?
          </summary>
          <ul className="mt-2 list-disc space-y-1 border-l-2 border-accent pl-6 text-xs text-muted-foreground">
            <li>각인권을 쓰면 기초 속성 3개를 고르고(그중 1개가 무작위), 부가 또는 스킬 속성 1개를 고정합니다.</li>
            <li>고정하지 않은 쪽은 지역 풀 8개 중 무작위 → 3줄이 모두 맞을 확률은 최대 1/3 × 1/8 ≈ 4.17%.</li>
            <li>선택한 모든 무기에 대해 이 확률의 합이 가장 큰 지역·설정을 추천합니다.</li>
          </ul>
        </details>

        {!essenceRegionsMeta.verified && (
          <p className="mt-3 inline-block border border-dashed px-2 py-1 text-[11px] text-muted-foreground">
            ⚠ 지역별 기질 풀은 아직 검증되지 않았습니다.
          </p>
        )}
      </header>

      <EssenceHub operators={operators} weapons={weapons} regions={essenceRegions} stats={essenceStats} />
    </div>
  );
}

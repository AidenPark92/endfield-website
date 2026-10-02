import type { Metadata } from "next";
import { EssenceFarm } from "@/components/essence/essence-farm";
import { essenceRegions, essenceRegionsMeta, essenceStats, weapons } from "@/lib/data";

export const metadata: Metadata = {
  title: "기질 파밍",
  description: "무기마다 정해진 기질 속성 3가지를 가장 효율적으로 파밍할 수 있는 구역과 기질 선택권 설정",
};

export default function EssencePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-8 border-b pb-6">
        <p className="ef-label">MOD-01 // Essence Farming</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">기질 파밍</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          무기마다 필요한 기질 속성 3가지(기초 · 추가 · 스킬)가 정해져 있어요. 무기를 고르면 4번 협곡 · 무릉의 파밍 구역 중
          어디서, 어떤 속성을 고정해야 가장 효율적인지 알려줍니다.
        </p>

        <ol className="mt-4 grid max-w-3xl gap-2 text-xs sm:grid-cols-3">
          {[
            ["무기 선택", "필요한 속성 3개 확인"],
            ["파밍 구역", "구역마다 나오는 추가·스킬 속성이 달라요"],
            ["기질 선택권", "기초 3개 + 추가/스킬 1개 고정, 나머지 1개는 무작위"],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-2 border bg-card p-2.5">
              <span className="font-mono font-bold text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              <span>
                <b className="block">{t}</b>
                <span className="text-muted-foreground">{d}</span>
              </span>
            </li>
          ))}
        </ol>

        {!essenceRegionsMeta.verified && (
          <p className="mt-3 inline-block border border-dashed px-2 py-1 text-[11px] text-muted-foreground">
            ⚠ 구역별 기질 풀은 아직 검증되지 않았습니다.
          </p>
        )}
      </header>

      <EssenceFarm weapons={weapons} regions={essenceRegions} stats={essenceStats} />
    </div>
  );
}

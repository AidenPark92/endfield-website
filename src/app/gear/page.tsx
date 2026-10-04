import type { Metadata } from "next";
import { gearImages, gearPieces, gearSuits } from "@/lib/data";
import { GearBrowser } from "@/components/gear/gear-browser";
import attrTypesJson from "@data/combat/attr-types.json";

export const metadata: Metadata = {
  title: "장비",
  description: "엔드필드 장비 전체 — 세트 효과, 부위별 옵션, 단조 단계별 수치",
};

export default function GearPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6 border-b pb-6">
        <p className="ef-label">MOD-03 // Gear</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">장비</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          세트 {Object.keys(gearSuits).length}종 · 장비 {Object.keys(gearPieces).length}종. 같은 세트 장비를 3개 이상 끼면 세트 효과가 켜져요. 수치는 게임 데이터 기준이며 단조
          단계를 바꿔 볼 수 있어요.
        </p>
      </header>
      <GearBrowser pieces={gearPieces} suits={gearSuits} attrTypes={attrTypesJson.attrTypes} images={gearImages} />
    </div>
  );
}

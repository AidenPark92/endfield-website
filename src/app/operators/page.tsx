import type { Metadata } from "next";
import { OperatorBrowser } from "@/components/operators/operator-browser";
import { operators } from "@/lib/data";

export const metadata: Metadata = {
  title: "캐릭터",
  description: "속성 · 직업 · 무기 · 등급 · 진영으로 찾아보는 엔드필드 오퍼레이터 목록과 소개",
};

export default function OperatorsPage() {
  // 목록 화면엔 능력치가 필요 없으니 클라이언트로 보내는 데이터에서 뺀다
  const list = [...operators]
    .sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name, "ko"))
    .map((o) => ({ ...o, stats: undefined, statMilestones: undefined }));
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6 border-b pb-6">
        <p className="ef-label">MOD-02 // Operators</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">캐릭터</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          엔드필드의 오퍼레이터를 속성, 직업, 무기, 등급, 진영으로 찾아보세요. 캐릭터를 누르면 소개와 스토리, 기본 정보, 추천 무기를 볼 수 있어요.
        </p>
      </header>
      <OperatorBrowser operators={list} />
    </div>
  );
}

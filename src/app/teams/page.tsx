import type { Metadata } from "next";
import { allTeams, bestTeamsFor, operators, rerankWithGear, teamView } from "@/lib/data";
import { TeamFinder } from "@/components/teams/team-finder";
import type { TeamMate } from "@/components/teams/team-card";

export const metadata: Metadata = {
  title: "베스트 조합",
  description: "엔드필드 연계 스킬 시너지로 계산한 4인 베스트 조합",
};

export default function TeamsPage() {
  const all = allTeams();
  // 관리자(남/여)는 같은 캐릭터 → 전체 순위에선 한쪽만
  const overall = rerankWithGear(
    all.filter((t) => !t.ids.includes("3")),
    12,
  ).map(teamView);
  const byOperator = Object.fromEntries(operators.map((o) => [o.id, bestTeamsFor(o.id, 6).map(teamView)]));
  const mates: Record<string, TeamMate> = Object.fromEntries(
    operators.map((o) => [o.id, { id: o.id, name: o.name, face: o.face, element: o.element, cls: o.profile?.class }]),
  );
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6 border-b pb-6">
        <p className="ef-label">MOD-04 // Squad</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">베스트 조합</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          오퍼레이터 {operators.length}명으로 만들 수 있는 4인 조합 {all.length.toLocaleString()}개를 <b className="text-foreground">연계 스킬 시너지</b>로 평가했어요. 한
          명의 스킬이 만든 상태(부착·아츠 이상·방어 불능)가 다른 동료의 연계 발동 조건이 될수록 높은 점수예요. 오퍼레이터를 고르면 그 오퍼레이터가 들어간 베스트
          조합을 보여 줘요.
        </p>
      </header>
      <TeamFinder overall={overall} byOperator={byOperator} mates={mates} order={operators.map((o) => o.id)} />
      <details className="mt-8 border bg-card px-4 py-3 text-sm">
        <summary className="cursor-pointer font-semibold">점수는 어떻게 계산하나요?</summary>
        <div className="mt-2 space-y-1 text-[13px] leading-6 text-muted-foreground">
          <p>시너지 점수 = 연계 발동 가능 인원 × 10 + 동료 연결 점수 (최대 64점)</p>
          <p>
            동료 연결: 동료가 있어야만 열리는 연계는 채워 주는 동료 1명당 3점, 혼자서도 되지만 동료가 더 자주 채워 주는 연계는 1명당 1점(받는 사람당 2명까지).
          </p>
          <p>
            누가 무엇을 만드는지는 게임 데이터의 전투 태그(전기 부착, 띄우기, 감전 등) 기준이에요. 아츠 이상(연소·감전·동결·부식)은 다른 속성 부착이 먼저 있어야
            하므로, 서로 다른 속성을 부착하는 동료가 함께 있을 때 만들 수 있다고 봐요. 불균형·강력한 일격은 누구나 만들 수 있는 조건이에요.
          </p>
          <p>
            1차 순위는 &quot;연계가 서로 잘 이어지는가&quot;예요. 시너지 점수가 같으면 <b className="text-foreground">파티 화력</b>(아래 파티 장비를 낀 딜러들의 피해
            기대치 합)이 높은 조합을 위에 둬요. 조작 실력·실제 스킬 사이클은 넣지 않았어요.
          </p>
          <p className="font-semibold text-foreground">파티 장비 — 같은 오퍼레이터도 파티마다 장비가 달라요</p>
          <p>
            개인 추천 장비는 &quot;아무 팀원 3명&quot;을 가정한 기대값이에요. 파티가 정해지면 ① 세트 조건(부착·반응·동료가 만드는 상태)을 실제 팀원으로 판정하고 ② 팀 버프 중첩
            규칙을 적용하고(&quot;팀 전체&quot; 버프 개척은 둘이 들면 낭비, &quot;다른 팀원&quot; 버프 식양의 숨결은 본인이 못 받아서 둘이 들면 서로를 채워 줌) ③ 팀 버프 가치를 실제
            팀원의 피해(딜러일수록 크게)로 계산해, 4명의 장비를 한 명씩 번갈아 바꿔 보며 더 나아지지 않을 때까지 맞춰요.
          </p>
          <p>
            검증: endfieldtools.dev 공개 팀 빌드에서 많이 쓰인 4인 조합 30개의 멤버별 세트와 비교하면, 개인 추천 그대로는 113명 중 70명, 파티 맞춤은 74명이 같아요.
          </p>
        </div>
      </details>
    </div>
  );
}

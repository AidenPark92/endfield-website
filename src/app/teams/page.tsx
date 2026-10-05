import type { Metadata } from "next";
import { allTeams, bestTeams, bestTeamsFor, operators, OVERALL_N, teamView } from "@/lib/data";
import { TeamFinder } from "@/components/teams/team-finder";
import type { TeamMate } from "@/components/teams/team-card";

export const metadata: Metadata = {
  title: "베스트 조합",
  description: "엔드필드 4인 조합을 팀 피해(SP 공유 · 연계 · 시너지 버프 · 스킬 사이클)로 계산한 베스트 조합",
};

export default function TeamsPage() {
  const all = allTeams();
  const overall = bestTeams(OVERALL_N).map(teamView);
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
          오퍼레이터 {operators.length}명으로 만들 수 있는 4인 조합 {all.length.toLocaleString()}개를 <b className="text-foreground">팀 피해</b>로 평가했어요. 팀
          SP를 누가 쓰는지, 연계가 얼마나 자주 열리는지, 서포터 버프·디버프가 얼마나 유지되는지까지 넣어 메인 딜과 서브 딜이 함께 가장 높게 나오는 조합을 찾아요.
          오퍼레이터를 고르면 그 오퍼레이터가 핵심 역할을 하는 조합을 보여 줘요.
        </p>
      </header>
      <TeamFinder overall={overall} byOperator={byOperator} mates={mates} order={operators.map((o) => o.id)} />
      <details className="mt-8 border bg-card px-4 py-3 text-sm">
        <summary className="cursor-pointer font-semibold">점수는 어떻게 계산하나요?</summary>
        <div className="mt-2 space-y-1 text-[13px] leading-6 text-muted-foreground">
          <p className="font-semibold text-foreground">팀 화력 = 4명의 피해 합 (스킬 사이클 시뮬레이션)</p>
          <p>
            ① <b className="text-foreground">SP는 팀 공유</b>: 자연 회복(초당 약 8) + 조작 캐릭터의 강력한 일격 + 뱅가드 회복을 네 명이 나눠 써요. SP를 조금씩
            나눠 주며 팀 피해가 가장 많이 오르는 사람에게 배틀 스킬을 주는 방식으로 배분해요 — 보통 메인 딜러가 대부분, 버프를 거는 서포터가 버프 유지만큼 써요.
          </p>
          <p>
            ② <b className="text-foreground">궁극기</b>: 배틀 스킬은 소모 SP 100당 팀 전원에게 6.5 에너지, 연계는 본인에게(스킬 표 수치). 레바테인 추가 공격처럼
            스택을 모아 얻는 에너지, 라스트 라이트처럼 본인 스킬로만 에너지를 얻는 경우도 반영해요.
          </p>
          <p>
            ③ <b className="text-foreground">연계</b>: 쿨타임이 끝나도 조건을 만들어 줄 동료의 스킬이 와야 쓸 수 있어요. 빈도 = 1 ÷ (쿨타임 + 다음 기회까지 평균
            대기). 조건을 못 채우는 연계는 0이에요.
          </p>
          <p>
            ④ <b className="text-foreground">시너지 버프</b>: 스킬이 주는 증폭·취약·공격력과 감전·갑옷 파괴·부식 디버프를 가동률(스킬 빈도 × 지속 시간)만큼,
            속성이 맞는 팀원에게 더해요. 부착 스택을 소모하는 스킬(이본·라스트 라이트·로시)은 같은 속성 부착 동료가 많을수록 세지고, 다른 속성이 섞이면 아츠
            이상으로 스택이 사라져 약해져요.
          </p>
          <p>
            순위: 1차로 모든 조합을 빠른 근사(개인 추천 장비)로 계산하고, 상위 조합만 파티 장비까지 맞춘 정밀 계산으로 다시 줄 세워요. 전체 순위는 메인 딜러마다
            최대 2개까지만 보여 줘요. 오퍼레이터별 순위는 팀 화력 × √기여도(그 오퍼레이터가 빠지면 줄어드는 팀 피해 비율)예요.
          </p>
          <p>
            검증: endfieldtools.dev 인기 4인 조합(스트라이커 기준)이 그 오퍼레이터 조합 약 4,900개 중 평균 341위(기하 평균) — 연계 시너지만 볼 때는 509위였어요.
            아츠 반응 피해, 처형·조작 실력은 아직 넣지 않았어요.
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

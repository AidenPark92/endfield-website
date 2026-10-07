import type { Metadata } from "next";
import { allTeams, bestTeams, bestTeamsFor, operators, OVERALL_N, teamView } from "@/lib/data";
import { TeamFinder } from "@/components/teams/team-finder";
import type { TeamMate } from "@/components/teams/team-card";

export const metadata: Metadata = {
  title: "베스트 조합",
  description: "엔드필드 4인 조합을 전투 시뮬레이션(아츠·물리 이상, SP 공유, 연계 조건, 버프 가동률)으로 계산한 베스트 조합",
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
          4명이 실제로 90초 싸우는 전투를 시뮬레이션해 부착·이상 반응, SP를 누가 쓰는지, 연계가 열리는 조건, 버프 유지까지 게임 규칙대로 계산해요.
          오퍼레이터를 고르면 그 오퍼레이터가 핵심 역할을 하는 조합을 보여 줘요.
        </p>
      </header>
      <TeamFinder overall={overall} byOperator={byOperator} mates={mates} order={operators.map((o) => o.id)} />
      <details className="mt-8 border bg-card px-4 py-3 text-sm">
        <summary className="cursor-pointer font-semibold">점수는 어떻게 계산하나요?</summary>
        <div className="mt-2 space-y-1 text-[13px] leading-6 text-muted-foreground">
          <p className="font-semibold text-foreground">팀 화력 = 4명이 보스 1명과 90초 싸우는 전투 시뮬레이션의 초당 피해</p>
          <p>
            오퍼레이터 33명의 스킬을 게임 데이터(스킬 표 수치·설명)대로 하나씩 옮겨, 실제 전투처럼 시간 순서로 돌려요. 적에게는{" "}
            <b className="text-foreground">아츠 부착(같은 속성 최대 4스택)·아츠 폭발·아츠 이상(연소·감전·동결·부식)·쇄빙</b>,{" "}
            <b className="text-foreground">방어 불능·띄우기·넘어뜨리기·강타·갑옷 파괴</b>, 불균형이 실제로 쌓이고 사라져요. 그래서 같은 속성끼리 모인 팀은
            스택이 유지되고(라스트 라이트·티프로스·레바테인처럼 스택을 먹는 딜러가 강해짐), 다른 속성이 섞이면 반응으로 스택이 날아가요.
          </p>
          <p>
            ① <b className="text-foreground">SP는 팀 공유</b>(초당 약 8 + 조작 캐릭터의 강력한 일격 + 스킬 회복). 누가 배틀 스킬을 쓸지는 메인 딜러 후보와 SP
            배분 방식(메인 딜러 우선 / 조건이 없을 때 서포터 / 딜러가 원하는 상태 먼저 깔기 / 지금 쓰면 피해가 가장 큰 사람)을 바꿔 가며 돌려 보고 가장 강한 운영을 써요.
          </p>
          <p>
            ② <b className="text-foreground">연계</b>는 동료가 만든 상태·이벤트(강력한 일격, 부착, 이상, 방어 불능 3스택…)가 생긴 뒤 7초 안에, 쿨타임이 끝났을 때만 나가요.
            장방이(감전 소모 → 청뢰검), 아크라이트(감전 중 SP 회수), 관리자(다른 연계 → 오리지늄 결정) 같은 연쇄가 그대로 일어나요.
          </p>
          <p>
            ③ <b className="text-foreground">궁극기</b>: 배틀 스킬마다 팀 전원 6.5(반환 SP 제외), 연계는 본인, 스킬 표의 추가 에너지(이본 스택당 30 등). 궁극기 모드(레바테인·장방이·이본)는
            그 동안 조작 캐릭터가 바뀌어요.
          </p>
          <p>
            ④ <b className="text-foreground">버프·디버프</b>(증폭·취약·받는 피해·공격력·저항 감소)는 걸린 시간 동안만, 맞는 속성에만 적용돼요. 순위 점수에는 치유 담당이 없는 조합에 ×0.9
            생존 보정을 곱해요.
          </p>
          <p>
            검증: 해외 공략 사이트(Prydwen·endfieldhub·Game8·GameWith·genshin-builds) 상위 조합 23개가 전체 3만6천 개 조합 중 기하평균 약 2,000위(그 딜러 조합 4,500개 중 약 270위)예요.
            이전 모델은 4,800위 / 870위였어요. 1위 조합(장방이·펠리카·아크라이트·리노)은 해외 SS 조합과 같아요. 회피·처형·다수 적·조작 실력은 넣지 않았어요.
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

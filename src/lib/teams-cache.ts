// 베스트 조합 결과 캐시 (data/generated/teams.json)
//
// 4인 조합 4만여 개의 팀 전투 시뮬레이션 + 파티 무기·장비 최적화는 몇 분이 걸린다.
// dev 서버는 페이지를 열 때마다 다시 계산하므로, 결과(화면용 직렬화 데이터)를 파일로 미리 만들어 두고 읽는다.
//   - 만들기: npm run teams:build (scripts/build-teams.ts)
//   - 계산 입력(src/lib·src/types 코드, data/*.json·data/combat/*.json)의 해시가 파일과 다르면 오래된 캐시 → 다시 계산
//     (dev 에서는 다시 계산한 결과를 파일에 저장해서 다음부터 빠르게)
//   - teams-cache.test.ts 가 해시가 최신인지 확인 (계산 코드·데이터를 바꾸고 teams:build 를 잊으면 실패)
// 서버 전용(fs) — 클라이언트 컴포넌트에서 import 하지 말 것
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
// 계산 모듈(@/lib/data — 게임 데이터 JSON 전체)은 다시 계산할 때만 불러옴 → 캐시가 있으면 페이지가 가볍게 컴파일·렌더
import type { teamView } from "@/lib/data";
import type { TeamMate } from "@/components/teams/team-card";

export type TeamCardView = ReturnType<typeof teamView>;

export interface TeamsCache {
  version: 2;
  /** 계산 입력 해시 (inputsHash) */
  hash: string;
  generatedAt: string;
  /** 평가한 4인 조합 수 */
  total: number;
  /** 화면용 오퍼레이터 정보 · 표시 순서 */
  mates: Record<string, TeamMate>;
  order: string[];
  /** 전체 베스트 조합 (OVERALL_N개) */
  overall: TeamCardView[];
  /** 오퍼레이터별 베스트 조합 (PER_OPERATOR_N개) */
  byOperator: Record<string, TeamCardView[]>;
}

/** 오퍼레이터별 저장 개수 (/teams 6개 · 오퍼레이터 페이지 앞 3개 — rerankWithGear 창이 같아 앞 3개 = bestTeamsFor(id, 3)) */
export const PER_OPERATOR_N = 6;

const ROOT = process.cwd();
const INF = "__Infinity__";
export const TEAMS_CACHE_FILE = path.join(ROOT, "data", "generated", "teams.json");

/** 계산 입력 파일 — 베스트 조합 결과에 영향을 주는 코드·데이터 (테스트 파일 제외) */
function inputFiles(): string[] {
  const list = (dir: string, ext: RegExp, deep: boolean): string[] => {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return [];
    return fs
      .readdirSync(abs, { withFileTypes: true })
      .flatMap((e) => {
        const rel = path.posix.join(dir, e.name);
        if (e.isDirectory()) return deep ? list(rel, ext, deep) : [];
        return ext.test(e.name) && !/\.test\.ts$/.test(e.name) && !e.name.startsWith("_") ? [rel] : [];
      });
  };
  return [
    ...list("src/lib", /\.ts$/, true),
    ...list("src/types", /\.ts$/, true),
    ...list("data", /\.json$/, false),
    ...list("data/combat", /\.json$/, false),
  ].sort();
}

/** 계산 입력 해시 (줄바꿈 CRLF/LF 차이는 무시) */
export function inputsHash(): string {
  const h = createHash("sha256");
  for (const f of inputFiles()) {
    h.update(f);
    h.update("\0");
    h.update(fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\r\n/g, "\n"));
    h.update("\0");
  }
  return h.digest("hex").slice(0, 16);
}

/** 전부 계산 (몇 분) */
export async function computeTeamsCache(hash = inputsHash()): Promise<TeamsCache> {
  const { allTeams, bestTeams, bestTeamsFor, operators, OVERALL_N, teamView } = await import("@/lib/data");
  return {
    version: 2,
    hash,
    generatedAt: new Date().toISOString(),
    total: allTeams().length,
    mates: Object.fromEntries(operators.map((o) => [o.id, { id: o.id, name: o.name, face: o.face, element: o.element, cls: o.profile?.class }])),
    order: operators.map((o) => o.id),
    overall: bestTeams(OVERALL_N).map(teamView),
    byOperator: Object.fromEntries(operators.map((o) => [o.id, bestTeamsFor(o.id, PER_OPERATOR_N).map(teamView)])),
  };
}

export function writeTeamsCache(c: TeamsCache) {
  fs.mkdirSync(path.dirname(TEAMS_CACHE_FILE), { recursive: true });
  // JSON 에 Infinity 가 없음 → 표식 문자열로 (teamView 의 스킬 간격: 안 쓰면 Infinity)
  fs.writeFileSync(TEAMS_CACHE_FILE, JSON.stringify(c, (_, v) => (v === Infinity ? INF : v)) + "\n");
}

/** 파일의 캐시 (해시가 다르면 undefined) */
export function readTeamsCache(hash = inputsHash()): TeamsCache | undefined {
  try {
    const c = JSON.parse(fs.readFileSync(TEAMS_CACHE_FILE, "utf8"), (_, v) => (v === INF ? Infinity : v)) as TeamsCache;
    return c.version === 2 && c.hash === hash ? c : undefined;
  } catch {
    return undefined;
  }
}

let memo: TeamsCache | undefined;
/** 베스트 조합 결과 — 최신 캐시가 있으면 바로, 없으면 계산 (dev 에서는 파일에 저장) */
export async function getTeamsCache(): Promise<TeamsCache> {
  if (memo) return memo;
  const hash = inputsHash();
  const hit = readTeamsCache(hash);
  if (hit) return (memo = hit);
  console.warn("[teams-cache] data/generated/teams.json 이 없거나 오래됨 → 베스트 조합 다시 계산 (몇 분). `npm run teams:build` 로 미리 만들어 두세요.");
  const c = await computeTeamsCache(hash);
  if (process.env.NODE_ENV !== "production") {
    try {
      writeTeamsCache(c);
    } catch {
      // 읽기 전용 환경이면 저장 생략
    }
  }
  return (memo = c);
}

/** 오퍼레이터 페이지용: 이 오퍼레이터의 베스트 조합 n개 */
export async function teamsForOperator(id: string, n = 3): Promise<TeamCardView[]> {
  return ((await getTeamsCache()).byOperator[id] ?? []).slice(0, n);
}

# Endfield Field Note

명일방주: 엔드필드 공략 사이트 (비공식).

## 실행

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # 계산 로직 + 데이터 무결성 테스트
npm run build
```

## 구조

```
data/                     게임 데이터 (JSON) — 계산은 여기 값만 사용
  essence-stats.json      기질 속성 정의 (기초 5 / 부가 12 / 스킬 14)
  essence-regions.json    지역별 기질 풀 12곳 (인게임 캡처 기준)
  weapons.json            무기 80종 + 추천 주입 기질
  operators.json          오퍼레이터 33명 + 게임 내 추천 무기
  operator-profiles.json  직업·기본 정보·특기/취미·스킬 이름 + 사이트에서 쓴 스토리 요약 (원문은 위키 링크)
  operator-images.json    캐릭터 이미지 매핑 (전신 / 얼굴)
  operator-stats.json     레벨 1~90 기본 능력치 (생명력·공격력·힘/민첩/지능/의지) — build-combat-data.py 가 생성
  combat/                 데미지 계산 원본 (게임 클라이언트 데이터 기반, endfieldtools.dev localdb)
    characters.json       스킬 레벨 1~12 수치(blackboard)·잠재·재능·돌파 재료
    weapons.json          무기 레벨별 기초 공격력·스킬 3종 레벨별 수치·돌파/재련
    gear.json             장비 부위 옵션(단조 단계별)·세트 효과
    attr-types.json       attrType 번호 → 이름
  operator-details.json   공식 위키 상세: 스킬 랭크별 배율·SP·쿨타임·궁 에너지, 재능, 잠재, 정예화·레벨·스킬 재료 (데미지·육성 계산 원본)
  raw/                    수집 원본 (operators_wiki_raw.json = 공식 위키 표, endfieldtools/bundle.json.gz = 게임 데이터 묶음)
docs/combat/               전투 메커니즘 기준 문서 (데미지 계산기·측정 수치화는 여기 기준)
  combat-mechanics.md     전투 구조 · 아츠/물리 이상 수치 · 데미지 공식 (출처·신뢰도 표기)
  combat-verification.md  미확인 수치 인게임 측정 방법
scripts/build-data.mjs    raw → data/*.json 정규화
scripts/build-operator-images.py  src/images/캐릭터 → public/operators (전신 720px, 얼굴 200px) + data/operator-images.json
scripts/build-operator-details.py  data/raw/operators_wiki_raw.json → data/operator-details.json
scripts/build-combat-data.py  data/raw/endfieldtools → data/combat/*.json + data/operator-stats.json
scripts/build-weapon-images.py  src/images/무기 → public/weapons (아이콘 webp, 회전 영상 webm/mp4, 포스터) + data/weapon-images.json
src/
  app/                    페이지 (서버 컴포넌트 기본)
    essence/              기질 파밍 (무기 선택 → 구역 효율 → 기질 선택권 설정)
    operators/            캐릭터 목록(필터) · 상세(스토리·기본 정보·추천 무기)
  components/
    essence/              기질 파밍 UI ('use client')
    ui/                   shadcn/ui 컴포넌트
  lib/calc/essence.ts     기질 확률 계산 (순수 함수 + 테스트)
  lib/calc/essence-score.ts  파밍 효율 점수 (우선 무기 + 다른 무기 보너스, 전수 탐색)
  lib/data.ts             data JSON 타입 래퍼
  db/                     Drizzle + Neon (아직 미사용)
```

## 데이터 출처

- 무기·오퍼레이터: [SKPORT 엔드필드 위키](https://wiki.skport.com/endfield) (2026-10-02 수집)
- 지역별 기질 풀: 인게임 '전체 기질 보기' 캡처 12장 기준 (`data/essence-regions.json`, 수기 관리)
- 무기 이미지: `src/images/무기/*.png`·`*.gif`(사용자 제공) → `public/weapons/`. GIF 원본(개당 10~20MB)은 저장소 제외, 640px webm/mp4(개당 약 0.1~0.4MB)로 변환해 사용
- 기질 이미지: `public/essence/` (5성 무결 기질 문양별 + 4성 안정/세련/순수). TODO: 효율 문양 이미지 없음, 4성 속성 매핑 미정
- 각인 규칙: 기초 3개 선택 중 1개 무작위 + 부가/스킬 중 1개 고정 + 나머지 1개는 지역 풀 8개 중 무작위

## 디자인 토큰

`src/app/globals.css` — 라이트(오프화이트) / 다크(연한 블랙), 포인트 옐로 `#FFE100`.

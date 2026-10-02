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
  raw/                    위키에서 수집한 원본
scripts/build-data.mjs    raw → data/*.json 정규화
src/
  app/                    페이지 (서버 컴포넌트 기본)
    essence/              기질 파밍 (무기 매처 + 오퍼레이터 플래너)
  components/
    essence/              플래너 UI ('use client')
    ui/                   shadcn/ui 컴포넌트
  lib/calc/essence.ts     기질 최적화 계산 (순수 함수 + 테스트)
  lib/data.ts             data JSON 타입 래퍼
  db/                     Drizzle + Neon (아직 미사용)
```

## 데이터 출처

- 무기·오퍼레이터: [SKPORT 엔드필드 위키](https://wiki.skport.com/endfield) (2026-10-02 수집)
- 지역별 기질 풀: 인게임 '전체 기질 보기' 캡처 12장 기준 (`data/essence-regions.json`, 수기 관리)
- 기질 이미지: `public/essence/` (5성 무결 기질 문양별 + 4성 안정/세련/순수). TODO: 효율 문양 이미지 없음, 4성 속성 매핑 미정
- 각인 규칙: 기초 3개 선택 중 1개 무작위 + 부가/스킬 중 1개 고정 + 나머지 1개는 지역 풀 8개 중 무작위

## 디자인 토큰

`src/app/globals.css` — 라이트(오프화이트) / 다크(연한 블랙), 포인트 옐로 `#FFE100`.

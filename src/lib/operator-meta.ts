// 캐릭터 목록 필터·표시용 상수 (게임 수치 아님)
import type { OperatorClass } from "@/types/game";

export const ELEMENTS = ["물리", "열기", "전기", "냉기", "자연"] as const;
export const CLASSES: OperatorClass[] = ["가드", "스트라이커", "뱅가드", "디펜더", "캐스터", "서포터"];

/** 속성 색 (배경/점) — 게임 속성 아이콘 색에 맞춤 */
export const ELEMENT_BG: Record<string, string> = {
  물리: "bg-neutral-500",
  열기: "bg-orange-500",
  전기: "bg-amber-400",
  냉기: "bg-cyan-500",
  자연: "bg-lime-500",
};
/** 속성 색 (글자) */
export const ELEMENT_TEXT: Record<string, string> = {
  물리: "text-neutral-600 dark:text-neutral-300",
  열기: "text-orange-600 dark:text-orange-400",
  전기: "text-amber-600 dark:text-amber-400",
  냉기: "text-cyan-600 dark:text-cyan-400",
  자연: "text-lime-600 dark:text-lime-400",
};

/** 속성 아이콘 (public/icons/element, 원본: src/images/캐릭터 상세 아이콘/속성 — 게임 표기 화염·얼음) */
export const ELEMENT_ICON: Record<string, string> = {
  물리: "/icons/element/physical.webp",
  열기: "/icons/element/heat.webp",
  전기: "/icons/element/electric.webp",
  냉기: "/icons/element/cryo.webp",
  자연: "/icons/element/nature.webp",
};

/** 직업 아이콘 (public/icons/class, 원본: src/images/캐릭터 상세 아이콘/직업 — 게임 표기 스트라이크) */
export const CLASS_ICON: Record<OperatorClass, string> = {
  가드: "/icons/class/guard.webp",
  스트라이커: "/icons/class/striker.webp",
  뱅가드: "/icons/class/vanguard.webp",
  디펜더: "/icons/class/defender.webp",
  캐스터: "/icons/class/caster.webp",
  서포터: "/icons/class/supporter.webp",
};

export const RARITY_BG: Record<number, string> = { 6: "bg-rarity-6", 5: "bg-rarity-5", 4: "bg-rarity-4", 3: "bg-rarity-3" };

// 캐릭터 목록 필터·표시용 상수 (게임 수치 아님)
import type { OperatorClass } from "@/types/game";

export const ELEMENTS = ["물리", "열기", "전기", "냉기", "자연"] as const;
export const CLASSES: OperatorClass[] = ["가드", "스트라이커", "뱅가드", "디펜더", "캐스터", "서포터"];

/** 속성 색 (배경/점) */
export const ELEMENT_BG: Record<string, string> = {
  물리: "bg-slate-500",
  열기: "bg-orange-500",
  전기: "bg-violet-500",
  냉기: "bg-sky-500",
  자연: "bg-emerald-500",
};
/** 속성 색 (글자) */
export const ELEMENT_TEXT: Record<string, string> = {
  물리: "text-slate-600 dark:text-slate-300",
  열기: "text-orange-600 dark:text-orange-400",
  전기: "text-violet-600 dark:text-violet-400",
  냉기: "text-sky-600 dark:text-sky-400",
  자연: "text-emerald-600 dark:text-emerald-400",
};

export const RARITY_BG: Record<number, string> = { 6: "bg-rarity-6", 5: "bg-rarity-5", 4: "bg-rarity-4", 3: "bg-rarity-3" };

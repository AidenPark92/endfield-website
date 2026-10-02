import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn/ui 표준 className 병합 유틸 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 0~1 확률을 % 문자열로 (작은 값은 소수 둘째 자리까지) */
export function formatPercent(p: number): string {
  const v = p * 100;
  if (v === 0) return "0%";
  if (v < 1) return `${v.toFixed(2)}%`;
  return `${v.toFixed(1)}%`;
}

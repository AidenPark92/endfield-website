import Image from "next/image";
import { cn } from "@/lib/utils";
import type { Weapon } from "@/types/game";

const RARITY_BAR: Record<number, string> = { 6: "bg-rarity-6", 5: "bg-rarity-5", 4: "bg-rarity-4", 3: "bg-rarity-3" };

/** 무기 아이콘 (희귀도 바 포함). 이미지가 없으면 빈 칸으로 둔다 */
export function WeaponThumb({
  weapon,
  size,
  className,
  bar = "bottom",
  children,
}: {
  weapon: Weapon;
  /** 이미지 요청 크기(px) — 박스 크기는 className 으로 지정 */
  size: number;
  className?: string;
  bar?: "top" | "bottom";
  children?: React.ReactNode;
}) {
  return (
    <span className={cn("relative block shrink-0 overflow-hidden border bg-muted/60", className)}>
      {weapon.image && (
        <Image
          src={weapon.image}
          alt={weapon.name}
          width={size}
          height={size}
          unoptimized
          className="absolute inset-0 size-full object-contain p-[6%]"
        />
      )}
      <span className={cn("absolute inset-x-0 h-1", bar === "top" ? "top-0" : "bottom-0", RARITY_BAR[weapon.rarity])} />
      {children}
    </span>
  );
}

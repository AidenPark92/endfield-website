// 인게임 장착 화면 풍 장비 카드 (서버·클라이언트 공용)
import Image from "next/image";
import { Cpu, Hand, Shirt, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** 장비 등급(t0~t4) → 하단 띠 색 (희귀도 색 재사용) */
const TIER_COLOR = ["var(--rarity-1)", "var(--rarity-2)", "var(--rarity-3)", "var(--rarity-4)", "var(--rarity-5)"];
export const tierColor = (tier: number) => TIER_COLOR[Math.max(0, Math.min(4, tier))];

/** 부위 이름 · 아이콘 (partType 0 방어구 · 1 장갑 · 2 부품) */
export const SLOT_META: { label: string; icon: LucideIcon }[] = [
  { label: "방어구", icon: Shirt },
  { label: "보호 장갑", icon: Hand },
  { label: "부품", icon: Cpu },
];

/** 부위 헤더: 검은 사각 아이콘 + 부위 이름 */
export function SlotHeader({ partType, label, size = "md", className }: { partType: number; label?: string; size?: "sm" | "md"; className?: string }) {
  const meta = SLOT_META[partType] ?? SLOT_META[2];
  const Icon = meta.icon;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className={cn("grid shrink-0 place-items-center bg-foreground text-background", size === "sm" ? "size-5" : "size-7")}>
        <Icon className={size === "sm" ? "size-3" : "size-4"} strokeWidth={2.25} />
      </span>
      <span className={cn("font-bold tracking-tight", size === "sm" ? "text-xs" : "text-lg")}>{label ?? meta.label}</span>
    </div>
  );
}

/** 장비 카드: 동심원 배경 + 등급 표식 + 하단 등급 색 띠 */
export function GearCard({
  src,
  tier,
  className,
  dim,
  compact,
  children,
}: {
  src?: string;
  tier: number;
  className?: string;
  /** 세트 밖 장비 등 흐리게 */
  dim?: boolean;
  /** 작은 카드: 장식 생략 */
  compact?: boolean;
  /** 카드 위에 겹쳐 둘 요소 (배지 등) */
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("ef-gear-card relative overflow-hidden border border-black/5 shadow-sm dark:border-white/5", className)}>
      {!compact && (
        <>
          {/* 등급 표식 (왼쪽 세로 줄) */}
          <span className="absolute top-2 left-2 z-10 flex flex-col gap-1" aria-label={`등급 ${tier}`}>
            {Array.from({ length: Math.max(1, tier) }, (_, i) => (
              <span key={i} className="size-1.5 rotate-45 bg-foreground/45" />
            ))}
          </span>
          <span className="absolute top-1.5 right-2 z-10 font-mono text-[8px] leading-none font-bold tracking-wider text-foreground/35">ENDFIELD</span>
        </>
      )}
      {src && (
        <Image
          src={src}
          alt=""
          fill
          sizes="200px"
          unoptimized
          className={cn("object-contain drop-shadow-[0_6px_6px_rgba(0,0,0,0.25)]", compact ? "p-0.5" : "p-[12%]", dim && "opacity-60 grayscale-[40%]")}
        />
      )}
      {children}
      <span className={cn("absolute inset-x-0 bottom-0", compact ? "h-0.5" : "h-1.5")} style={{ background: tierColor(tier) }} />
    </div>
  );
}

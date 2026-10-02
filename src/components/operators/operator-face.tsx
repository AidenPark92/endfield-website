import Image from "next/image";
import { cn } from "@/lib/utils";
import type { Operator } from "@/types/game";

const RARITY_BORDER: Record<number, string> = { 6: "border-rarity-6", 5: "border-rarity-5", 4: "border-rarity-4", 3: "border-rarity-3" };

/** 작은 초상화 (얼굴 이미지, 4:5). 이미지가 없으면 이름 첫 글자 */
export function OperatorFace({ op, className, ring = true }: { op: Operator; className?: string; ring?: boolean }) {
  return (
    <span
      title={op.name}
      className={cn(
        "relative block aspect-[4/5] shrink-0 overflow-hidden bg-muted",
        ring && "border-b-2",
        ring && RARITY_BORDER[op.rarity],
        className,
      )}
    >
      {op.face ? (
        <Image src={op.face} alt={op.name} fill sizes="80px" unoptimized className="object-cover object-top" />
      ) : (
        <span className="grid size-full place-items-center text-xs font-bold text-muted-foreground">{op.name[0]}</span>
      )}
    </span>
  );
}

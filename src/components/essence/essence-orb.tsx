import Image from "next/image";
import { cn } from "@/lib/utils";
import { essenceImage } from "@/lib/essence-images";

/** 기질 구슬 이미지. 스킬 속성이 있으면 해당 문양의 5성 무결 기질을 보여준다 */
export function EssenceOrb({
  skill,
  src,
  size = 40,
  className,
  alt = "",
}: {
  skill?: string | null;
  /** 직접 지정 (4성 등) */
  src?: string;
  size?: number;
  className?: string;
  alt?: string;
}) {
  return (
    <Image
      src={src ?? essenceImage(skill)}
      alt={alt}
      width={size}
      height={size}
      unoptimized
      className={cn("shrink-0 object-contain", className)}
    />
  );
}

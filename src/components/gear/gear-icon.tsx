// 장비 아이콘 (서버·클라이언트 공용) — 이미지 경로는 data/gear-images.json
import Image from "next/image";
import { cn } from "@/lib/utils";

export function GearIcon({ src, size = 44, className }: { src?: string; size?: number; className?: string }) {
  return (
    <span className={cn("relative block shrink-0 overflow-hidden border bg-muted", className)} style={{ width: size, height: size }}>
      {src && <Image src={src} alt="" fill sizes={`${size}px`} unoptimized className="object-contain p-0.5" />}
    </span>
  );
}

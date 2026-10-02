"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { Weapon } from "@/types/game";

const RARITY_BAR: Record<number, string> = { 6: "bg-rarity-6", 5: "bg-rarity-5", 4: "bg-rarity-4", 3: "bg-rarity-3" };

/** 사용자가 '동작 줄이기'를 켰는지 */
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/**
 * 무기 회전 연출 (GIF → webm/mp4 변환본)
 *  - mode="hover": 평소엔 첫 프레임(포스터), 마우스를 올리면 재생 → 목록 카드용 (영상은 호버할 때만 받음)
 *  - mode="auto" : 자동 반복 재생 → 선택한 무기 쇼케이스용
 * 영상이 없으면 PNG 아이콘으로 대체한다.
 */
export function WeaponMedia({
  weapon,
  mode,
  active = false,
  className,
  children,
}: {
  weapon: Weapon;
  mode: "hover" | "auto";
  /** hover 모드에서 바깥(카드) 호버 상태 */
  active?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);
  const play = !!weapon.video && !reduced && (mode === "auto" || active);

  useEffect(() => {
    if (!play) setReady(false);
  }, [play]);

  return (
    <span className={cn("relative block overflow-hidden bg-[#e9e9e7]", className)}>
      {weapon.poster ? (
        <Image src={weapon.poster} alt={weapon.name} fill sizes="(min-width:1024px) 480px, 50vw" unoptimized className="object-cover" />
      ) : (
        weapon.image && (
          <Image src={weapon.image} alt={weapon.name} fill sizes="200px" unoptimized className="object-contain p-[8%]" />
        )
      )}
      {play && (
        <video
          key={weapon.id}
          poster={weapon.poster}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onCanPlay={() => setReady(true)}
          className={cn("absolute inset-0 size-full object-cover transition-opacity duration-300", ready ? "opacity-100" : "opacity-0")}
        >
          {/* VP9(webm) 우선, 못 틀면 H.264(mp4) */}
          <source src={`${weapon.video}.webm`} type="video/webm" />
          <source src={`${weapon.video}.mp4`} type="video/mp4" />
        </video>
      )}
      <span className={cn("absolute inset-x-0 top-0 h-1", RARITY_BAR[weapon.rarity])} />
      {children}
    </span>
  );
}

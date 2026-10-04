"use client";

import { renderTemplate, type TextSegment } from "@/lib/skill-text";
import { lookupTerm, splitTerms } from "@/lib/glossary";
import { Term } from "@/components/ui/term";
import type { Blackboard } from "@/types/combat";

/** 게임 설명 문구 렌더러 — {값} 채우기 + 수치 강조 + 용어 툴팁 */
export function Rich({ template, bb, className, autoTerms }: { template: string | null; bb: Blackboard; className?: string; autoTerms?: boolean }) {
  const { segments } = renderTemplate(template, bb);
  if (!segments.length) return null;
  return (
    <p className={className}>
      {segments.map((s: TextSegment, i) => {
        if (s.tone === "value")
          return (
            <span key={i} className="mx-0.5 bg-accent/30 px-1 font-mono text-[1.05em] font-bold text-foreground">
              {s.text}
            </span>
          );
        if (s.tone === "keyword") {
          const g = lookupTerm(s.text, s.tag);
          // 설명이 있는 용어만 밑줄 + 툴팁, 캐릭터 고유 명칭 등은 굵게만
          return g ? (
            <Term key={i} title={g.term} desc={g.desc}>
              {s.text}
            </Term>
          ) : (
            <b key={i} className="font-semibold">
              {s.text}
            </b>
          );
        }
        // 태그 없는 문장(공식 위키 설명)은 용어를 찾아 툴팁을 붙인다
        if (autoTerms)
          return (
            <span key={i}>
              {splitTerms(s.text).map((p, j) => {
                const g = p.term ? lookupTerm(p.term) : undefined;
                return g ? (
                  <Term key={j} title={g.term} desc={g.desc}>
                    {p.text}
                  </Term>
                ) : (
                  p.text
                );
              })}
            </span>
          );
        return <span key={i}>{s.text}</span>;
      })}
    </p>
  );
}


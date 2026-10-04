// 엔드필드 용어 툴팁 — 게임 내 용어 설명(data/glossary.json) 조회
import glossaryJson from "@data/glossary.json";

interface Entry {
  tags: string[];
  desc: string;
}
const terms = glossaryJson.terms as Record<string, Entry>;
const onCharacter = glossaryJson.onCharacter as Record<string, string>;
const byTag = new Map<string, { term: string; desc: string }>();
for (const [term, e] of Object.entries(terms)) for (const t of e.tags) if (!byTag.has(t)) byTag.set(t, { term, desc: e.desc });

/**
 * 화면에 보인 글자(text)와 설명 태그(tag)로 용어 설명을 찾는다.
 * 1) 글자가 용어와 정확히 같으면 그 용어  2) 오퍼레이터에게 걸리는 상태 태그  3) 태그 기준
 * 숫자·수식만 있는 글자(예: {poise:0} 를 채운 "15")는 설명하지 않는다.
 */
export function lookupTerm(text: string, tag?: string): { term: string; desc: string } | undefined {
  const t = text.trim();
  if (!t || /^[\d.+\-%×\s\[\]]+$/.test(t)) return undefined;
  if (terms[t]) return { term: t, desc: terms[t].desc };
  if (tag && onCharacter[tag]) return { term: t, desc: onCharacter[tag] };
  if (tag && byTag.has(tag)) return { term: t, desc: byTag.get(tag)!.desc };
  return undefined;
}

// 태그 없는 일반 문장(공식 위키 설명 등)에서 용어를 찾아 나눈다. 긴 용어부터 맞춰 "열기 부착"이 "열기"보다 먼저 잡히게
const termPattern = new RegExp(
  Object.keys(terms)
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|"),
  "g",
);
export function splitTerms(text: string): { text: string; term?: string }[] {
  const out: { text: string; term?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(termPattern)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], term: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { operators, weapons, essenceRegions } from "@/lib/data";
import { cn } from "@/lib/utils";

const FEATURES = [
  {
    code: "01",
    title: "기질 파밍 플래너",
    desc: "키우는 오퍼레이터를 고르면, 무기 기질을 한 번에 노릴 수 있는 지역과 각인 설정을 알려줍니다.",
    href: "/essence",
    ready: true,
  },
  { code: "02", title: "오퍼레이터 DB · 육성 재료", desc: "레벨·스킬·돌파 재료 계산", ready: false },
  { code: "03", title: "데미지 계산기", desc: "파티·장비를 반영한 전투력 계산", ready: false },
  { code: "04", title: "공장 청사진", desc: "2D 청사진 에디터와 공유 게시판", ready: false },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-7xl px-4">
      {/* 히어로 */}
      <section className="relative overflow-hidden border-b py-16 md:py-24">
        <div className="ef-hatch pointer-events-none absolute -top-10 right-0 h-64 w-64 text-foreground/[0.06]" />
        <p className="ef-label mb-4">Talos-II // Field Manual · v0.1</p>
        <h1 className="max-w-3xl text-4xl leading-[1.1] font-bold tracking-tight md:text-6xl">
          복잡한 계산은 맡기고,
          <br />
          <span className="relative inline-block">
            파밍만 하세요
            <span className="absolute inset-x-0 bottom-1 -z-10 h-3 bg-accent md:h-4" />
          </span>
        </h1>
        <p className="mt-5 max-w-xl text-muted-foreground">
          명일방주: 엔드필드 공략 도구 모음. 공식 위키 데이터를 기반으로 필요한 정보만 간단하게 보여줍니다.
        </p>

        <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4 font-mono">
          {[
            ["OPERATORS", operators.length],
            ["WEAPONS", weapons.length],
            ["ESSENCE ZONES", essenceRegions.length],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="ef-label">{k}</dt>
              <dd className="text-2xl font-semibold">{String(v).padStart(2, "0")}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 기능 목록 */}
      <section className="grid gap-px border bg-border py-0 sm:grid-cols-2 lg:grid-cols-4 mt-10">
        {FEATURES.map((f) => {
          const inner = (
            <>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-muted-foreground">MOD-{f.code}</span>
                {f.ready ? (
                  <span className="bg-accent px-1.5 py-0.5 font-mono text-[10px] font-bold text-accent-foreground">ONLINE</span>
                ) : (
                  <span className="border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">STANDBY</span>
                )}
              </div>
              <h2 className="mt-8 text-lg font-bold">{f.title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
              {f.ready && (
                <ArrowUpRight className="absolute right-4 bottom-4 size-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              )}
            </>
          );
          const cls = cn(
            "group ef-bracket relative block min-h-48 bg-card p-5 transition-colors",
            f.ready ? "hover:bg-muted/60" : "opacity-60",
          );
          return f.ready && f.href ? (
            <Link key={f.code} href={f.href} className={cls}>
              {inner}
            </Link>
          ) : (
            <div key={f.code} className={cls} aria-disabled>
              {inner}
            </div>
          );
        })}
      </section>
    </div>
  );
}

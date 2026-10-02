import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// shadcn/ui Badge — 기질 분류별 색상 변형 포함
const badgeVariants = cva(
  "inline-flex items-center gap-1 border px-1.5 py-0.5 text-[11px] leading-none font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-border bg-muted text-foreground",
        base: "border-stat-base/30 text-stat-base",
        extra: "border-stat-extra/40 bg-stat-extra/8 text-stat-extra",
        skill: "border-stat-skill/50 bg-stat-skill/10 text-stat-skill",
        accent: "border-transparent bg-accent text-accent-foreground",
        outline: "border-border text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

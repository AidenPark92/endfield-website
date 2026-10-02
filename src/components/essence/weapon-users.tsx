import Link from "next/link";
import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { userLabel, type WeaponUser } from "@/lib/weapon-users";
import { OperatorFace } from "@/components/operators/operator-face";
import type { Operator } from "@/types/game";

export interface WeaponUserInfo {
  op: Operator;
  user: WeaponUser;
}

/** 카드용: 얼굴 겹쳐 보이기 + "펠리카 외 2" */
export function WeaponUsersInline({ users, max = 3, className }: { users: WeaponUserInfo[]; max?: number; className?: string }) {
  if (users.length === 0) {
    return <span className={cn("text-[10px] text-muted-foreground/70", className)}>추천 오퍼레이터 없음</span>;
  }
  return (
    <span className={cn("flex items-center gap-1.5", className)}>
      <span className="flex -space-x-1.5">
        {users.slice(0, max).map(({ op }) => (
          <OperatorFace key={op.id} op={op} className="w-5 ring-2 ring-card" />
        ))}
      </span>
      <span className="truncate text-[11px] font-medium">
        {users[0].op.name}
        {users.length > 1 && <span className="text-muted-foreground"> 외 {users.length - 1}</span>}
      </span>
    </span>
  );
}

/** 상세용: 이 무기를 쓰는 오퍼레이터 목록 (캐릭터 페이지로 연결) */
export function WeaponUsersList({ users }: { users: WeaponUserInfo[] }) {
  if (users.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <UserRound className="size-3.5" /> 위키에서 이 무기를 추천하는 오퍼레이터가 없어요.
      </p>
    );
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {users.map(({ op, user }) => (
        <li key={op.id}>
          <Link
            href={`/operators/${op.id}`}
            className={cn(
              "group flex items-center gap-2 border bg-card py-1 pr-3 pl-1 transition-colors hover:border-foreground",
              user.kind === "skill" && user.rank === 0 && "border-accent-strong/60 bg-accent/10",
            )}
          >
            <OperatorFace op={op} className="w-9" />
            <span className="leading-tight">
              <span className="block text-sm font-bold group-hover:underline">{op.name}</span>
              <span
                className={cn(
                  "block text-[10px]",
                  user.kind === "skill" && user.rank === 0 ? "font-semibold text-accent-strong" : "text-muted-foreground",
                )}
              >
                {userLabel(user)}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

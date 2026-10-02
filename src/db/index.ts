// Neon Postgres + Drizzle 클라이언트 (서버 전용)
// 아직 DB 를 쓰는 기능은 없음 — 청사진 공유 게시판 등에서 사용 예정
import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL 환경 변수가 없습니다 (.env.local 확인)");
  return drizzle(neon(url), { schema });
}

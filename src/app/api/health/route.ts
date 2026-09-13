import { prisma } from "@/lib/db";

/** GET /api/health — quick liveness + DB check (no secrets returned). */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, db: "up" });
  } catch {
    return Response.json({ ok: true, db: "down" });
  }
}

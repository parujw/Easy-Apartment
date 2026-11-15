import { NextResponse, connection } from "next/server";

/** The version that is live now (compared with the one an open app was built with). */
export async function GET() {
  await connection();
  return NextResponse.json({ version: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" }, { headers: { "Cache-Control": "no-store" } });
}

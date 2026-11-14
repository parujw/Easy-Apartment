import { NextResponse, connection } from "next/server";
import { lineConfigured } from "@/lib/line";

export async function GET() {
  await connection(); // read env at request time, not at build
  return NextResponse.json({ configured: lineConfigured() });
}

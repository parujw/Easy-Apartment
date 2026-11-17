// GET /api/pdf/invoice/<publicToken> → the A4 invoice (same layout as V3) as a PDF.
import { NextResponse, connection } from "next/server";
import { renderPdf } from "@/lib/server/pdf";

export const maxDuration = 30;

export async function GET(req: Request, ctx: RouteContext<"/api/pdf/[kind]/[token]">) {
  await connection();
  const { kind, token } = await ctx.params;
  if (kind !== "invoice" || !/^[a-z0-9]{24,64}$/i.test(token)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const origin = new URL(req.url).origin;
  try {
    const pdf = await renderPdf(`${origin}/print/invoice/${token}`, ".doc");
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="invoice-${token.slice(0, 8)}.pdf"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (e) {
    console.error("pdf", e);
    // the browser can still print the web version
    return NextResponse.redirect(`${origin}/print/invoice/${token}`, 302);
  }
}

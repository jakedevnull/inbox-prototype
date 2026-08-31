import { NextResponse } from "next/server";
import { getRaw } from "@/lib/mailbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const raw = await getRaw(decodeURIComponent(id));
  if (!raw) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(raw.bytes), {
    headers: {
      "Content-Type": "message/rfc822",
      "Content-Disposition": `attachment; filename="${raw.filename}"`,
    },
  });
}

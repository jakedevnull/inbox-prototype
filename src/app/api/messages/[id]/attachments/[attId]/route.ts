import { NextResponse } from "next/server";
import { getAttachment } from "@/lib/mailbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; attId: string }> },
) {
  const { id, attId } = await context.params;
  const found = await getAttachment(decodeURIComponent(id), decodeURIComponent(attId));
  if (!found) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }
  const url = new URL(request.url);
  const inline =
    url.searchParams.get("inline") === "1" ||
    found.meta.contentType.startsWith("image/") ||
    found.meta.contentType === "application/pdf";
  const disposition = inline ? "inline" : "attachment";
  return new NextResponse(new Uint8Array(found.bytes), {
    headers: {
      "Content-Type": found.meta.contentType,
      "Content-Length": String(found.bytes.length),
      "Content-Disposition": `${disposition}; filename="${found.meta.filename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;

  const supabase = await createSupabaseServerClient();

  if (tokenHash && type === "invite") {
    await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "invite" });
    return NextResponse.redirect(`${appUrl}/set-password`);
  }

  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
    return NextResponse.redirect(`${appUrl}/connect-strava`);
  }

  // No server-readable params — hash tokens from Supabase implicit flow will
  // be carried along to the landing page, where the client-side handler picks them up.
  return NextResponse.redirect(`${appUrl}/`);
}

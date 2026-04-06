import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — must be called before any auth checks
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Landing page — public for unauthenticated, redirect to chat for authenticated
  // Exception: if the URL has an invite hash the client-side handler needs to run first,
  // but middleware can't read hash fragments — so we allow the page to load when the
  // request looks like it may have come from an invite link (checked client-side).
  if (pathname === "/") {
    if (user) {
      const chatUrl = request.nextUrl.clone();
      chatUrl.pathname = "/chat";
      return NextResponse.redirect(chatUrl);
    }
    return supabaseResponse;
  }

  // Public paths — no auth required
  const isPublic =
    pathname === "/login" ||
    pathname === "/set-password" ||
    pathname.startsWith("/api/strava/callback") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/waitlist") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon");

  if (isPublic) return supabaseResponse;

  // Not authenticated → /login
  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated but on /connect-data-source — let them through
  if (pathname === "/connect-data-source") return supabaseResponse;

  // Check if user has connected Strava (skip for API routes to avoid extra DB call)
  const isApiRoute = pathname.startsWith("/api/");
  if (!isApiRoute) {
    const { data: connection } = await supabase
      .from("strava_connections")
      .select("user_id")
      .eq("user_id", user.id)
      .single();

    if (!connection) {
      const connectUrl = request.nextUrl.clone();
      connectUrl.pathname = "/connect-data-source";
      return NextResponse.redirect(connectUrl);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

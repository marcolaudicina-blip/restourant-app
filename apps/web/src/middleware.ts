import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/registrati", "/password-dimenticata"];
/** Open to everyone, signed in or not: guests' booking pages, invitation and password links. */
const OPEN_PATHS = ["/prenota/", "/invito/", "/reimposta-password/"];

/** Sends signed-out visitors to the login page. The API still verifies every request. */
export function middleware(request: NextRequest) {
  if (OPEN_PATHS.some((p) => request.nextUrl.pathname.startsWith(p))) return NextResponse.next();
  const signedIn = request.cookies.has("rs_session");
  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));
  if (!signedIn && !isPublic) {
    const url = new URL("/login", request.url);
    if (request.nextUrl.pathname !== "/") url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  if (signedIn && isPublic) return NextResponse.redirect(new URL("/", request.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!api|_next|favicon.ico).*)"] };

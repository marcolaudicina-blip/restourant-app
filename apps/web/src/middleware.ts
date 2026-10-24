import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/registrati", "/password-dimenticata"];
/**
 * Open to everyone, signed in or not: guests' booking pages and their own bookings, invitation and
 * password links.
 */
const OPEN_PATHS = ["/prenota/", "/prenotazione/", "/invito/", "/reimposta-password/"];

/** The showcase site and the pages it links to, open to everyone. */
const SITE_PATHS = ["/sito"];

/**
 * Domains that show the showcase site (e.g. "twentyreserve.com,www.twentyreserve.com"): their home
 * page is /sito, other site pages work as they are, anything else moves to the app (APP_URL).
 */
const SITE_HOSTS = (process.env.SITE_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

/** Sends signed-out visitors to the login page. The API still verifies every request. */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const host = (request.headers.get("host") ?? "").split(":")[0]!.toLowerCase();
  if (SITE_HOSTS.includes(host)) {
    if (pathname === "/") return NextResponse.rewrite(new URL("/sito", request.url));
    if (SITE_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();
    if (process.env.APP_URL)
      return NextResponse.redirect(new URL(`${pathname}${search}`, process.env.APP_URL));
  }
  if (SITE_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();
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

/** Everything but API calls, Next assets, icons, the web manifest and the logo files. */
export const config = {
  matcher: ["/((?!api|_next|favicon.ico|icon|apple-icon|manifest.webmanifest|brand/).*)"],
};

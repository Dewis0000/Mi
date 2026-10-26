import { auth } from "@/lib/auth";

// Next.js 16: файл middleware.ts переименован в proxy.ts, функция — в proxy().
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const role = req.auth?.user?.role;

  const isAdminRoute = pathname.startsWith("/admin");
  const isAccountRoute = pathname.startsWith("/account");

  if ((isAdminRoute || isAccountRoute) && !isLoggedIn) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", pathname);
    return Response.redirect(url);
  }

  if (isAdminRoute && role !== "ADMIN" && role !== "MANAGER" && role !== "ACTOR") {
    return Response.redirect(new URL("/", req.nextUrl.origin));
  }
});

export const config = {
  matcher: ["/account/:path*", "/admin/:path*"],
};

import { useEffect, useState } from "react";

export type Route =
  | { type: "home" }
  | { type: "sessions" }
  | { type: "session-detail"; sessionId: string }
  | { type: "tower" };

export function parseRoute(pathname: string): Route {
  if (pathname === "/sessions") {
    return { type: "sessions" };
  }

  if (pathname === "/tower") {
    return { type: "tower" };
  }

  if (pathname.startsWith("/sessions/")) {
    const sessionId = pathname.slice("/sessions/".length);
    if (sessionId) {
      return { type: "session-detail", sessionId };
    }
  }

  return { type: "home" };
}

export function useRoute(): [Route, (path: string) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));

  useEffect(() => {
    const onPopState = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (path: string) => {
    if (path === window.location.pathname) return;
    window.history.pushState({}, "", path);
    setRoute(parseRoute(path));
  };

  return [route, navigate];
}


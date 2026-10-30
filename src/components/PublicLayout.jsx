import { Suspense, useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Loading, Torch } from "./ui.jsx";
import { api } from "../lib/api.js";
import { getHubKey } from "../lib/device.js";

let siteCache = null;
export function useSite() {
  const [site, setSite] = useState(siteCache || {});
  useEffect(() => {
    if (siteCache) return;
    api.site().then((r) => {
      siteCache = r.site || {};
      setSite(siteCache);
    }).catch(() => {});
  }, []);
  return site;
}

export default function PublicLayout() {
  const { pathname } = useLocation();
  const site = useSite();
  return (
    <>
      <header className="top">
        <div className="wrap">
          <Link to="/" className="logo"><Torch color="#5a1028" /><span>The Torch of Deborah</span></Link>
          <nav aria-label="Main">
            {getHubKey() && pathname !== "/my-hub" && <Link to="/my-hub">My hub</Link>}
            {pathname !== "/join" && <Link to="/join" className="btn sm">Join</Link>}
          </nav>
        </div>
      </header>
      <main>
        <Suspense fallback={<Loading />}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="foot">
        <div className="wrap">
          <span>© {new Date().getFullYear()} The Torch of Deborah{site.contactEmail ? <> · <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a></> : null}{site.contactPhone ? <> · {site.contactPhone}</> : null}</span>
          <nav>
            <Link to="/privacy">Privacy</Link>
            <Link to="/login">Leader sign in</Link>
          </nav>
        </div>
      </footer>
    </>
  );
}

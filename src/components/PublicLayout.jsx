import { Suspense, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { PageFallback, Torch } from "./ui.jsx";
import { usePublicStats } from "../lib/publicStats.js";

export default function PublicLayout() {
  const [open, setOpen] = useState(false);
  const { pathname, hash } = useLocation();
  const stats = usePublicStats();
  const site = stats.data?.site || {};
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash, pathname]);

  return (
    <>
      <a href="#main" className="skip">Skip to content</a>
      <header className="site-header">
        <div className="inner">
          <Link to="/" className="brand" aria-label="The Torch of Deborah home">
            <Torch className="" flame={false} />
            <span className="brand-name">The Torch of Deborah</span>
          </Link>
          <button className="menu-btn" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen((o) => !o)}>
            {open ? "Close" : "Menu"}
          </button>
          <nav id="site-nav" className={`site-nav ${open ? "open" : ""}`} aria-label="Main">
            <NavLink to="/about">About</NavLink>
            <NavLink to="/volunteer">Volunteer</NavLink>
            <NavLink to="/contact">Contact</NavLink>
            <NavLink to="/login">Leaders</NavLink>
            <Link to="/join" className="btn btn-gold">Join the movement</Link>
          </nav>
        </div>
      </header>
      <main id="main">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="site-footer">
        <div className="wrap">
          <div className="cols">
            <div>
              <div className="brand"><span className="brand-name">The Torch of Deborah</span></div>
              <p className="motto">Arise. Pray. Mobilise. Impact Nigeria.</p>
            </div>
            <div>
              <ul>
                <li><Link to="/about">About the movement</Link></li>
                <li><Link to="/about#mission">Our mission</Link></li>
                <li><Link to="/join">Join the movement</Link></li>
                <li><Link to="/volunteer">Volunteer</Link></li>
                <li><Link to="/welcome">Find my prayer hub</Link></li>
              </ul>
            </div>
            <div>
              <ul>
                <li><Link to="/contact">Contact us</Link></li>
                {site.contactEmail && <li><a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a></li>}
                {site.instagram && <li><a href={site.instagram} rel="noopener" target="_blank">Instagram</a></li>}
                {site.facebook && <li><a href={site.facebook} rel="noopener" target="_blank">Facebook</a></li>}
                {site.x && <li><a href={site.x} rel="noopener" target="_blank">X</a></li>}
                {site.youtube && <li><a href={site.youtube} rel="noopener" target="_blank">YouTube</a></li>}
                <li><Link to="/privacy">Privacy policy</Link></li>
              </ul>
            </div>
          </div>
          <div className="legal">
            <span>© {new Date().getFullYear()} The Torch of Deborah</span>
            <span><Link to="/login">Leadership sign in</Link></span>
          </div>
        </div>
      </footer>
    </>
  );
}

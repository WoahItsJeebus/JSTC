/* ============================================================
   site.js — shared helpers for all pages
   ============================================================ */

/**
 * ===== Fade scroll logic =====
 * Works with .fadeScroll + .isScrollable/.atStart/.atEnd CSS classes.
 */

export function updateFadeState(el){
  if (!el) return;

  const max = el.scrollWidth - el.clientWidth;

  if (max <= 1){
    el.classList.remove("isScrollable", "atStart", "atEnd");
    return;
  }

  el.classList.add("isScrollable");

  if (el.scrollLeft <= 1) el.classList.add("atStart");
  else el.classList.remove("atStart");

  if (el.scrollLeft >= max - 1) el.classList.add("atEnd");
  else el.classList.remove("atEnd");
}

export function attachFadeScroll(el){
  if (!el) return;

  updateFadeState(el);

  el.addEventListener("scroll", () => updateFadeState(el), { passive:true });

  if ("ResizeObserver" in window){
    const ro = new ResizeObserver(() => updateFadeState(el));
    ro.observe(el);
  } else {
    window.addEventListener("resize", () => updateFadeState(el));
  }
}

/**
 * Attach fades for a list of element IDs (ignores missing).
 */
export function attachFadeScrollByIds(ids){
  for (const id of ids){
    attachFadeScroll(document.getElementById(id));
  }
}

/**
 * ===== Platform link rendering =====
 * Renders pill links into #platformLinks (if present).
 */

function domainFromUrl(u){
  try { return new URL(u).hostname.replace(/^www\./, ""); }
  catch { return ""; }
}

function faviconFor(url){
  const dom = domainFromUrl(url);
  if (!dom) return "";
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(dom)}&sz=64`;
}

/**
 * @param {Array<{label?:string,url:string,icon?:string}>} links
 * @param {string} hostId
 */
export function renderPlatformLinks(links, hostId = "platformLinks"){
  const host = document.getElementById(hostId);
  if (!host) return;

  host.textContent = "";

  for (const item of (links || [])){
    if (!item || !item.url) continue;

    const a = document.createElement("a");
    a.className = "platformLink";
    a.href = item.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";

    const img = document.createElement("img");
    img.className = "platformIcon";
    img.alt = "";
    img.src = item.icon || faviconFor(item.url);

    const span = document.createElement("span");
    span.textContent = item.label || domainFromUrl(item.url) || item.url;

    a.appendChild(img);
    a.appendChild(span);
    host.appendChild(a);
  }
}

/**
 * ===== Tabs: auto-active highlight for multi-page sites =====
 * Adds .active to the tab that matches current location.
 *
 * Usage: call autoMarkActiveTab() after the tab nav exists.
 * Assumes your tabs are anchors with class "tabBtn".
 */
export function autoMarkActiveTab(){
  const path = (location.pathname.split("/").filter(Boolean).pop() || "index.html").toLowerCase();

  document.querySelectorAll(".tabs .tabBtn").forEach(a => {
    const href = (a.getAttribute("href") || "").split("/").filter(Boolean).pop() || "";
    const hrefLower = href.toLowerCase();

    // Folder links like "./" will often resolve to "" here; handle that:
    const isTimers = (path === "index.html");
    const isAbout  = (path === "index.html" && location.pathname.includes("/about/")); // GH Pages folder index

    let active = false;

    if (hrefLower === "index.html" || hrefLower === "" || hrefLower === "./" || hrefLower === "../" || hrefLower === "../../"){
      // heuristics: if the link looks like "home", mark active when we're on home
      active = isTimers && !location.pathname.includes("/about/");
    } else if (hrefLower === "about" || hrefLower === "about/" || hrefLower === "index.html"){
      // leave this alone — too ambiguous in raw href
      active = false;
    }

    // Better: compare full normalized href target vs current path
    // (works when href explicitly points to about folder)
    const full = a.href.toLowerCase();
    if (full.endsWith("/about/") || full.endsWith("/about/index.html")){
      active = location.pathname.toLowerCase().includes("/about/");
    }
    if (full.endsWith("/index.html") || full.endsWith("/")){
      // If the href is the repo root or index.html, mark active on home
      // but not on /about/
      if (!full.endsWith("/about/") && !full.endsWith("/about/index.html")){
        active = !location.pathname.toLowerCase().includes("/about/");
      }
    }

    a.classList.toggle("active", active);
  });
}

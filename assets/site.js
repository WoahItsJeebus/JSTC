/* ============================================================
   site.js — shared helpers for all pages
   ============================================================ */

/**
 * 
 * Orb Handler
 * 
*/

export function startOrbBackground(opts = {}){
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (reduce) return;

  const cfg = {
    maxOrbs: 7,
    spawnEveryMs: 1100,
    sizeMin: 260,
    sizeMax: 560,
    durMinMs: 9000,
    durMaxMs: 17000,
    blurMin: 18,
    blurMax: 30,
    margin: 0.12, // allow off-screen spawns for nicer edges
    colors: [
      [147, 176, 245], // blue
      [116, 232, 168],  // green
      [178, 134, 252], // purple
      [255, 217, 140], // warm
    ],
    ...opts,
  };

  let layer = document.querySelector(".bgOrbs");
  if (!layer){
    layer = document.createElement("div");
    layer.className = "bgOrbs";
    layer.setAttribute("aria-hidden", "true");
    document.body.prepend(layer);
  }

  const rand = (a,b) => a + Math.random() * (b - a);
  const randi = (a,b) => Math.floor(rand(a,b+1));
  const pick = arr => arr[randi(0, arr.length - 1)];

  function spawnOne(){
    if (!layer) return;
    if (layer.querySelectorAll(".bgOrb").length >= cfg.maxOrbs) return;

    const orb = document.createElement("div");
    orb.className = "bgOrb";

    const size = randi(cfg.sizeMin, cfg.sizeMax);
    const dur  = randi(cfg.durMinMs, cfg.durMaxMs);
    const blur = randi(cfg.blurMin, cfg.blurMax);

    const vw = window.innerWidth || 1000;
    const vh = window.innerHeight || 800;

    // place using percentages so it stays consistent on resize
    const leftPct = rand(-cfg.margin, 1 + cfg.margin) * 100;
    const topPct  = rand(-cfg.margin, 1 + cfg.margin) * 100;

    // drift in px (small movement looks best)
    const dx = randi(-40, 40);
    const dy = randi(-35, 35);

    const [r,g,b] = pick(cfg.colors);

    orb.style.setProperty("--size", `${size}px`);
    orb.style.setProperty("--dur", `${dur}ms`);
    orb.style.setProperty("--blur", `${blur}px`);
    orb.style.setProperty("--left", `${leftPct}%`);
    orb.style.setProperty("--top", `${topPct}%`);
    orb.style.setProperty("--dx", `${dx}px`);
    orb.style.setProperty("--dy", `${dy}px`);
    orb.style.setProperty("--rgb", `${r},${g},${b}`);

    // tiny random delay so they don't “beat” together
    orb.style.animationDelay = `${randi(0, 900)}ms`;

    orb.addEventListener("animationend", () => {
      orb.remove();
    });

    layer.appendChild(orb);
  }

  // Prime a few immediately, then keep topping up
  for (let i = 0; i < Math.min(3, cfg.maxOrbs); i++) spawnOne();
  setInterval(spawnOne, cfg.spawnEveryMs);
}

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

export function attachFadeToScroller(scrollerEl, fadeEl){
  if (!scrollerEl || !fadeEl) return;

  function sync(){
    const max = scrollerEl.scrollWidth - scrollerEl.clientWidth;

    if (max <= 1){
      fadeEl.classList.remove("isScrollable", "atStart", "atEnd");
      return;
    }

    fadeEl.classList.add("isScrollable");

    if (scrollerEl.scrollLeft <= 1) fadeEl.classList.add("atStart");
    else fadeEl.classList.remove("atStart");

    if (scrollerEl.scrollLeft >= max - 1) fadeEl.classList.add("atEnd");
    else fadeEl.classList.remove("atEnd");
  }

  sync();
  scrollerEl.addEventListener("scroll", sync, { passive:true });

  if ("ResizeObserver" in window){
    const ro = new ResizeObserver(sync);
    ro.observe(scrollerEl);
    ro.observe(fadeEl);
  } else {
    window.addEventListener("resize", sync);
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

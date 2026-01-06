/* ============================================================
   site.js — shared helpers for all pages
   ============================================================ */

/**
 * 
 * Orb Handler
 * 
*/

let __orbBgStop = null;

export function startOrbBackground(opts = {}) {
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (reduce) return { stop() {} };

  // Idempotent: restart cleanly
  if (typeof __orbBgStop === "function") __orbBgStop();

  const cfg = {
    maxOrbs: 7,
    spawnEveryMs: 1100,
    sizeMin: 260,
    sizeMax: 560,
    durMinMs: 5000,
    durMaxMs: 12000,
    blurMin: 18,
    blurMax: 30,
    margin: 0.12,

    // NEW: opacity option (see resolver below)
    // examples:
    // opacity: 0.22
    // opacity: { min: 0.14, max: 0.28 }
    // opacity: [0.14, 0.28]
    opacity: { min: 0.14, max: 0.26 },

    colors: [
      "#51b2f3",
      "#39d4a1ff",
      "#9b45e2ff",
    ],
    ...opts,
  };

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[randi(0, arr.length - 1)];

  function ToRGBA(hex) {
    if (typeof hex !== "string") throw new TypeError("hex must be a string");

    let s = hex.trim();
    if (s.startsWith("#")) s = s.slice(1);

    // Expand #RGB/#RGBA -> #RRGGBB/#RRGGBBAA
    if (s.length === 3 || s.length === 4) {
      s = s.split("").map(ch => ch + ch).join("");
    }

    if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(s)) {
      throw new Error("Invalid hex color");
    }

    const rgb = s.slice(0, 6);
    const aHex = s.length === 8 ? s.slice(6, 8) : null;

    const n = parseInt(rgb, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;

    const a = aHex ? parseInt(aHex, 16) / 255 : 1;
    return [r, g, b, a];
  }

  function resolveOpacity(op) {
    if (typeof op === "number") return clamp01(op);

    if (Array.isArray(op) && op.length >= 2) {
      return clamp01(rand(op[0], op[1]));
    }

    if (op && typeof op === "object") {
      const min = typeof op.min === "number" ? op.min : 0.2;
      const max = typeof op.max === "number" ? op.max : min;
      return clamp01(rand(min, max));
    }

    return 0.2; // fallback
  }

  let layer = document.querySelector(".bgOrbs");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "bgOrbs";
    layer.setAttribute("aria-hidden", "true");
    document.body.prepend(layer);
  }

  let intervalId = null;
  let stopped = false;

  function spawnOne() {
    if (stopped || !layer) return;
    if (layer.querySelectorAll(".bgOrb").length >= cfg.maxOrbs) return;

    const orb = document.createElement("div");
    orb.className = "bgOrb";

    const size = randi(cfg.sizeMin, cfg.sizeMax);
    const dur  = randi(cfg.durMinMs, cfg.durMaxMs);
    const blur = randi(cfg.blurMin, cfg.blurMax);

    const leftPct = rand(-cfg.margin, 1 + cfg.margin) * 100;
    const topPct  = rand(-cfg.margin, 1 + cfg.margin) * 100;

    const dx = randi(-40, 40);
    const dy = randi(-35, 35);

    const [r, g, b, aHex] = ToRGBA(pick(cfg.colors));

    // NEW: opacity resolved from cfg, multiplied by any hex alpha
    const baseOpacity = resolveOpacity(cfg.opacity);
    const finalOpacity = clamp01(baseOpacity * aHex);

    orb.style.setProperty("--size", `${size}px`);
    orb.style.setProperty("--dur", `${dur}ms`);
    orb.style.setProperty("--blur", `${blur}px`);
    orb.style.setProperty("--left", `${leftPct}%`);
    orb.style.setProperty("--top", `${topPct}%`);
    orb.style.setProperty("--dx", `${dx}px`);
    orb.style.setProperty("--dy", `${dy}px`);
    orb.style.setProperty("--rgb", `${r},${g},${b}`);
    orb.style.setProperty("--a", `${finalOpacity}`);

    orb.style.animationDelay = `${randi(0, 900)}ms`;

    orb.addEventListener("animationend", () => orb.remove(), { once: true });
    layer.appendChild(orb);
  }

  for (let i = 0; i < Math.min(3, cfg.maxOrbs); i++) spawnOne();
  intervalId = window.setInterval(spawnOne, cfg.spawnEveryMs);

  function stop({ removeLayer = false } = {}) {
    if (stopped) return;
    stopped = true;

    if (intervalId != null) {
      clearInterval(intervalId);
      intervalId = null;
    }

    if (layer) {
      layer.querySelectorAll(".bgOrb").forEach(el => el.remove());
      if (removeLayer) {
        layer.remove();
        layer = null;
      }
    }
  }

  __orbBgStop = stop;
  return { stop };
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

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

    // Re-using this as "stagger start" now (no more spawning/stacking)
    spawnEveryMs: 700,

    sizeMin: 260,
    sizeMax: 560,
    durMinMs: 9000,
    durMaxMs: 16000,
    blurMin: 18,
    blurMax: 30,
    margin: 0.12,

    // opacity option (same behavior as before)
    opacity: { min: 0.15, max: 0.4 },

    colors: ["#20493fff", "#306459ff", "#2f5e7eff"],
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
      s = s.split("").map((ch) => ch + ch).join("");
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

  let stopped = false;
  const timeouts = new Set();

  function later(ms, fn) {
    const id = window.setTimeout(() => {
      timeouts.delete(id);
      fn();
    }, ms);
    timeouts.add(id);
    return id;
  }

  function randPct() {
    return rand(-cfg.margin, 1 + cfg.margin) * 100;
  }

  function makeSpec() {
    const size = randi(cfg.sizeMin, cfg.sizeMax);
    const dur = randi(cfg.durMinMs, cfg.durMaxMs);
    const blur = randi(cfg.blurMin, cfg.blurMax);

    const leftPct = randPct();
    const topPct = randPct();

    const dx = randi(-40, 40);
    const dy = randi(-35, 35);

    const [r, g, b, aHex] = ToRGBA(pick(cfg.colors));
    const baseOpacity = resolveOpacity(cfg.opacity);
    const finalOpacity = clamp01(baseOpacity * aHex);

    return {
      size,
      dur,
      blur,
      leftPct,
      topPct,
      dx,
      dy,
      rgb: `${r},${g},${b}`,
      a: `${finalOpacity}`,
    };
  }

  function setLayerColor(layerEl, spec) {
    layerEl.style.setProperty("--rgb", spec.rgb);
    layerEl.style.setProperty("--a", spec.a);
  }

  function applyFinalGeometry(orbEl, spec) {
    orbEl.style.left = `${spec.leftPct}%`;
    orbEl.style.top = `${spec.topPct}%`;
    orbEl.style.width = `${spec.size}px`;
    orbEl.style.height = `${spec.size}px`;
    orbEl.style.filter = `blur(${spec.blur}px)`;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function driftTransform(dx, dy, t, s) {
    return `translate3d(${dx * t}px, ${dy * t}px, 0) scale(${s})`;
  }

  function animateOrb(handle, isFirst = false) {
    if (stopped) return;

    const el = handle.el;
    const a0 = handle.layers[handle.activeIndex];
    const a1 = handle.layers[1 - handle.activeIndex];

    const from = handle.spec || makeSpec();
    const to = makeSpec();

    // Prep next gradient
    setLayerColor(a1, to);
    a1.style.opacity = "0";

    // Geometry baseline (ensures keyframes resolve cleanly)
    applyFinalGeometry(el, from);

    // If WAAPI is missing, fall back to "jump + crossfade" (still no stacking)
    const canAnimate = typeof el.animate === "function" && typeof a0.animate === "function";
    if (!canAnimate) {
      // Crossfade
      a0.style.transition = `opacity ${Math.max(350, Math.floor(to.dur * 0.45))}ms ease-in-out`;
      a1.style.transition = `opacity ${Math.max(350, Math.floor(to.dur * 0.45))}ms ease-in-out`;
      a0.style.opacity = "0";
      a1.style.opacity = "1";

      // Morph geometry
      el.style.transition = [
        `left ${to.dur}ms ease-in-out`,
        `top ${to.dur}ms ease-in-out`,
        `width ${to.dur}ms ease-in-out`,
        `height ${to.dur}ms ease-in-out`,
        `filter ${to.dur}ms ease-in-out`,
        `transform ${to.dur}ms ease-in-out`,
        `opacity ${Math.max(450, Math.floor(to.dur * 0.35))}ms ease-in-out`,
      ].join(", ");

      if (isFirst) el.style.opacity = "0";
      // kick to visible
      requestAnimationFrame(() => {
        el.style.opacity = "0.7";
        el.style.transform = driftTransform(to.dx, to.dy, 1, 1.08);
        applyFinalGeometry(el, to);
      });

      // finalize + loop
      later(to.dur, () => {
        handle.activeIndex = 1 - handle.activeIndex;
        handle.spec = to;
        a0.style.opacity = "0";
        a1.style.opacity = "1";
        animateOrb(handle, false);
      });

      return;
    }

    // Cancel any previous animations on this handle
    handle.anims.forEach((x) => {
      try { x.cancel(); } catch {}
    });
    handle.anims.length = 0;

    const dur = to.dur;
    const fadeDur = Math.max(650, Math.floor(dur * 0.55));

    // Parent morph (move/size/blur + gentle breathe)
    const parentAnim = el.animate(
      [
        {
          left: `${from.leftPct}%`,
          top: `${from.topPct}%`,
          width: `${from.size}px`,
          height: `${from.size}px`,
          filter: `blur(${from.blur}px)`,
          opacity: isFirst ? 0 : 0.7,
          transform: driftTransform(from.dx, from.dy, 0.85, 1.06),
        },
        {
          offset: 0.2,
          left: `${lerp(from.leftPct, to.leftPct, 0.25)}%`,
          top: `${lerp(from.topPct, to.topPct, 0.25)}%`,
          width: `${lerp(from.size, to.size, 0.25)}px`,
          height: `${lerp(from.size, to.size, 0.25)}px`,
          filter: `blur(${lerp(from.blur, to.blur, 0.25)}px)`,
          opacity: 0.88,
          transform: driftTransform(lerp(from.dx, to.dx, 0.25), lerp(from.dy, to.dy, 0.25), 0.45, 1.14),
        },
        {
          offset: 0.8,
          left: `${lerp(from.leftPct, to.leftPct, 0.85)}%`,
          top: `${lerp(from.topPct, to.topPct, 0.85)}%`,
          width: `${lerp(from.size, to.size, 0.85)}px`,
          height: `${lerp(from.size, to.size, 0.85)}px`,
          filter: `blur(${lerp(from.blur, to.blur, 0.85)}px)`,
          opacity: 0.74,
          transform: driftTransform(lerp(from.dx, to.dx, 0.85), lerp(from.dy, to.dy, 0.85), 0.9, 1.16),
        },
        {
          left: `${to.leftPct}%`,
          top: `${to.topPct}%`,
          width: `${to.size}px`,
          height: `${to.size}px`,
          filter: `blur(${to.blur}px)`,
          opacity: 0.7,
          transform: driftTransform(to.dx, to.dy, 1, 1.08),
        },
      ],
      { duration: dur, easing: "ease-in-out", fill: "forwards" }
    );

    // Crossfade gradients (this is the "morph into each other" part)
    const fadeOut = a0.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: fadeDur,
      easing: "ease-in-out",
      fill: "forwards",
    });
    const fadeIn = a1.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: fadeDur,
      easing: "ease-in-out",
      fill: "forwards",
    });

    handle.anims.push(parentAnim, fadeOut, fadeIn);

    parentAnim.finished
      .catch(() => {}) // canceled on stop/restart
      .then(() => {
        if (stopped) return;

        // Snap final styles so the next cycle starts from a clean base
        applyFinalGeometry(el, to);
        el.style.opacity = "0.7";
        el.style.transform = driftTransform(to.dx, to.dy, 1, 1.08);

        // Make the "to" layer the new active
        handle.activeIndex = 1 - handle.activeIndex;
        handle.spec = to;

        const nowActive = handle.layers[handle.activeIndex];
        const nowInactive = handle.layers[1 - handle.activeIndex];
        nowActive.style.opacity = "1";
        nowInactive.style.opacity = "0";

        // Small random pause keeps it organic without stacking
        later(randi(120, 420), () => animateOrb(handle, false));
      });
  }

  // Build a fixed pool (no more spawn/remove/layering)
  const handles = [];
  layer.textContent = "";

  const orbCount = Math.max(1, cfg.maxOrbs | 0);

  for (let i = 0; i < orbCount; i++) {
    const orb = document.createElement("div");
    orb.className = "bgOrb";

    const layerA = document.createElement("div");
    layerA.className = "bgOrbLayer";

    const layerB = document.createElement("div");
    layerB.className = "bgOrbLayer";

    orb.appendChild(layerA);
    orb.appendChild(layerB);
    layer.appendChild(orb);

    const h = {
      el: orb,
      layers: [layerA, layerB],
      activeIndex: 0,
      spec: null,
      anims: [],
    };
    handles.push(h);

    // Seed initial look (instant)
    const init = makeSpec();
    h.spec = init;
    applyFinalGeometry(orb, init);
    setLayerColor(layerA, init);
    layerA.style.opacity = "1";
    layerB.style.opacity = "0";
    orb.style.opacity = "0"; // will fade in on first cycle
    orb.style.transform = driftTransform(init.dx, init.dy, 0.25, 0.95);
  }

  // Start with stagger (re-using cfg.spawnEveryMs)
  handles.forEach((h, i) => {
    later(i * cfg.spawnEveryMs, () => animateOrb(h, true));
  });

  function stop({ removeLayer = false } = {}) {
    if (stopped) return;
    stopped = true;

    // Clear scheduled loops
    for (const id of timeouts) clearTimeout(id);
    timeouts.clear();

    // Cancel animations + clear DOM
    for (const h of handles) {
      h.anims.forEach((x) => {
        try { x.cancel(); } catch {}
      });
      h.anims.length = 0;
    }

    if (layer) {
      layer.textContent = "";
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

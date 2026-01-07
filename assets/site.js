/* ============================================================
   site.js — shared helpers for all pages
   ============================================================ */

/**
 *
 * Orb Handler
 *
*/


let __orbBgStop = null;
export const JSTC_VERSION = "1.4.2";

export function startOrbBackground(opts = {}) {
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (reduce) return { stop() {} };

  // Idempotent: restart cleanly
  if (typeof __orbBgStop === "function") __orbBgStop();

  const cfg = {
    maxOrbs: 5,

    // Re-using this as "stagger start" now (no more spawning/stacking)
    spawnEveryMs: 700,

    sizeMin: 260,
    sizeMax: 560,
    durMinMs: 5000,
    durMaxMs: 13000,
    blurMin: 14,
    blurMax: 24,
    margin: 0.12,

    // opacity option (same behavior as before)
    opacity: { min: 0.35, max: 0.6 },

    colors: ["#20493f", "#306459", "#2f5e7e"],
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

/* ============================================================
   Settings (localStorage)
   ============================================================ */

export const JSTC_SETTINGS_KEY = "JSTC_SETTINGS_v1";

export function getDefaultAppSettings() {
  return {
    version: 1,

    // Theme vars map directly to CSS vars
    themeVars: {
      bg: "#0b0f17",
      card: "#121a2a",
      text: "#e7edf7",
      muted: "#a9b4c7",
      border: "rgba(255,255,255,.08)",
      good: "#3ddc97",
      warn: "#ffcc66",
      bad: "#ff6b6b",
    },

    // Orbs (merged into startOrbBackground options)
    orbs: {
      enabled: true,
      maxOrbs: 5,
      opacity: { min: 0.35, max: 0.6 },
      colors: ["#20493f", "#306459", "#2f5e7e"],
    },

    // Extra hard “off” switch
    reduceMotion: false,
  };
}

function _safeParseJson(raw) {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

export function loadAppSettings(defaults = getDefaultAppSettings()) {
  try {
    const raw = localStorage.getItem(JSTC_SETTINGS_KEY);
    if (!raw) return structuredClone(defaults);

    const parsed = _safeParseJson(raw);
    if (!parsed) return structuredClone(defaults);

    // Shallow merge is fine since we control shape
    const merged = structuredClone(defaults);
    if (parsed.themeVars && typeof parsed.themeVars === "object") {
      merged.themeVars = { ...merged.themeVars, ...parsed.themeVars };
    }
    if (parsed.orbs && typeof parsed.orbs === "object") {
      merged.orbs = { ...merged.orbs, ...parsed.orbs };
    }
    if (typeof parsed.reduceMotion === "boolean") merged.reduceMotion = parsed.reduceMotion;

    return merged;
  } catch {
    return structuredClone(defaults);
  }
}

export function saveAppSettings(settingsObj) {
  try {
    localStorage.setItem(JSTC_SETTINGS_KEY, JSON.stringify(settingsObj || {}));
    return true;
  } catch {
    return false;
  }
}

export function applyCssVars(vars) {
  if (!vars || typeof vars !== "object") return;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) {
    if (v == null) continue;
    const key = k.startsWith("--") ? k : `--${k}`;
    root.style.setProperty(key, String(v));
  }
}

export function applyAppSettings(settingsObj) {
  const s = settingsObj || loadAppSettings();

  applyCssVars(s.themeVars);

  // If user explicitly disables motion, enforce it
  document.documentElement.classList.toggle("reduceMotion", !!s.reduceMotion);

  // If reduceMotion is on, we also treat orbs as disabled
  const orbsEnabled = !!(s.orbs?.enabled) && !s.reduceMotion;
  document.documentElement.classList.toggle("orbsOff", !orbsEnabled);

  // If orbs are off, stop any currently running background
  if (!orbsEnabled && typeof __orbBgStop === "function") {
    __orbBgStop({ removeLayer: true });
  }

  return s;
}

/**
 * Call this once per page at startup.
 * - loads & applies settings
 * - listens for changes from other tabs/pages
 */
export function initAppSettings(defaults = getDefaultAppSettings()) {
  const s = applyAppSettings(loadAppSettings(defaults));

  // Cross-tab/page sync
  window.addEventListener("storage", (ev) => {
    if (ev.key !== JSTC_SETTINGS_KEY) return;
    applyAppSettings(loadAppSettings(defaults));
  });

  return s;
}

/**
 * Convenience: use settings to drive orb behavior.
 * (Still lets each page pass extra base options.)
 */
export function startOrbBackgroundFromSettings(baseOpts = {}) {
  const s = loadAppSettings();
  s.reduceMotion = !!s.reduceMotion;

  const orbsEnabled = !!(s.orbs?.enabled) && !s.reduceMotion;
  if (!orbsEnabled) return { stop() {} };

  const opts = { ...baseOpts, ...(s.orbs || {}) };
  return startOrbBackground(opts);
}

export function exportAppSettingsJson() {
  return JSON.stringify(loadAppSettings(), null, 2);
}

export function importAppSettingsJson(jsonText) {
  const parsed = _safeParseJson(String(jsonText || ""));
  if (!parsed) return { ok: false, error: "Invalid JSON" };

  // Merge into defaults so missing keys don’t nuke the app
  const merged = loadAppSettings();
  if (parsed.themeVars && typeof parsed.themeVars === "object") {
    merged.themeVars = { ...merged.themeVars, ...parsed.themeVars };
  }
  if (parsed.orbs && typeof parsed.orbs === "object") {
    merged.orbs = { ...merged.orbs, ...parsed.orbs };
  }
  if (typeof parsed.reduceMotion === "boolean") merged.reduceMotion = parsed.reduceMotion;

  saveAppSettings(merged);
  applyAppSettings(merged);
  return { ok: true };
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
 * Mark the active bottom tab.
 * Pass a key from the page: "timers", "about", "settings"
 *
 * If omitted, it tries to infer from the current path as a fallback.
 */
export function autoMarkActiveTab(pageKey) {
  function inferKeyFromPath() {
    const p = location.pathname.toLowerCase();
    // tolerate both "/pages/about/" and "/about/" structures
    if (p.includes("/settings/")) return "settings";
    if (p.includes("/about/")) return "about";
    return "timers";
  }

  const key = String(pageKey || inferKeyFromPath()).toLowerCase();

  document.querySelectorAll(".tabs .tabBtn").forEach((a) => {
    const k = (a.getAttribute("data-tab") || "").toLowerCase();
    a.classList.toggle("active", k === key);
  });
}

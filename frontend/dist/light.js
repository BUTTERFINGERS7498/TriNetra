(() => {
  "use strict";
  const scenes = Array.from(document.querySelectorAll("[data-light-scene]"));
  if (!scenes.length) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const visible = new Set();
  const requestFrame = window.requestAnimationFrame?.bind(window);
  const cancelFrame = window.cancelAnimationFrame?.bind(window);
  let scrollFrame = 0;
  const allowsMotion = () => !reduced.matches && document.body.dataset.motion !== "paused" && !document.hidden;

  function paintLight() {
    scrollFrame = 0;
    if (!allowsMotion()) return;
    const viewport = Math.max(window.innerHeight, 1);
    visible.forEach((scene) => {
      const box = scene.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, (viewport - box.top) / (viewport + box.height)));
      const reveal = .48 + Math.sin(progress * Math.PI) * .52;
      scene.style.setProperty("--light-reveal", reveal.toFixed(3));
      scene.style.setProperty("--light-focus", (27 + progress * 46).toFixed(1) + "%");
    });
  }
  function scheduleLight() {
    if (scrollFrame || !visible.size || !allowsMotion()) return;
    if (requestFrame) scrollFrame = requestFrame(paintLight);
    else paintLight();
  }
  function syncMotion() {
    document.body.dataset.lightDocument = document.hidden ? "hidden" : "visible";
    if (!allowsMotion()) {
      if (scrollFrame && cancelFrame) cancelFrame(scrollFrame);
      scrollFrame = 0;
      scenes.forEach((scene) => {
        scene.style.removeProperty("--light-reveal");
        scene.style.removeProperty("--light-focus");
      });
    } else scheduleLight();
  }
  if (typeof IntersectionObserver === "function") {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        target.dataset.lightVisible = String(isIntersecting);
        if (isIntersecting) visible.add(target);
        else visible.delete(target);
      });
      if (!visible.size && scrollFrame) {
        if (cancelFrame) cancelFrame(scrollFrame);
        scrollFrame = 0;
      }
      scheduleLight();
    }, { rootMargin: "80px", threshold: 0 });
    scenes.forEach((scene) => observer.observe(scene));
  }
  // Without IntersectionObserver the artwork stays static and fully visible.
  window.addEventListener("scroll", scheduleLight, { passive: true });
  window.addEventListener("resize", scheduleLight, { passive: true });
  document.addEventListener("visibilitychange", syncMotion);
  reduced.addEventListener("change", syncMotion);
  if (typeof MutationObserver === "function") {
    new MutationObserver(syncMotion).observe(document.body, { attributes: true, attributeFilter: ["data-motion"] });
  }
  syncMotion();
})();

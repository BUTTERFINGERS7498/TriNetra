(() => {
  "use strict";

  const body = document.body;
  const root = document.documentElement;
  const hero = document.querySelector(".hero");
  const heroArt = document.querySelector(".hero-art");
  const closing = document.querySelector(".closing-section");
  const motionToggle = document.getElementById("motion-toggle");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const canvas = document.querySelector(".sentinel-field");
  let context = null;
  try { context = canvas.getContext("2d"); } catch (_) { /* CSS scene remains available. */ }

  const agentContent = {
    detector: {
      kicker: "SIGNAL → FINDING",
      title: ["A pattern becomes", "a place to look."],
      description: "The detector examines shadow request metadata and records a finding with evidence, severity, and an affected endpoint.",
      output: "detector / observation",
      index: "01:03",
      artifact: ["Finding", "Request validation", "eye"],
      lines: [["Source", "shadow.log"], ["Endpoint", "POST /orders"], ["Artifact", "Finding with evidence"]],
      next: "Next: a focused patch proposal"
    },
    fixer: {
      kicker: "FINDING → PROPOSED CHANGE",
      title: ["A finding becomes", "a focused proposal."],
      description: "The fixer reads application source inside the configured fork, proposes a change to an existing file, and passes it through static checks.",
      output: "fixer / proposal",
      index: "02:03",
      artifact: ["Patch proposal", "A focused source change", "code"],
      lines: [["Scope", "Configured source fork"], ["File", "demo_app / app.py"], ["Artifact", "Patch awaiting review"]],
      next: "Next: scope, safety, and correctness"
    },
    reviewer: {
      kicker: "PROPOSED CHANGE → REVIEW",
      title: ["A second look,", "before the next step."],
      description: "The reviewer examines correctness, scope, and safety. An approved patch follows the configured deployment path; a rejected one can return with feedback.",
      output: "reviewer / decision",
      index: "03:03",
      artifact: ["Review decision", "A gate before application", "shield"],
      lines: [["Checks", "Scope, safety, correctness"], ["Decision", "Approve or return feedback"], ["Artifact", "Review with reasoning"]],
      next: "A review gate, before application"
    }
  };
  const tabs = Array.from(document.querySelectorAll("[data-agent-tab]"));
  const panel = document.getElementById("agent-trace-panel");
  const explorer = document.querySelector(".agent-explorer");
  const cards = Array.from(document.querySelectorAll(".agent-card"));

  function setSceneTone(agent) {
    body.dataset.scene = agent;
  }
  function selectAgent(agent, moveFocus = false) {
    const data = agentContent[agent];
    if (!data) return;
    explorer.dataset.agent = agent;
    setSceneTone(agent);
    tabs.forEach((tab, index) => {
      const selected = tab.dataset.agentTab === agent;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      cards[index].classList.toggle("is-active", selected);
      if (selected && moveFocus) tab.focus();
    });
    panel.setAttribute("aria-labelledby", "agent-tab-" + agent);
    document.getElementById("trace-kicker").textContent = data.kicker;
    const title = document.getElementById("trace-title");
    title.replaceChildren(document.createTextNode(data.title[0]), document.createElement("br"), document.createTextNode(data.title[1]));
    document.getElementById("trace-description").textContent = data.description;
    document.getElementById("trace-output-label").textContent = data.output;
    document.getElementById("trace-output-index").textContent = data.index;
    document.getElementById("trace-artifact-kind").textContent = data.artifact[0];
    document.getElementById("trace-artifact-title").textContent = data.artifact[1];
    document.querySelector(".trace-artifact use").setAttribute("href", "#" + data.artifact[2]);
    const rows = data.lines.map(([label, value]) => {
      const row = document.createElement("div");
      const key = document.createElement("span");
      const result = document.createElement("strong");
      key.textContent = label;
      result.textContent = value;
      row.append(key, result);
      return row;
    });
    document.getElementById("trace-lines").replaceChildren(...rows);
    document.getElementById("trace-next").textContent = data.next;
    panel.classList.remove("is-changing");
    if (!reduced.matches) {
      void panel.offsetWidth;
      panel.classList.add("is-changing");
    }
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectAgent(tab.dataset.agentTab));
    tab.addEventListener("keydown", (event) => {
      let next = index;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else return;
      event.preventDefault();
      selectAgent(tabs[next].dataset.agentTab, true);
    });
  });
  cards.forEach((card) => {
    card.addEventListener("click", () => {
      const role = card.dataset.role;
      if (role) selectAgent(role);
    });
  });
  const compactRoles = window.matchMedia("(max-width: 719px)");
  const updateTabOrientation = () => document.querySelector(".agent-tabs").setAttribute("aria-orientation", compactRoles.matches ? "horizontal" : "vertical");
  compactRoles.addEventListener("change", updateTabOrientation);
  updateTabOrientation();
  cards[0].classList.add("is-active");
  setSceneTone("detector");
  document.querySelectorAll("[data-route-target]").forEach((button) => {
    button.addEventListener("click", () => setSceneTone(button.dataset.routeTarget === "shadow" ? "fixer" : "reviewer"));
  });
  document.querySelectorAll("[data-stage]").forEach((button) => {
    button.addEventListener("click", () => {
      const stage = button.dataset.stage;
      setSceneTone(stage === "detected" ? "detector" : stage === "fixing" || stage === "rejected" ? "fixer" : "reviewer");
    });
  });

  let manualPause = false;
  let animationAllowed = false;
  let heroVisible = true;
  let animationFrame = 0;
  let scrollFrame = 0;
  let lastFrameTime = 0;
  let lastPaint = 0;
  let sceneTime = 0;
  let width = 0;
  let height = 0;
  const requestFrame = typeof window.requestAnimationFrame === "function" ? window.requestAnimationFrame.bind(window) : null;
  const cancelFrame = typeof window.cancelAnimationFrame === "function" ? window.cancelAnimationFrame.bind(window) : () => {};

  function drawField(time = 0) {
    if (!context || width < 1 || height < 1) return;
    context.clearRect(0, 0, width, height);
    const count = width < 400 ? 14 : 24;
    const tone = body.dataset.scene === "reviewer" ? [183, 149, 231] :
      body.dataset.scene === "fixer" ? [133, 166, 240] : [158, 144, 223];
    for (let index = 0; index < count; index++) {
      const theta = index * 2.39996;
      const px = width * (.5 + Math.sin(theta) * .43);
      const py = height * (.12 + (index / count) * .76) + Math.sin(time * .00018 + theta) * 6;
      const strength = .12 + (Math.sin(time * .00035 + theta) + 1) * .08;
      context.beginPath();
      const radius = index % 4 === 0 ? 1.2 : 0.7;
      context.arc(px, py, radius, 0, Math.PI * 2);
      context.fillStyle = "rgba(" + tone.join(",") + "," + strength.toFixed(2) + ")";
      context.fill();
      if (index % 6 === 0) {
        context.beginPath();
        context.arc(px, py, radius * 3, 0, Math.PI * 2);
        context.fillStyle = "rgba(" + tone.join(",") + "," + (strength * 0.25).toFixed(2) + ")";
        context.fill();
      }
    }
  }
  function sizeField() {
    const box = heroArt.getBoundingClientRect();
    width = box.width;
    height = box.height;
    if (context && width > 0 && height > 0) {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawField(sceneTime);
    }
  }
  function stopFrames() {
    if (animationFrame) cancelFrame(animationFrame);
    animationFrame = 0;
    lastFrameTime = 0;
  }
  function frame(time) {
    animationFrame = 0;
    if (!animationAllowed || document.hidden || !heroVisible) return;
    const delta = lastFrameTime ? Math.min(time - lastFrameTime, 50) : 16;
    lastFrameTime = time;
    sceneTime += delta;
    if (heroVisible) {
      if (time - lastPaint > 32) { drawField(sceneTime); lastPaint = time; }
    }
    if (requestFrame) animationFrame = requestFrame(frame);
  }
  function startFrames() {
    if (requestFrame && !animationFrame && animationAllowed && !document.hidden && heroVisible) {
      animationFrame = requestFrame(frame);
    }
  }
  function updateMotion() {
    animationAllowed = !reduced.matches && !manualPause;
    body.dataset.motion = animationAllowed ? "active" : "paused";
    body.dataset.sentinel = heroVisible && !document.hidden ? "visible" : "hidden";
    motionToggle.disabled = reduced.matches;
    motionToggle.setAttribute("aria-pressed", String(animationAllowed));
    motionToggle.setAttribute("aria-label", reduced.matches ? "Reduced motion is enabled in your system" :
      animationAllowed ? "Pause ambient motion" : "Resume ambient motion");
    motionToggle.querySelector(".motion-label").textContent = reduced.matches ? "Reduced motion" :
      animationAllowed ? "Pause motion" : "Resume motion";
    hero.querySelector(".sentinel-caption small").textContent = animationAllowed ? "A symbol of watchful intelligence" : "The sentinel, at rest";
    if (animationAllowed) startFrames();
    else {
      stopFrames();
      drawField(sceneTime);
    }
  }
  motionToggle.addEventListener("click", () => {
    if (reduced.matches) return;
    manualPause = !manualPause;
    updateMotion();
  });
  reduced.addEventListener("change", updateMotion);
  document.addEventListener("visibilitychange", () => {
    body.dataset.sentinel = heroVisible && !document.hidden ? "visible" : "hidden";
    if (document.hidden) stopFrames();
    else startFrames();
  });

  function trackSurface(element, variablePrefix, onMove) {
    element.addEventListener("pointermove", (event) => {
      if (!finePointer.matches || !animationAllowed || event.pointerType === "touch") return;
      const bounds = element.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
      const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
      element.style.setProperty("--" + variablePrefix + "-x", (x * 100).toFixed(1) + "%");
      element.style.setProperty("--" + variablePrefix + "-y", (y * 100).toFixed(1) + "%");
      if (onMove) onMove(x, y);
    }, { passive: true });
  }
  trackSurface(closing, "closing");
  document.querySelectorAll(".routing-demo,.boundary-art,.agent-card,.agent-explorer").forEach((element) => trackSurface(element, "surface"));
  document.querySelectorAll(".button").forEach((button) => {
    trackSurface(button, "button-light", (x, y) => {
      button.style.setProperty("--button-x", ((x - .5) * 5).toFixed(2) + "px");
      button.style.setProperty("--button-y", ((y - .5) * 4).toFixed(2) + "px");
    });
    button.addEventListener("pointerleave", () => {
      button.style.removeProperty("--button-x");
      button.style.removeProperty("--button-y");
    });
  });

  function updateScroll() {
    scrollFrame = 0;
    const length = document.documentElement.scrollHeight - window.innerHeight;
    const progress = length > 0 ? Math.max(0, Math.min(1, window.scrollY / length)) : 0;
    root.style.setProperty("--reading-progress", progress.toFixed(4));
  }
  window.addEventListener("scroll", () => {
    if (scrollFrame) return;
    if (requestFrame) scrollFrame = requestFrame(updateScroll);
    else updateScroll();
  }, { passive: true });
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(sizeField).observe(heroArt);
  } else {
    window.addEventListener("resize", sizeField, { passive: true });
  }
  window.addEventListener("resize", updateScroll, { passive: true });

  if (typeof IntersectionObserver === "function") {
    const sceneObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.target === hero) heroVisible = entry.isIntersecting;
      });
      body.dataset.sentinel = heroVisible && !document.hidden ? "visible" : "hidden";
      if (heroVisible) { lastFrameTime = 0; startFrames(); }
      else stopFrames();
    }, { rootMargin: "80px" });
    sceneObserver.observe(hero);

    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: .07, rootMargin: "0px 0px -15px 0px" });
    document.querySelectorAll(".section-heading,.agent-card,.agent-explorer,.workspace-heading,.workspace-shell,.safeguards-copy,.boundary-art,.setup-section,.faq-heading,.faq-items").forEach((element) => {
      element.classList.add("reveal-block");
      revealObserver.observe(element);
    });
    root.classList.add("experience-ready");

    const sectionLinks = Array.from(document.querySelectorAll(".desktop-nav a[href^='#']"));
    const navObserver = new IntersectionObserver((entries) => {
      const active = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!active) return;
      sectionLinks.forEach((link) => {
        const selected = link.getAttribute("href") === "#" + active.target.id;
        link.classList.toggle("is-current", selected);
        if (selected) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    }, { rootMargin: "-15% 0px -45% 0px", threshold: [0, .1, .3, .5] });
    sectionLinks.forEach((link) => {
      const section = document.querySelector(link.getAttribute("href"));
      if (section) navObserver.observe(section);
    });
  }
  sizeField();
  updateMotion();
  updateScroll();
})();

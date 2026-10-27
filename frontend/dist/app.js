(() => {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const header = document.querySelector(".site-header");
  const menuToggle = document.querySelector(".menu-toggle");
  const mobileNav = document.getElementById("mobile-nav");
  const docsDialog = document.getElementById("docs-dialog");
  let docsOpener = null;

  function closeMenu() {
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Open navigation");
    mobileNav.hidden = true;
  }

  menuToggle.addEventListener("click", () => {
    const opening = menuToggle.getAttribute("aria-expanded") !== "true";
    menuToggle.setAttribute("aria-expanded", String(opening));
    menuToggle.setAttribute("aria-label", opening ? "Close navigation" : "Open navigation");
    mobileNav.hidden = !opening;
  });
  mobileNav.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
  window.matchMedia("(min-width: 720px)").addEventListener("change", (event) => {
    if (event.matches) closeMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
  const updateHeader = () => header.classList.toggle("is-scrolled", window.scrollY > 15);
  window.addEventListener("scroll", updateHeader, { passive: true });
  updateHeader();

  document.querySelectorAll("[data-open-docs]").forEach((button) => {
    button.addEventListener("click", () => {
      docsOpener = button;
      closeMenu();
      if (!docsDialog.open) docsDialog.showModal();
      document.body.classList.add("dialog-open");
    });
  });
  const closeDocs = () => docsDialog.close();
  docsDialog.querySelector(".dialog-close").addEventListener("click", closeDocs);
  docsDialog.querySelector(".docs-done").addEventListener("click", closeDocs);
  docsDialog.addEventListener("click", (event) => {
    if (event.target !== docsDialog) return;
    const bounds = docsDialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) closeDocs();
  });
  docsDialog.addEventListener("close", () => {
    document.body.classList.remove("dialog-open");
    if (docsOpener && !docsOpener.closest("[hidden]")) docsOpener.focus();
  });

  const routingDemo = document.querySelector(".routing-demo");
  const routeDescription = document.getElementById("route-description");
  const routeButtons = document.querySelectorAll("[data-route-target]");
  const replayButton = document.getElementById("replay-demo");
  const routeCopy = {
    production: "Ordinary traffic continues to production. Select shadow to see the diversion path.",
    shadow: "Flagged sessions move to shadow. Their activity becomes evidence for the detector."
  };
  let demoTimers = [];

  function setRouteCopy(text) {
    const dot = document.createElement("span");
    dot.className = "inline-dot";
    dot.setAttribute("aria-hidden", "true");
    routeDescription.replaceChildren(dot, document.createTextNode(text));
  }
  function stopReplay() {
    demoTimers.forEach(window.clearTimeout);
    demoTimers = [];
    routingDemo.classList.remove("is-replaying");
    replayButton.disabled = false;
    replayButton.querySelector("span").textContent = "Replay demo";
  }
  function selectRoute(route) {
    routingDemo.dataset.route = route;
    routeButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.routeTarget === route));
    });
    setRouteCopy(routeCopy[route]);
  }
  routeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      stopReplay();
      selectRoute(button.dataset.routeTarget);
    });
  });
  replayButton.addEventListener("click", () => {
    stopReplay();
    if (reducedMotion.matches) {
      selectRoute("shadow");
      setRouteCopy("Demo complete: ordinary traffic continues to production; flagged sessions move to shadow.");
      return;
    }
    routingDemo.classList.add("is-replaying");
    replayButton.disabled = true;
    replayButton.querySelector("span").textContent = "Playing demo";
    selectRoute("production");
    setRouteCopy("01 / Observe: the gateway receives and examines application traffic.");
    demoTimers.push(window.setTimeout(() => {
      setRouteCopy("02 / Score: suspicious activity adds to the session and IP threat score.");
    }, 1400));
    demoTimers.push(window.setTimeout(() => {
      selectRoute("shadow");
      setRouteCopy("03 / Divert: flagged sessions are routed to a separate shadow environment.");
    }, 2900));
    demoTimers.push(window.setTimeout(() => {
      stopReplay();
      setRouteCopy("04 / Learn: shadow request logs become evidence for a finding. Demo complete.");
    }, 4600));
  });
  reducedMotion.addEventListener("change", () => {
    stopReplay();
    selectRoute("shadow");
  });

  const stageContent = {
    detected: {
      label: "A FINDING TAKES SHAPE",
      description: "The detector records the endpoint, evidence, and a recommendation for this sample finding."
    },
    fixing: {
      label: "A FOCUSED CHANGE",
      description: "The fixer reads the source fork and proposes a validation change to an existing file."
    },
    reviewing: {
      label: "AT THE REVIEW GATE",
      description: "The proposed change is being checked for correctness, scope, and safety."
    },
    deployed: {
      label: "THE DEMO DEPLOYMENT STEP",
      description: "In the Python target, an approved patch is copied into the deployed app for hot reload. This preview applies nothing."
    },
    rejected: {
      label: "FEEDBACK, BEFORE FORWARD",
      description: "A rejected patch can return to the fixer with feedback. This alternate sample state changes no application files."
    }
  };
  const stageColumns = document.querySelectorAll("[data-stage]");
  const findingCard = document.querySelector(".finding-card");
  const stageDetailLabel = document.getElementById("stage-detail-label");
  const stageDetailDescription = document.getElementById("stage-detail-description");
  const pipelinePanel = document.getElementById("pipeline-panel");
  const patchPanel = document.getElementById("patch-panel");
  const breadcrumb = document.getElementById("preview-breadcrumb");
  const panelTitle = document.getElementById("preview-panel-title");
  const panelDescription = document.getElementById("preview-panel-description");
  const previewBottom = document.querySelector(".preview-bottom > span:first-child");

  stageColumns.forEach((column) => {
    column.addEventListener("click", () => {
      const stage = column.dataset.stage;
      stageColumns.forEach((candidate) => {
        const selected = candidate === column;
        candidate.classList.toggle("is-selected", selected);
        candidate.setAttribute("aria-pressed", String(selected));
        candidate.querySelector(".stage-count").textContent = selected ? "1" : "0";
      });
      column.querySelector(".column-slot").appendChild(findingCard);
      stageDetailLabel.textContent = stageContent[stage].label;
      stageDetailDescription.textContent = stageContent[stage].description;
    });
  });

  function selectPreview(view) {
    const patchSelected = view === "patch";
    pipelinePanel.hidden = patchSelected;
    patchPanel.hidden = !patchSelected;
    breadcrumb.textContent = patchSelected ? "Patch review" : "Pipeline";
    panelTitle.textContent = patchSelected ? "A change, under consideration" : "The patch pipeline";
    panelDescription.textContent = patchSelected ?
      "One illustrative change. The reasoning beside it." :
      "A finding, with its whole journey in view.";
    document.querySelectorAll(".preview-nav").forEach((button) => {
      const selected = button.dataset.previewView === view;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#eye");
    icon.appendChild(use);
    previewBottom.replaceChildren(icon, document.createTextNode(patchSelected ?
      "Illustrative source. No application files are changed." :
      "Select a stage to explore the sample finding."));
  }
  document.querySelectorAll("[data-preview-view]").forEach((button) => {
    button.addEventListener("click", () => selectPreview(button.dataset.previewView));
  });
})();

export const setupShellPanels = () => {
  const gameShell = document.querySelector<HTMLElement>("#game-shell")!;
  const layoutBackdrop = document.querySelector<HTMLElement>("#layout-backdrop")!;
  const sidePanels = {
    left: document.querySelector<HTMLElement>("#mission-panel")!,
    right: document.querySelector<HTMLElement>("#campaign-panel")!,
  };
  const drawerButtons = [...document.querySelectorAll<HTMLButtonElement>(".drawer-toggle")];
  const usesDrawerLayout = () => window.matchMedia("(max-width: 999px)").matches;

  const syncDrawers = () => {
    const openSide = sidePanels.left.classList.contains("drawer-open")
      ? "left"
      : sidePanels.right.classList.contains("drawer-open")
        ? "right"
        : null;
    layoutBackdrop.hidden = !openSide;
    document.body.classList.toggle("drawer-active", Boolean(openSide));
    drawerButtons.forEach((button) =>
      button.setAttribute("aria-expanded", String(button.dataset.drawer === openSide)),
    );
  };

  const closeDrawers = () => {
    sidePanels.left.classList.remove("drawer-open");
    sidePanels.right.classList.remove("drawer-open");
    syncDrawers();
  };

  drawerButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const side = button.dataset.drawer === "right" ? "right" : "left";
      const opening = !sidePanels[side].classList.contains("drawer-open");
      closeDrawers();
      if (opening) sidePanels[side].classList.add("drawer-open");
      syncDrawers();
    });
  });
  layoutBackdrop.addEventListener("click", closeDrawers);

  document.querySelectorAll<HTMLButtonElement>(".panel-collapse").forEach((button) => {
    button.addEventListener("click", () => {
      const side = button.dataset.side === "right" ? "right" : "left";
      if (usesDrawerLayout()) {
        closeDrawers();
        return;
      }
      const collapsed = gameShell.classList.toggle(`${side}-collapsed`);
      button.setAttribute("aria-expanded", String(!collapsed));
      button.textContent = side === "left" ? (collapsed ? "›" : "‹") : collapsed ? "‹" : "›";
    });
  });

  window.addEventListener("resize", () => {
    if (!usesDrawerLayout()) closeDrawers();
  });

  return { closeDrawers };
};

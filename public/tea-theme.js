//applies the saved tea theme and light/dark scheme before first paint; keep in sync with src/shared/tea-theme.ts
(function () {
  var root = document.documentElement;
  var media = window.matchMedia("(prefers-color-scheme: dark)");

  function read(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function applyScheme() {
    var pref = read("watagent.scheme.v1");
    var dark = pref === "dark" || (pref !== "light" && media.matches);
    root.setAttribute("data-scheme", dark ? "dark" : "light");
  }

  var id = read("watagent.theme.v1");
  if (id && id !== "earl-grey" && /^[a-z-]{1,24}$/.test(id)) root.setAttribute("data-tea", id);
  applyScheme();
  //only matters while following the system; an explicit choice ignores it
  media.addEventListener("change", applyScheme);
})();

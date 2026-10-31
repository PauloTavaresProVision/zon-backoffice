export const THEME_KEY = "zon-theme";

/** Corre antes de pintar a página, para não piscar o tema errado. */
export const themeScript = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;}catch(e){}})();`;

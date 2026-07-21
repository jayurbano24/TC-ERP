/**
 * Script bloqueante (antes de React) para aplicar `data-theme` desde localStorage.
 * Evita el flash light→dark y ventanas mal pintadas al entrar / refrescar.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}var r=document.documentElement;r.setAttribute("data-theme",t);r.classList.toggle("dark",t==="dark");}catch(e){}})();`;

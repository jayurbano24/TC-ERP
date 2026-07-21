/**
 * Parche temprano: el overlay de errores de Next llama a clipboard.writeText.
 * Si la pestaña no tiene foco (Cursor/IDE), Chrome lanza NotAllowedError.
 */
export const CLIPBOARD_BOOT_SCRIPT = `(function(){try{var c=navigator.clipboard;if(!c||typeof c.writeText!=="function")return;var o=c.writeText.bind(c);Object.defineProperty(c,"writeText",{configurable:true,writable:true,value:function(t){try{if(typeof document!=="undefined"&&!document.hasFocus())return Promise.resolve();return Promise.resolve(o(t)).catch(function(e){if(e&&e.name==="NotAllowedError")return;throw e;});}catch(e){if(e&&e.name==="NotAllowedError")return Promise.resolve();throw e;}}});}catch(e){}})();`;

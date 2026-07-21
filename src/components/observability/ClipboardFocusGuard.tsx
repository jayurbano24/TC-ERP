'use client';

import { useEffect } from 'react';

/**
 * Next.js error overlay calls clipboard.writeText; if the tab/document is not
 * focused (IDE focus, DevTools, etc.) Chrome throws NotAllowedError and floods
 * the console. Soft-no-op when unfocused or denied.
 */
export function ClipboardFocusGuard() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;

    const clipboard = navigator.clipboard;
    const original = clipboard.writeText.bind(clipboard);

    clipboard.writeText = async (text: string) => {
      try {
        if (typeof document !== 'undefined' && !document.hasFocus()) {
          return;
        }
        await original(text);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          return;
        }
        throw err;
      }
    };

    return () => {
      clipboard.writeText = original;
    };
  }, []);

  return null;
}

"use client";

/**
 * Prints a booking's label from the current page (desktop browsers). The label is served from our own
 * site (/api/label/:id) so the browser allows printing it; iPhone/iPad can't print a PDF from a page,
 * so it opens in a new tab there (Share → Print), and also whenever printing in place fails.
 * `done` is called once the label has loaded (or the fallback opened).
 */
export function printLabel(id: string, done: () => void = () => {}) {
  const src = `/api/label/${encodeURIComponent(id)}`;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const fallback = () => {
    done();
    window.open(src, "_blank", "noopener");
  };
  if (isIOS) return fallback();

  document.getElementById("label-print-frame")?.remove();
  const frame = document.createElement("iframe");
  frame.id = "label-print-frame";
  frame.title = "Label for printing";
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  frame.onload = () => {
    done();
    // Give the PDF viewer a moment to load before opening the print dialog.
    setTimeout(() => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        fallback();
      }
    }, 400);
  };
  frame.onerror = fallback;
  frame.src = src;
  document.body.appendChild(frame);
}

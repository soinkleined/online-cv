function printResume() {
  window.print();
}

// Directory of the page the visitor is actually on, including a project-site
// prefix such as /online-cv/. An absolute "/print" drops that prefix and 404s.
function resumeDirectory() {
  var current = new URL(window.location.href);
  var path = current.pathname;
  if (!path.endsWith("/")) {
    if (/\.[a-z0-9]+$/i.test(path.split("/").pop())) {
      path = path.replace(/[^/]*$/, "");
    } else {
      path += "/";
    }
  }
  current.pathname = path;
  current.search = "";
  current.hash = "";
  return current.href;
}

function resumePrintUrl() {
  return new URL("print/", resumeDirectory()).href;
}

function resumeFilename(root) {
  var nameEl = root.querySelector(".name");
  var name = nameEl ? nameEl.textContent.trim() : "Resume";
  return name.replace(/\s+/g, "_") + "_Resume.pdf";
}

// Options must be created inside the print frame. html2pdf checks
// constructor === Array, and an array built in the parent window fails that.
function framePdfOptions(win, filename, windowWidth) {
  return win.Function(
    "filename",
    "windowWidth",
    "return {" +
      "margin: 12," +
      "filename: filename," +
      "pagebreak: { mode: [], before: [], after: [], avoid: [] }," +
      "image: { type: 'jpeg', quality: 0.98 }," +
      "html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: windowWidth }," +
      "jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }" +
      "};"
  )(filename, windowWidth);
}

// html2pdf slices the canvas with innerHeight / innerWidth, then scales the
// image to the A4 content box (12mm margin). Page breaks are measured in the
// 1000px screen card so the captured layout matches the site.
function pdfContentBox(widthPx) {
  var innerW = 210 - 24;
  var innerH = 297 - 24;
  return {
    pageHeight: widthPx * (innerH / innerW),
    contentWidth: widthPx,
  };
}

// Move whole roles that fit on one page. A role taller than a page breaks
// before a bullet, with its title row kept on the same page as the first bullet.
function paginateResume(doc, root) {
  root.style.boxSizing = "border-box";
  root.style.width = "1000px";
  root.style.maxWidth = "1000px";

  var contentWidth = root.getBoundingClientRect().width;
  var box = pdfContentBox(contentWidth);
  var pageHeight = box.pageHeight;
  var safety = 14;

  function origin() {
    return root.getBoundingClientRect().top;
  }

  function place(el) {
    var rect = el.getBoundingClientRect();
    var top = rect.top - origin();
    var bottom = rect.bottom - origin();
    if (top < 0) top = 0;
    return { top: top, bottom: bottom, height: Math.max(0, bottom - top) };
  }

  function pushToNext(el) {
    if (!el || !el.parentNode) return;
    el.style.marginTop = "0px";
    var top = place(el).top;
    var page = Math.floor(top / pageHeight + 1e-4);
    var offset = top - page * pageHeight;
    if (offset < 1) return;
    var padH = (page + 1) * pageHeight - top;
    if (padH < 1) return;
    var pad = doc.createElement("div");
    pad.className = "pdf-page-pad";
    pad.setAttribute("aria-hidden", "true");
    pad.style.cssText =
      "display:block;width:100%;height:" +
      padH.toFixed(2) +
      "px;margin:0;padding:0;border:0;line-height:0;font-size:0;overflow:hidden;";
    el.parentNode.insertBefore(pad, el);
  }

  function tooTall(el) {
    return place(el).height > pageHeight - safety;
  }

  function crosses(el) {
    var pos = place(el);
    if (pos.height > pageHeight - safety) return false;
    var page = Math.floor(pos.top / pageHeight + 1e-4);
    return pos.bottom > (page + 1) * pageHeight - safety;
  }

  function keepWithFollowing(el, nextEl) {
    if (!el || !nextEl || tooTall(el)) return;
    var head = place(el);
    var tail = place(nextEl);
    var page = Math.floor(head.top / pageHeight + 1e-4);
    var limit = (page + 1) * pageHeight - safety;
    var pairHeight = tail.bottom - head.top;
    if (pairHeight <= pageHeight - safety && tail.bottom > limit) {
      pushToNext(el);
    }
  }

  function splitTall(item) {
    var meta = item.querySelector(":scope > .meta");
    var lines = item.querySelectorAll(".details li");
    if (meta && lines.length) keepWithFollowing(meta, lines[0]);
    else if (meta && crosses(meta)) pushToNext(meta);
    for (var i = 0; i < lines.length; i++) {
      if (crosses(lines[i])) pushToNext(lines[i]);
    }
  }

  // The sidebar is the left column of the screen card. Pushing it would
  // open a gap at the top of the main column instead of keeping the name
  // aligned with the first section.
  var sections = root.querySelectorAll(".main-wrapper .section");
  for (var s = 0; s < sections.length; s++) {
    var section = sections[s];
    var blocks = [];
    var title = section.querySelector(":scope > .section-title");
    var intro = section.querySelector(":scope > .intro");
    var summary = section.querySelector(":scope > .summary");
    if (title) blocks.push(title);
    if (intro) blocks.push(intro);
    if (summary) blocks.push(summary);
    var skillset = section.querySelector(":scope > .skillset");
    if (skillset) blocks.push(skillset);
    var items = section.querySelectorAll(":scope > .item");
    for (var n = 0; n < items.length; n++) blocks.push(items[n]);

    for (var b = 0; b < blocks.length; b++) {
      var el = blocks[b];
      if (!el.getClientRects().length) continue;
      if (el.classList.contains("section-title") && blocks[b + 1]) {
        keepWithFollowing(el, blocks[b + 1]);
        if (crosses(el)) pushToNext(el);
        continue;
      }
      if (tooTall(el)) splitTall(el);
      else if (crosses(el)) pushToNext(el);
    }
  }

  return { pageHeight: pageHeight, contentWidth: contentWidth };
}

function generatePDF() {
  var button = document.getElementById("pdfButton");
  var previousLabel = button ? button.innerHTML : "";
  if (button) {
    button.disabled = true;
    button.textContent = "Preparing…";
  }

  var iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  // Off-screen and transparent. A negative z-index still paints over the
  // page, and display:none would make the print document measure as empty.
  iframe.style.cssText =
    "position:fixed;left:-2400px;top:0;width:1000px;height:1400px;border:0;opacity:0;pointer-events:none;";
  iframe.src = resumePrintUrl();

  function finish() {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    if (button) {
      button.disabled = false;
      button.innerHTML = previousLabel;
    }
  }

  iframe.onload = function () {
    var win = iframe.contentWindow;
    var doc = win.document;
    if (!win.html2pdf) {
      console.error("PDF library failed to load from " + iframe.src);
      finish();
      return;
    }

    doc.documentElement.classList.add("pdf-export");
    doc.body.classList.add("pdf-export");
    doc.documentElement.style.overflow = "hidden";
    doc.body.style.overflow = "hidden";

    var wrapper = doc.querySelector(".wrapper");
    if (!wrapper) {
      console.error("Print resume did not load from " + iframe.src);
      finish();
      return;
    }

    var run = function () {
      try {
        paginateResume(doc, wrapper);
        var options = framePdfOptions(
          win,
          resumeFilename(doc),
          Math.ceil(wrapper.getBoundingClientRect().width)
        );
        win
          .html2pdf()
          .set(options)
          .from(wrapper)
          .outputPdf("blob")
          .then(function (blob) {
            // html2pdf saves by clicking a link inside the frame on a later
            // turn. A click in the top document, after the blob exists, is
            // what actually starts David_Klein_Resume.pdf.
            var url = URL.createObjectURL(blob);
            var link = document.createElement("a");
            link.href = url;
            link.download = options.filename;
            document.body.appendChild(link);
            link.click();
            setTimeout(function () {
              URL.revokeObjectURL(url);
              if (link.parentNode) link.parentNode.removeChild(link);
              finish();
            }, 1000);
          })
          .catch(function (err) {
            console.error("Error generating PDF:", err);
            finish();
          });
      } catch (err) {
        console.error("Error generating PDF:", err);
        finish();
      }
    };

    if (doc.fonts && doc.fonts.ready) {
      doc.fonts.ready.then(run).catch(run);
    } else {
      run();
    }
  };

  document.body.appendChild(iframe);
}

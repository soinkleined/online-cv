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

function pdfOptions(filename) {
  return {
    // A single number is required: html2pdf rejects a margin array that
    // was created in the parent page and passed into the print frame.
    margin: 12,
    filename: filename,
    // Breaks are inserted by paginateResume. html2pdf's own avoid pass
    // measures a different page height and slices through glyphs.
    pagebreak: { mode: [], before: [], after: [], avoid: [] },
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    },
    jsPDF: {
      unit: "mm",
      format: "a4",
      orientation: "portrait",
    },
  };
}

var PDF_ATOM_SELECTOR = [
  ".section-title",
  ".upper-row",
  ".second-upper-row",
  ".company",
  ".university",
  ".cert-org",
  ".recommendation-role",
  ".details li",
  ".summary",
  ".profile-container",
  ".sidebar-wrapper .container-block",
  ".skillset .item",
  ".projects-section .item",
  ".oss-section .item",
  ".publications-section .item",
].join(",");

// Push each title row, bullet, and heading onto the next A4 content page
// instead of letting html2canvas cut the bitmap through a line of text.
function paginateResume(doc, root) {
  var probe = doc.createElement("div");
  probe.style.cssText =
    "width:186mm;height:273mm;position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;";
  doc.body.appendChild(probe);
  var box = probe.getBoundingClientRect();
  var pageHeight = box.height;
  var contentWidth = box.width;
  probe.parentNode.removeChild(probe);

  root.style.boxSizing = "border-box";
  root.style.width = contentWidth + "px";
  root.style.maxWidth = contentWidth + "px";

  var safety = 8;
  var origin = function () {
    return root.getBoundingClientRect().top;
  };

  var all = Array.prototype.filter.call(root.querySelectorAll(PDF_ATOM_SELECTOR), function (el) {
    return el.getClientRects().length > 0;
  });
  var atoms = all.filter(function (el) {
    for (var i = 0; i < all.length; i++) {
      if (all[i] !== el && el.contains(all[i])) return false;
    }
    return true;
  });

  function padBefore(el, padH) {
    if (padH < 1) return;
    var pad = doc.createElement("div");
    pad.className = "pdf-page-pad";
    pad.setAttribute("aria-hidden", "true");
    pad.style.cssText =
      "display:block;width:100%;height:" +
      padH.toFixed(2) +
      "px;margin:0;padding:0;border:0;overflow:hidden;clear:both;";
    el.parentNode.insertBefore(pad, el);
  }

  function pushToNext(el) {
    el.style.marginTop = "0px";
    var top = el.getBoundingClientRect().top - origin();
    if (top < 0) top = 0;
    var page = Math.floor(top / pageHeight + 1e-4);
    if (top - page * pageHeight < 1) return;
    padBefore(el, (page + 1) * pageHeight - top);
  }

  for (var i = 0; i < atoms.length; i++) {
    var el = atoms[i];
    var rect = el.getBoundingClientRect();
    var top = rect.top - origin();
    var bottom = rect.bottom - origin();
    var height = bottom - top;
    var page = Math.floor(top / pageHeight + 1e-4);
    var limit = (page + 1) * pageHeight - safety;
    if (bottom > limit && height <= pageHeight - safety) {
      pushToNext(el);
    }

    var next = atoms[i + 1];
    if (next && el.classList.contains("section-title")) {
      var elTop = el.getBoundingClientRect().top - origin();
      var elPage = Math.floor(elTop / pageHeight + 1e-4);
      var nextRect = next.getBoundingClientRect();
      var nextH = nextRect.height;
      var nextBottom = nextRect.bottom - origin();
      if (nextBottom > (elPage + 1) * pageHeight - safety && nextH <= pageHeight - safety) {
        pushToNext(el);
      }
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
  iframe.style.cssText =
    "position:fixed;left:0;top:0;width:186mm;height:297mm;border:0;z-index:-1;overflow:hidden;";
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

    var options = pdfOptions(resumeFilename(doc));
    if (options.html2canvas) {
      // Match the laid-out sheet so a 703px window does not restyle the capture.
      options.html2canvas.windowWidth = Math.ceil(wrapper.getBoundingClientRect().width);
    }

    var run = function () {
      paginateResume(doc, wrapper);
      if (options.html2canvas) {
        options.html2canvas.windowWidth = Math.ceil(wrapper.getBoundingClientRect().width);
      }
      win
        .html2pdf()
        .set(options)
        .from(wrapper)
        .save()
        .then(function () {
          // html2pdf clicks the download link on a later turn. Removing the
          // frame before that turn cancels the save.
          setTimeout(finish, 1000);
        })
        .catch(function (err) {
          console.error("Error generating PDF:", err);
          finish();
        });
    };

    if (doc.fonts && doc.fonts.ready) {
      doc.fonts.ready.then(run).catch(run);
    } else {
      run();
    }
  };

  document.body.appendChild(iframe);
}

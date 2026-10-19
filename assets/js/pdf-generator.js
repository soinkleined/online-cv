function printResume() {
  window.print();
}

function resumePrintUrl() {
  return new URL("print/", window.location.href).href;
}

function resumeFilename(root) {
  var nameEl = root.querySelector(".name");
  var name = nameEl ? nameEl.textContent.trim() : "Resume";
  return name.replace(/\s+/g, "_") + "_Resume.pdf";
}

function pdfOptions(filename) {
  return {
    margin: [12, 12, 14, 12],
    filename: filename,
    pagebreak: {
      mode: ["css", "legacy"],
      avoid: [".item", ".section-title", ".summary", ".container-block"],
    },
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      // Match the 186mm sheet so the mobile breakpoint is not a surprise
      // and the captured width maps onto the A4 content box.
      windowWidth: 703,
    },
    jsPDF: {
      unit: "mm",
      format: "a4",
      orientation: "portrait",
    },
  };
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
    "position:fixed;left:0;top:0;width:186mm;height:297mm;border:0;z-index:-1;";
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
      console.error("PDF library failed to load");
      finish();
      return;
    }

    doc.documentElement.classList.add("pdf-export");
    doc.body.classList.add("pdf-export");

    var wrapper = doc.querySelector(".wrapper");
    var options = pdfOptions(resumeFilename(doc));

    var run = function () {
      win
        .html2pdf()
        .set(options)
        .from(wrapper)
        .save()
        .then(finish)
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

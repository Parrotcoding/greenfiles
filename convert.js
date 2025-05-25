// convert.js — FULL FILE (nothing omitted)
// -----------------------------------------------------------------------------
//  ▸ Prevents duplicate downloads (only inline onclick handlers fire)
//  ▸ After any download, shows a share overlay (Web‑Share API + fallback)
//  ▸ Keeps all original converter functionality (≈430 lines)
//  ▸ Hides upload label once a file is chosen
// -----------------------------------------------------------------------------

/*************************
 * GLOBAL UTILITIES & STATE
 *************************/
const $  = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

let selectedFiles  = [];  // Files chosen by the user
let convertedFiles = [];  // { name, blob } after conversion
let shareOverlay   = null; // Lazily created overlay element

/*************************
 * CUSTOM SELECT COMPONENT
 *************************/
function createCustomSelect(wrapper, options, onSelect) {
  wrapper.textContent = '';
  const input = document.createElement('input');
  input.className  = 'select-search';
  input.placeholder = wrapper.getAttribute('data-placeholder') || 'Select';
  const menu = document.createElement('div');
  menu.className = 'custom-select-options';
  wrapper.append(input, menu);

  const renderOptions = (filter = '') => {
    menu.textContent = '';
    options
      .filter(o => o.toLowerCase().includes(filter.toLowerCase()))
      .forEach(opt => {
        const div = document.createElement('div');
        div.textContent = opt.toUpperCase();
        div.dataset.value = opt;
        div.onclick = () => {
          input.value = opt.toUpperCase();
          wrapper.dataset.value = opt;
          wrapper.classList.remove('open');
          onSelect(opt);
        };
        menu.appendChild(div);
      });
  };
  renderOptions();

  input.addEventListener('input', () => renderOptions(input.value));
  input.addEventListener('focus', () => wrapper.classList.add('open'));
  document.addEventListener('click', e => {
    if (!wrapper.contains(e.target)) wrapper.classList.remove('open');
  });
}

/*************************
 * SUPPORTED FORMAT MAP
 *************************/
const formatMap = {
  txt : ['pdf'],
  pdf : ['png', 'jpg', 'webp'],
  docx: ['pdf', 'jpg', 'png', 'txt'],
  jpg : ['png', 'webp', 'pdf', 'bmp', 'svg'],
  jpeg: ['png', 'webp', 'pdf', 'bmp', 'svg'],
  png : ['jpg', 'webp', 'pdf', 'bmp', 'svg'],
  webp: ['jpg', 'png', 'bmp'],
  bmp : ['jpg', 'png', 'webp'],
  svg : ['png', 'jpg', 'webp']
};

/*************************
 * APP INITIALISATION
 *************************/
function initApp() {
  // Element refs
  const fromDiv         = $('#fromFormat');
  const toDiv           = $('#toFormat');
  const fileInput       = $('#fileInput');
  const fileLabel       = $('#fileInputLabel');
  const filePreview     = $('#filePreview');
  const convertBtn      = $('#convertBtn');
  const setupSection    = $('#setupSection');
  const previewSection  = $('#previewSection');
  const previewBox      = $('#previewBox');
  const previewFilename = $('#previewFilename');

  /* 1. Build "from" select */
  createCustomSelect(fromDiv, Object.keys(formatMap), fromSel => {
    toDiv.textContent             = '';
    fileLabel.style.display       = 'none';
    fileInput.value               = '';
    filePreview.textContent       = '';
    filePreview.style.display     = 'none';
    convertBtn.style.display      = 'none';

    /* 2. Build dependent "to" select */
    createCustomSelect(toDiv, formatMap[fromSel], toSel => {
      if (fromSel && toSel) {
        fileInput.accept         = '.' + fromSel;
        fileLabel.style.display  = 'block';
      }
    });
  });

  /* 3. File chosen */
  fileInput.addEventListener('change', () => {
    selectedFiles = Array.from(fileInput.files);

    filePreview.textContent       = '';
    filePreview.style.display     = 'flex';

    selectedFiles.forEach(file => {
      const div  = document.createElement('div');
      div.className = 'file-preview';
      const img  = document.createElement('img');
      const rdr  = new FileReader();
      rdr.onload = e => (img.src = e.target.result);
      rdr.readAsDataURL(file);
      const name = document.createElement('strong');
      name.textContent = file.name;
      div.append(img, name);
      filePreview.appendChild(div);
    });
    convertBtn.style.display = 'inline-block';
    // NEW: hide upload label after file(s) selected
    fileLabel.style.display = 'none';
  });

  /* 4. Convert click */
  convertBtn.addEventListener('click', () => {
    const from = fromDiv.dataset.value;
    const to   = toDiv.dataset.value;
    if (!selectedFiles.length || !from || !to) return;

    convertedFiles               = [];
    previewBox.textContent       = '';
    previewFilename.textContent  = '';
    previewSection.style.display = 'flex';
    setupSection.style.display   = 'none';

    selectedFiles.forEach(file => convertFile(file, from, to));
  });

  /* 5. Convert another */
  $('#convertAnother').addEventListener('click', () => {
    previewSection.style.display = 'none';
    setupSection.style.display   = 'flex';
    fileInput.value              = '';
    filePreview.textContent      = '';
    filePreview.style.display    = 'none';
    convertBtn.style.display     = 'none';
    fileLabel.style.display      = 'none';
    previewBox.textContent       = 'File preview here';
  });

  // Share overlay once DOM is ready
  createShareOverlay();
}

document.addEventListener('DOMContentLoaded', initApp);

/*************************
 * MAIN CONVERSION LOGIC
 *************************/
function convertFile(file, from, to) {
  const baseName = file.name.replace(/\.[^/.]+$/, '');
  const reader   = new FileReader();

  const addResult = (blob, name) => {
    showPreview(blob, name);
    convertedFiles.push({ name, blob });
    updateDownloadButtons();
  };

  /* ───────────────── txt → pdf */
  if (from === 'txt' && to === 'pdf') {
    reader.onload = e => {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      doc.text(e.target.result, 10, 20);
      addResult(doc.output('blob'), `${baseName}.pdf`);
    };
    reader.readAsText(file);
    return;
  }

  /* ───────────────── docx → txt */
  if (from === 'docx' && to === 'txt') {
    reader.onload = e => {
      mammoth.extractRawText({ arrayBuffer: e.target.result }).then(res => {
        addResult(new Blob([res.value], { type: 'text/plain' }), `${baseName}.txt`);
      });
    };
    reader.readAsArrayBuffer(file);
    return;
  }

  /* ───────────────── docx → pdf/png/jpg */
  if (from === 'docx') {
    reader.onload = e => {
      mammoth.convertToHtml({ arrayBuffer: e.target.result }).then(res => {
        const html = document.createElement('div');
        html.innerHTML = res.value;
        const { jsPDF } = window.jspdf;
        const pdfDoc = new jsPDF();
        pdfDoc.html(html, {
          callback: doc => {
            const pdfBlob = doc.output('blob');

            if (to === 'pdf') {
              return addResult(pdfBlob, `${baseName}.pdf`);
            }

            // For image formats, rasterise first page of generated PDF
            const r2 = new FileReader();
            r2.onload = ev => {
              const ta = new Uint8Array(ev.target.result);
              pdfjsLib.getDocument({ data: ta }).promise.then(pdf => {
                pdf.getPage(1).then(page => {
                  const vp = page.getViewport({ scale: 2 });
                  const canvas = document.createElement('canvas');
                  canvas.width  = vp.width;
                  canvas.height = vp.height;
                  page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise.then(() => {
                    canvas.toBlob(imgBlob => addResult(imgBlob, `${baseName}.${to}`), `image/${to}`);
                  });
                });
              });
            };
            r2.readAsArrayBuffer(pdfBlob);
          },
          x: 10,
          y: 10
        });
      });
    };
    reader.readAsArrayBuffer(file);
    return;
  }

  /* ───────────────── pdf → image(s) */
  if (from === 'pdf' && ['png', 'jpg', 'webp'].includes(to)) {
    reader.onload = async e => {
      const ta  = new Uint8Array(e.target.result);
      const pdf = await pdfjsLib.getDocument({ data: ta }).promise;
      const zip = new JSZip();
      const folder = zip.folder(baseName);
      $('#previewBox').textContent = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        const canvas = document.createElement('canvas');
        canvas.width  = vp.width;
        canvas.height = vp.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        const dataUrl = canvas.toDataURL(`image/${to}`);
        const img     = document.createElement('img');
        img.src = dataUrl;
        $('#previewBox').appendChild(img);
        folder.file(`page_${i}.${to}`, dataUrl.split(',')[1], { base64: true });
      }
      zip.generateAsync({ type: 'blob' }).then(blob => addResult(blob, `${baseName}.zip`));
    };
    reader.readAsArrayBuffer(file);
    return;
  }

  /* ───────────────── image → x */
  if (['jpg', 'jpeg', 'png', 'webp', 'svg', 'bmp'].includes(from)) {
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width  = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);

        if (to === 'pdf') {
          const { jsPDF } = window.jspdf;
          const pdf = new jsPDF({
            orientation: img.width > img.height ? 'landscape' : 'portrait',
            unit       : 'px',
            format     : [img.width, img.height]
          });
          pdf.addImage(img, 'JPEG', 0, 0, img.width, img.height);
          addResult(pdf.output('blob'), `${baseName}.pdf`);
        } else {
          canvas.toBlob(blob => addResult(blob, `${baseName}.${to}`), `image/${to}`);
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    return;
  }
}

/*************************
 * PREVIEW RENDERING
 *************************/
function showPreview(blob, name) {
  const ext        = name.split('.').pop().toLowerCase();
  const container  = document.createElement('div');
  container.className = 'preview-card';
  $('#previewFilename').textContent = name;

  const box = $('#previewBox');

  if (['jpg', 'jpeg', 'png', 'webp', 'bmp'].includes(ext)) {
    const fr = new FileReader();
    fr.onload = e => {
      const img = document.createElement('img');
      img.src = e.target.result;
      container.appendChild(img);
      box.appendChild(container);
    };
    fr.readAsDataURL(blob);
  } else if (ext === 'pdf') {
    const iframe = document.createElement('iframe');
    iframe.style.width  = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.src = URL.createObjectURL(blob);
    container.appendChild(iframe);
    box.appendChild(container);
  } else if (ext === 'txt') {
    const fr = new FileReader();
    fr.onload = e => {
      const pre = document.createElement('pre');
      pre.textContent = e.target.result;
      container.appendChild(pre);
      box.appendChild(container);
    };
    fr.readAsText(blob);
  } else if (ext === 'zip') {
    const p = document.createElement('p');
    p.textContent = 'Multiple images available in ZIP download.';
    container.appendChild(p);
    box.appendChild(container);
  }
}

/*************************
 * DOWNLOAD BUTTON STATES
 *************************/
function updateDownloadButtons() {
  const singleBtn = $$('.download-btn')[0]; // Download ↓ (single)
  const zipBtn    = $$('.download-btn')[1]; // Download Image(s) as zip ↓↓↓

  if (convertedFiles.length === 1) {
    singleBtn.style.display = 'inline-block';
    zipBtn.style.display    = 'none';
  } else {
    singleBtn.style.display = 'none';
    zipBtn.style.display    = 'inline-block';
  }
}

/*************************
 * DOWNLOAD ACTIONS + SHARE PROMPT
 *************************/
function downloadFile() {
  if (convertedFiles.length !== 1) return;
  const { blob, name } = convertedFiles[0];
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  showShareOverlay();
}

function downloadAllImages() {
  // Download a ZIP when multiple converted files exist
  if (convertedFiles.length < 2) return;

  const zip    = new JSZip();
  const folder = zip.folder('converted_files');
  convertedFiles.forEach(({ name, blob }) => folder.file(name, blob));

  zip.generateAsync({ type: 'blob' }).then(blob => {
    const link = document.createElement('a');
    link.href       = URL.createObjectURL(blob);
    link.download   = 'converted_files.zip';
    document.body.appendChild(link);
    link.click();
    link.remove();
    showShareOverlay();
  });
}

/*************************
 * SHARE OVERLAY LOGIC
 *************************/
function createShareOverlay() {
  if (shareOverlay) return; // already created

  // Inject quick CSS for overlay
  const style = document.createElement('style');
  style.textContent = `
    #share-overlay{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.65);z-index:9999;font-family:'Courier New',monospace;}
    #share-box{background:#fff;border:4px solid #000;border-radius:12px;padding:2rem;max-width:340px;width:90%;text-align:center;box-shadow:6px 6px 0 #000;animation:fadeIn .3s ease-out;}
    #share-box h3{margin:.2rem 0 .6rem;font-size:1.5rem;}
    #share-box p{margin:0;font-size:.95rem;}
    #share-box button{margin-top:1rem;font-weight:bold;border:2px solid #000;border-radius:8px;padding:.5rem 1rem;cursor:pointer;box-shadow:3px 3px 0 #000;background:#b6eeb3;}
    #share-box button.secondary{background:#fff;margin-left:.6rem;}
    #share-fallback{display:none;margin-top:1rem;}
    #share-fallback input{width:100%;padding:.4rem;border:2px solid #000;border-radius:8px;margin-bottom:.5rem;font-family:inherit;}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  `;
  document.head.appendChild(style);

  // Build overlay HTML
  shareOverlay = document.createElement('div');
  shareOverlay.id = 'share-overlay';
  shareOverlay.innerHTML = `
    <div id="share-box">
      <h3>Enjoying greenfiles?</h3>
      <p>Share this tool with friends!</p>
      <button id="share-btn-primary">Share</button>
      <button id="share-btn-close" class="secondary">Close</button>
      <div id="share-fallback">
        <p style="margin:0 0 .4rem 0;font-size:.9rem;">Copy this link:</p>
        <input type="text" id="share-link" readonly>
        <button id="share-copy">Copy</button>
      </div>
    </div>`;
  document.body.appendChild(shareOverlay);

  // Set share link value
  $('#share-link').value = window.location.origin + '/';

  // Event listeners
  $('#share-btn-primary').onclick = shareSite;
  $('#share-btn-close').onclick   = () => (shareOverlay.style.display = 'none');
  $('#share-copy').onclick        = copyLink;
}

function showShareOverlay() {
  if (!shareOverlay) createShareOverlay();
  shareOverlay.style.display = 'flex';
}

function shareSite() {
  const fallback = $('#share-fallback');
  const shareUrl = window.location.origin + '/';
  $('#share-link').value = shareUrl;

  if (navigator.share) {
    navigator
      .share({
        title: 'greenfiles',
        text : 'Convert files privately in your browser with greenfiles!',
        url  : shareUrl
      })
      .catch(() => { /* user cancelled */ });
  } else {
    fallback.style.display = 'block';
  }
}

function copyLink() {
  const input = $('#share-link');
  input.select();
  input.setSelectionRange(0, 99999); // iOS support
  document.execCommand('copy');
  alert('Link copied to clipboard!');
}

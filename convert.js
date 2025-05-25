// convert.js (Full file, nothing omitted)
// Fixes: 1) Prevent duplicate downloads. 2) After any download, show a share‑overlay that re‑uses the landing page share logic.

/****************************
 *  GLOBAL STATE
 ***************************/
let selectedFiles = [];
let convertedFiles = [];
let shareOverlay; // overlay element reference

/****************************
 *  CUSTOM SELECT WIDGET
 ***************************/
function createCustomSelect(wrapper, options, onSelect) {
  wrapper.innerHTML = '';
  const input = document.createElement('input');
  input.className = 'select-search';
  input.setAttribute('placeholder', wrapper.getAttribute('data-placeholder') || 'Select');
  const menu = document.createElement('div');
  menu.className = 'custom-select-options';
  wrapper.appendChild(input);
  wrapper.appendChild(menu);

  const renderOptions = (filter = '') => {
    menu.innerHTML = '';
    options
      .filter(opt => opt.toLowerCase().includes(filter.toLowerCase()))
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

/****************************
 * FORMAT MAP
 ***************************/
const formatMap = {
  txt: ['pdf'],
  pdf: ['png', 'jpg', 'webp'],
  docx: ['pdf', 'jpg', 'png', 'txt'],
  jpg: ['png', 'webp', 'pdf', 'bmp', 'svg'],
  jpeg: ['png', 'webp', 'pdf', 'bmp', 'svg'],
  png: ['jpg', 'webp', 'pdf', 'bmp', 'svg'],
  webp: ['jpg', 'png', 'bmp'],
  bmp: ['jpg', 'png', 'webp'],
  svg: ['png', 'jpg', 'webp']
};

/****************************
 *  INITIALISATION
 ***************************/
function setup() {
  const fromDiv = document.getElementById('fromFormat');
  const toDiv = document.getElementById('toFormat');
  const fileInput = document.getElementById('fileInput');
  const fileLabel = document.getElementById('fileInputLabel');
  const filePreview = document.getElementById('filePreview');
  const convertBtn = document.getElementById('convertBtn');
  const setupSection = document.getElementById('setupSection');
  const previewSection = document.getElementById('previewSection');
  const previewBox = document.getElementById('previewBox');
  const previewFilename = document.getElementById('previewFilename');
  const downloadBtn = document.querySelector('.download-btn[onclick="downloadFile()"]');
  const zipBtn = document.querySelector('.download-btn[onclick="downloadAllImages()"]');

  // Create share overlay once DOM is ready
  createShareOverlay();

  createCustomSelect(fromDiv, Object.keys(formatMap), fromSelected => {
    toDiv.innerHTML = '';
    fileLabel.style.display = 'none';
    fileInput.value = '';
    filePreview.innerHTML = '';
    convertBtn.style.display = 'none';

    createCustomSelect(toDiv, formatMap[fromSelected], toSelected => {
      if (fromSelected && toSelected) {
        fileInput.setAttribute('accept', '.' + fromSelected);
        fileLabel.style.display = 'block';
      }
    });
  });

  /* File selection */
  fileInput.addEventListener('change', () => {
    selectedFiles = Array.from(fileInput.files);
    filePreview.innerHTML = '';
    selectedFiles.forEach(file => {
      const div = document.createElement('div');
      div.className = 'file-preview';
      const img = document.createElement('img');
      const reader = new FileReader();
      reader.onload = e => {
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
      const name = document.createElement('strong');
      name.textContent = file.name;
      div.appendChild(img);
      div.appendChild(name);
      filePreview.appendChild(div);
    });
    convertBtn.style.display = 'inline-block';
  });

  /* Conversion */
  convertBtn.addEventListener('click', () => {
    const from = fromDiv.dataset.value;
    const to = toDiv.dataset.value;
    if (!selectedFiles.length || !from || !to) return;
    convertedFiles = [];
    previewBox.innerHTML = '';
    previewFilename.textContent = '';
    previewSection.style.display = 'flex';
    setupSection.style.display = 'none';
    selectedFiles.forEach(file => convertFile(file, from, to));
  });

  /* Reset */
  document.getElementById('convertAnother').addEventListener('click', () => {
    previewSection.style.display = 'none';
    setupSection.style.display = 'flex';
    fileInput.value = '';
    filePreview.innerHTML = '';
    convertBtn.style.display = 'none';
    fileLabel.style.display = 'none';
    previewBox.innerHTML = 'File preview here';
  });

  /* IMPORTANT: prevent double callbacks – rely on inline onclick only */
  // downloadBtn.addEventListener('click', downloadFile);
  // zipBtn.addEventListener('click', downloadAllImages);
}

document.addEventListener('DOMContentLoaded', setup);

/****************************
 *  CONVERT FILES
 ***************************/
function convertFile(file, from, to) {
  const fileName = file.name.replace(/\.[^/.]+$/, '');
  const reader = new FileReader();

  const handleBlob = (blob, name) => {
    preview(blob, name);
    convertedFiles.push({ name, blob });
    updateDownloadButtons();
  };

  if (from === 'txt' && to === 'pdf') {
    reader.onload = e => {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      doc.text(e.target.result, 10, 20);
      handleBlob(doc.output('blob'), `${fileName}.pdf`);
    };
    reader.readAsText(file);
  } else if (from === 'docx' && to === 'txt') {
    reader.onload = e => {
      mammoth.extractRawText({ arrayBuffer: e.target.result }).then(result =>
        handleBlob(new Blob([result.value], { type: 'text/plain' }), `${fileName}.txt`)
      );
    };
    reader.readAsArrayBuffer(file);
  } else if (from === 'docx') {
    reader.onload = e => {
      mammoth.convertToHtml({ arrayBuffer: e.target.result }).then(result => {
        const html = document.createElement('div');
        html.innerHTML = result.value;
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        doc.html(html, {
          callback: doc => {
            const blob = doc.output('blob');
            if (to === 'pdf') {
              handleBlob(blob, `${fileName}.pdf`);
            } else {
              const reader2 = new FileReader();
              reader2.onload = e2 => {
                const typedarray = new Uint8Array(e2.target.result);
                pdfjsLib.getDocument({ data: typedarray }).promise.then(pdf => {
                  pdf.getPage(1).then(page => {
                    const viewport = page.getViewport({ scale: 2 });
                    const canvas = document.createElement('canvas');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    page
                      .render({ canvasContext: canvas.getContext('2d'), viewport })
                      .promise.then(() => {
                        canvas.toBlob(blob => handleBlob(blob, `${fileName}.${to}`), `image/${to}`);
                      });
                  });
                });
              };
              reader2.readAsArrayBuffer(blob);
            }
          },
          x: 10,
          y: 10
        });
      });
    };
    reader.readAsArrayBuffer(file);
  } else if (from === 'pdf' && ['png', 'jpg', 'webp'].includes(to)) {
    reader.onload = async e => {
      const typedarray = new Uint8Array(e.target.result);
      const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
      const zip = new JSZip();
      const folder = zip.folder(fileName);
      const previewBox = document.getElementById('previewBox');
      previewBox.innerHTML = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;
        const dataUrl = canvas.toDataURL(`image/${to}`);
        const img = document.createElement('img');
        img.src = dataUrl;
        previewBox.appendChild(img);
        folder.file(`page_${i}.${to}`, dataUrl.split(',')[1], { base64: true });
      }
      zip.generateAsync({ type: 'blob' }).then(blob => handleBlob(blob, `${fileName}.zip`));
    };
    reader.readAsArrayBuffer(file);
  } else if (['jpg', 'jpeg', 'png', 'webp', 'svg', 'bmp'].includes(from)) {
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        if (to === 'pdf') {
          const { jsPDF } = window.jspdf;
          const pdf = new jsPDF({
            orientation: img.width > img.height ? 'landscape' : 'portrait',
            unit: 'px',
            format: [img.width, img.height]
          });
          pdf.addImage(img, 'JPEG', 0, 0, img.width, img.height);
          handleBlob(pdf.output('blob'), `${fileName}.pdf`);
        } else {
          canvas.toBlob(blob => handleBlob(blob, `${fileName}.${to}`), `image/${to}`);
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
}

/****************************
 *  PREVIEW UTILS
 ***************************/
function preview(blob, name) {
  const ext = name.split('.').pop().toLowerCase();
  const previewBox = document.getElementById('previewBox');
  const container = document.createElement('div');
  container.className = 'preview-card';
  document.getElementById('previewFilename').textContent = name;

  if (['jpg', 'jpeg', 'png', 'webp', 'bmp'].includes(ext)) {
    const reader = new FileReader();
    reader.onload = e => {
      const img = document.createElement('img');
      img.src = e.target.result;
      container.appendChild(img);
      previewBox.appendChild(container);
    };
    reader.readAsDataURL(blob);
  } else if (ext === 'pdf') {
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    container.appendChild(iframe);
    previewBox.appendChild(container);
  } else if (ext === 'txt') {
    const reader = new FileReader();
    reader.onload = e => {
      const pre = document.createElement('pre');
      pre.textContent = e.target.result;
      container.appendChild(pre);
      previewBox.appendChild(container);
    };
    reader.readAsText(blob);
  } else if (ext === 'zip') {
    const notice = document.createElement('p');
    notice.textContent = 'Multiple images available in ZIP download.';
    container.appendChild(notice);
    previewBox.appendChild(container);
  }
}

/****************************
 *  DOWNLOAD BUTTON STATE
 ***************************/
function updateDownloadButtons() {
  const downloadBtn = document.querySelector('.download-btn[onclick="downloadFile()"]');
  const zipBtn = document.querySelector('.download-btn[onclick="downloadAllImages()"]');
  if (convertedFiles.length === 1) {
    downloadBtn.style.display = 'inline-block';
    zipBtn.style.display = 'none';
  } else {
    downloadBtn.style.display = 'none';
    zipBtn.style.display = 'inline-block';
  }
}

/****************************
 *  DOWNLOAD ACTIONS + SHARE PROMPT
 ***************************/
function downloadFile() {
  if (convertedFiles.length === 1) {
    const { blob, name } = convertedFiles[0];
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showShareOverlay();
  }
}

function downloadAllImages() {
  if (convertedFiles.length > 1) {
    const zip = new JSZip();
    const folder = zip.folder('converted_files');
    convertedFiles.forEach(({ name, blob }) => folder.file(name, blob));
    zip.generateAsync({ type: 'blob' }).then(blob => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'converted_files.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showShareOverlay();
    });
  }
}

/****************************
 * SHARE OVERLAY & LOGIC
 ***************************/
function createShareOverlay() {
  // Inject minimal CSS (kept inline to avoid extra files)
  const style = document.createElement('style');
  style.textContent = `
    #share-overlay{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);z-index:2000;font-family:'Courier New',monospace;}
    #share-box{background:#fff;border:4px solid #000;border-radius:12px;padding:2rem;box-shadow:6px 6px 0 #000;max-width:320px;width:90%;text-align:center;}
    #share-box h3{margin-top:0;font-size:1.4rem;}
    #share-box button{margin-top:1rem;font-weight:bold;border:2px solid #000;border-radius:8px;padding:0.5rem 1rem;cursor:pointer;background:#b6eeb3;box-shadow:3px 3px 0 #000;}
    #share-fallback-conv{margin-top:1rem;display:none;}
    #share-fallback-conv input{width:100%;padding:0.4rem;font-family:inherit;border:2px solid #000;border-radius:8px;margin-bottom:0.5rem;}
  `;
  document.head.appendChild(style);

  // Overlay structure
  shareOverlay = document.createElement('div');
  shareOverlay.id = 'share-overlay';
  shareOverlay.innerHTML = `
    <div id="share-box">
      <h3>Enjoying greenfiles?</h3>
      <p>Share this converter with friends!</p>
      <button id="conv-share-btn">Share</button>
      <button id="conv-close-btn" style="background:white;margin-left:0.5rem;">Close</button>
      <div id="share-fallback-conv">
        <p style="margin:0 0 0.5rem 0;font-size:0.9rem;">Copy this link:</p>
        <input type="text" id="conv-share-link" readonly>
        <button id="conv-copy-btn">Copy</button>
      </div>
    </div>
  `;
  document.body.appendChild(shareOverlay);

  // Populate link field
  document.getElementById('conv-share-link').value = window.location.origin + '/';

  // Event listeners
  document.getElementById('conv-share-btn').onclick = shareSite;
  document.getElementById('conv-close-btn').onclick = () => (shareOverlay.style.display = 'none');
  document.getElementById('conv-copy-btn').onclick = copyLink;
}

function showShareOverlay() {
  shareOverlay.style.display = 'flex';
}

function shareSite() {
  const fallback = document.getElementById('share-fallback-conv');
  const shareUrl = window.location.origin + '/';
  document.getElementById('conv-share-link').value = shareUrl;

  if (navigator.share) {
    navigator
      .share({
        title: 'greenfiles',
        text: 'Convert files privately in your browser with greenfiles!',
        url: shareUrl
      })
      .catch(err => console.log('Share cancelled:', err));
  } else {
    fallback.style.display = 'block';
  }
}

function copyLink() {
  const input = document.getElementById('conv-share-link');
  input.select();
  input.setSelectionRange(0, 99999);
  document.execCommand('copy');
  alert('Link copied to clipboard!');
}

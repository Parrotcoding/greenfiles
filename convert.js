// BEGIN: Full convert.js with all features
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
    options.filter(opt => opt.toLowerCase().includes(filter.toLowerCase())).forEach(opt => {
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

let selectedFiles = [];

document.addEventListener('DOMContentLoaded', () => {
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

  fileInput.addEventListener('change', () => {
    selectedFiles = Array.from(fileInput.files);
    filePreview.innerHTML = '';
    selectedFiles.forEach(file => {
      const div = document.createElement('div');
      div.className = 'file-preview';
      const img = document.createElement('img');
      const reader = new FileReader();
      reader.onload = e => { img.src = e.target.result; };
      reader.readAsDataURL(file);
      const name = document.createElement('strong');
      name.textContent = file.name;
      div.appendChild(img);
      div.appendChild(name);
      filePreview.appendChild(div);
    });
    convertBtn.style.display = 'inline-block';
  });

  convertBtn.addEventListener('click', () => {
    const from = fromDiv.dataset.value;
    const to = toDiv.dataset.value;
    if (!selectedFiles.length || !from || !to) return alert('Missing info');
    previewBox.innerHTML = '';
    previewFilename.textContent = '';
    previewSection.style.display = 'flex';
    setupSection.style.display = 'none';
    selectedFiles.forEach(file => convertFile(file, from, to));
  });

  document.getElementById('convertAnother').addEventListener('click', () => {
    previewSection.style.display = 'none';
    setupSection.style.display = 'flex';
    fileInput.value = '';
    filePreview.innerHTML = '';
    convertBtn.style.display = 'none';
    fileLabel.style.display = 'none';
    previewBox.innerHTML = 'File preview here';
  });
});

function convertFile(file, from, to) {
  const fileName = file.name.replace(/\.[^/.]+$/, '');
  const reader = new FileReader();

  if (from === 'txt' && to === 'pdf') {
    reader.onload = e => {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      doc.text(e.target.result, 10, 20);
      const blob = doc.output('blob');
      preview(blob, `${fileName}.pdf`);
    };
    reader.readAsText(file);

  } else if (from === 'docx' && to === 'txt') {
    reader.onload = e => {
      mammoth.extractRawText({ arrayBuffer: e.target.result }).then(result => {
        const blob = new Blob([result.value], { type: 'text/plain' });
        preview(blob, `${fileName}.txt`);
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
        const viewport = page.getViewport({ scale: 2 });
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
      zip.generateAsync({ type: 'blob' }).then(blob => preview(blob, `${fileName}.zip`));
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
          const pdf = new jsPDF({ orientation: img.width > img.height ? 'landscape' : 'portrait', unit: 'px', format: [img.width, img.height] });
          pdf.addImage(img, 'JPEG', 0, 0, img.width, img.height);
          const blob = pdf.output('blob');
          preview(blob, `${fileName}.pdf`);
        } else {
          canvas.toBlob(blob => {
            preview(blob, `${fileName}.${to}`);
          }, `image/${to}`);
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
}

function preview(blob, name) {
  const ext = name.split('.').pop().toLowerCase();
  const previewBox = document.getElementById('previewBox');
  const container = document.createElement('div');
  container.className = 'preview-card';
  const label = document.createElement('div');
  label.className = 'preview-filename';
  label.textContent = name;

  if (['jpg', 'jpeg', 'png', 'webp', 'bmp'].includes(ext)) {
    const reader = new FileReader();
    reader.onload = e => {
      const img = document.createElement('img');
      img.src = e.target.result;
      container.appendChild(label);
      container.appendChild(img);
      previewBox.appendChild(container);
    };
    reader.readAsDataURL(blob);
  } else if (ext === 'pdf') {
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.style.width = '100%';
    iframe.style.height = '800px';
    iframe.style.border = 'none';
    container.appendChild(label);
    container.appendChild(iframe);
    previewBox.appendChild(container);
  } else if (ext === 'txt') {
    const reader = new FileReader();
    reader.onload = e => {
      const pre = document.createElement('pre');
      pre.textContent = e.target.result;
      container.appendChild(label);
      container.appendChild(pre);
      previewBox.appendChild(container);
    };
    reader.readAsText(blob);
  } else if (ext === 'zip') {
    const zipNotice = document.createElement('p');
    zipNotice.textContent = 'Multiple images available in ZIP download.';
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'download-btn';
    downloadBtn.textContent = 'Download ZIP';
    downloadBtn.onclick = () => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = name;
      link.click();
    };
    container.appendChild(label);
    container.appendChild(zipNotice);
    container.appendChild(downloadBtn);
    previewBox.appendChild(container);
  }
}

function downloadFile() {
  alert('Direct single file download is auto-triggered on preview. Use ZIP if multiple.');
}

function downloadAllImages() {
  alert('For multi-page documents, images are included in the ZIP file.');
}

// convert.js (Full file, nothing omitted)

let selectedFiles = [];
let convertedFiles = [];

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
    if (!selectedFiles.length || !from || !to) return;
    convertedFiles = [];
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

  downloadBtn.addEventListener('click', downloadFile);
  zipBtn.addEventListener('click', downloadAllImages);
}

document.addEventListener('DOMContentLoaded', setup);

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
      mammoth.extractRawText({ arrayBuffer: e.target.result })
        .then(result => handleBlob(new Blob([result.value], { type: 'text/plain' }), `${fileName}.txt`));
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
          const pdf = new jsPDF({ orientation: img.width > img.height ? 'landscape' : 'portrait', unit: 'px', format: [img.width, img.height] });
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

function downloadFile() {
  if (convertedFiles.length === 1) {
    const { blob, name } = convertedFiles[0];
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
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
      link.click();
    });
  }
}

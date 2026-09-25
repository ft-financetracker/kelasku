export async function fileToDataUrl(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('File gagal dibaca.'));
    reader.readAsDataURL(file);
  });
}

export async function compressImageFile(file, options = {}) {
  if (!file || !String(file.type || '').startsWith('image/')) throw new Error('Pilih file gambar.');
  const maxEdge = Number(options.maxEdge || 1280);
  const targetBytes = Number(options.targetBytes || 420000);
  const minQuality = Number(options.minQuality || 0.48);
  const img = await loadImage(file);
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const width = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
  const height = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.drawImage(img, 0, 0, width, height);

  let quality = 0.82;
  let blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  while (blob.size > targetBytes && quality > minQuality) {
    quality = Math.max(minQuality, quality - 0.08);
    blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  }
  if (blob.size > 520000) throw new Error('Gambar masih terlalu besar setelah kompresi.');
  const dataUrl = await fileToDataUrl(blob);
  return { dataUrl, blob, width, height, mime: 'image/jpeg', name: normalizeImageName(file.name) };
}

export async function blobToDataUrl(blob) {
  return fileToDataUrl(blob);
}

export function formatBytes(bytes = 0) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 102.4) / 10} KB`;
  return `${Math.round(n / 1024 / 102.4) / 10} MB`;
}

function normalizeImageName(name = '') {
  const base = String(name || 'image').replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60) || 'image';
  return `${base}.jpg`;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gambar tidak dapat dibaca.')); };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Gambar gagal dikompresi.')), type, quality);
  });
}

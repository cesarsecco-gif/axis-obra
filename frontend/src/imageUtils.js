// Redução de fotos no navegador antes do envio.
//
// Padrão de impressão: lado maior com até 2048 px, JPEG 85%.
// - Relatório fotográfico A4 com foto de página inteira (~19 cm de largura): ~270 dpi.
// - Relatório com 4 a 6 fotos por página (~9 cm de largura): acima de 300 dpi (qualidade de gráfica).
// - Na tela do aplicativo: mais nítido que um monitor Full HD.
// Uma foto de celular de 4 a 8 MB passa a ter cerca de 0,5 a 1 MB.

export const PHOTO_MAX_SIDE = 2048;
export const PHOTO_QUALITY = 0.85;

// Fotos pequenas e leves são mantidas como estão (nada a ganhar)
const KEEP_ORIGINAL_BELOW_BYTES = 1.5 * 1024 * 1024;
const COMPRESSIBLE = /^image\/(jpeg|png|webp|heic|heif)$/i;

async function decodeImage(file) {
  // createImageBitmap respeita a orientação do celular (EXIF) ao girar a foto
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* cai para o método com <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', quality));
}

/**
 * Reduz a foto para o padrão de impressão. Devolve um File JPEG,
 * ou o arquivo original quando não há ganho (ou o formato não é foto, ex.: SVG).
 */
export async function compressPhoto(file, { maxSide = PHOTO_MAX_SIDE, quality = PHOTO_QUALITY } = {}) {
  if (!file || !COMPRESSIBLE.test(file.type || '')) return file;
  let image;
  try {
    image = await decodeImage(file);
  } catch {
    return file; // formato que o navegador não abre (ex.: HEIC em alguns aparelhos): envia como está
  }
  const width = image.width;
  const height = image.height;
  const longest = Math.max(width, height);
  if (longest <= maxSide && file.size <= KEEP_ORIGINAL_BELOW_BYTES) {
    if (image.close) image.close();
    return file;
  }

  const scale = Math.min(1, maxSide / longest);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; // fundo branco para PNG com transparência
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  if (image.close) image.close();

  const blob = await canvasToBlob(canvas, quality);
  if (!blob || (blob.size >= file.size && longest <= maxSide)) return file;
  const baseName = (file.name || 'foto').replace(/\.[^.]+$/, '');
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified || Date.now() });
}

/** Mesma redução, devolvendo data URL (para envios em base64). */
export async function compressPhotoToDataURL(file, options) {
  const result = await compressPhoto(file, options);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(result);
  });
}

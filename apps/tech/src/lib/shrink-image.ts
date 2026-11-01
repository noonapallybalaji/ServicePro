/**
 * Phone camera photos are often 4–10 MB. Before uploading, scale a photo down to at most `maxSide`
 * pixels on its long side and re-encode it as JPEG: plenty for reading an ID card, and quick on a
 * slow connection. PDFs, small images and anything the browser can't decode go up unchanged.
 */
export async function shrinkImage(file: File, maxSide = 1600): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < 400_000 || typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

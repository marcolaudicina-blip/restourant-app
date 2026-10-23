/**
 * Shrinks a picture in the browser before upload: phone photos are often 5-10 MB, the booking page
 * needs a few hundred KB. Returns a data URL (WebP, or JPEG/PNG where WebP can't be encoded).
 */
export async function resizeImage(
  file: File,
  { maxSize, keepTransparency = false }: { maxSize: number; keepTransparency?: boolean },
): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Il file scelto non è un'immagine");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => {
    throw new Error("Impossibile leggere l'immagine: prova con un JPG o un PNG");
  });
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Il browser non permette di elaborare l'immagine");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const webp = canvas.toDataURL("image/webp", 0.85);
  if (webp.startsWith("data:image/webp")) return webp;
  return keepTransparency ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.85);
}

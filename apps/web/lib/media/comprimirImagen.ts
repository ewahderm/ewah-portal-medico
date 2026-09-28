// Compresión "conservadora" antes de subir: reduce el lado largo a un
// máximo razonable y recodifica a JPEG calidad 85%. Fotos de celular sin
// tocar suelen pesar 3-8 MB; esto las deja típicamente en 0.8-1.5 MB sin
// pérdida visible, incluso haciendo zoom a detalle de piel — relevante
// porque son fotos clínicas de antes/después con valor diagnóstico.
//
// Corre en el navegador (canvas), nunca en el servidor: así el ahorro
// también aplica a los datos móviles de quien sube la foto desde el
// consultorio, no solo al almacenamiento.
const MAX_LADO_LARGO = 2000;
const CALIDAD_JPEG = 0.85;

export async function comprimirImagen(archivo: File): Promise<File> {
  if (!archivo.type.startsWith("image/")) return archivo;

  let bitmap: ImageBitmap;
  try {
    // imageOrientation: "from-image" es imprescindible — sin esto, una
    // foto tomada en vertical con el celular (que trae la orientación en
    // el EXIF, no en los píxeles) se dibuja de lado en el canvas aunque
    // se vea derecha en cualquier visor normal.
    bitmap = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  } catch {
    // Navegador sin soporte o archivo corrupto: se sube tal cual: el
    // límite de tamaño del servidor sigue protegiendo, esto es una
    // optimización, no un requisito.
    return archivo;
  }

  const escala = Math.min(1, MAX_LADO_LARGO / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.round(bitmap.width * escala);
  const alto = Math.round(bitmap.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return archivo;
  }
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", CALIDAD_JPEG),
  );
  if (!blob) return archivo;

  // Salvaguarda: una imagen ya pequeña o muy comprimida puede pesar más
  // al recodificarse (por el nuevo encabezado JPEG) — en ese caso raro,
  // se sube el original.
  if (blob.size >= archivo.size) return archivo;

  const nombre = archivo.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], nombre, { type: "image/jpeg" });
}

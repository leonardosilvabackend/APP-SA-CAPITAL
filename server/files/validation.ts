export class FileValidationError extends Error { readonly status = 400; }
export function validateFile(buffer: Buffer, mime: string, maximum: number) {
  if (!buffer.length || buffer.length > maximum) throw new FileValidationError("Arquivo vazio ou acima do tamanho permitido.");
  const starts = (bytes: number[]) => buffer.subarray(0, bytes.length).equals(Buffer.from(bytes));
  const valid = mime === "application/pdf" ? buffer.subarray(0, 5).toString() === "%PDF-"
    : mime === "image/png" ? starts([137, 80, 78, 71, 13, 10, 26, 10])
    : mime === "image/jpeg" ? starts([255, 216, 255])
    : mime === "image/webp" ? buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP"
    : ["application/msword", "application/vnd.ms-excel"].includes(mime) ? starts([208, 207, 17, 224, 161, 177, 26, 225])
    : ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"].includes(mime) ? starts([80, 75, 3, 4])
    : false;
  if (!valid) throw new FileValidationError("O conteúdo do arquivo não corresponde ao formato informado.");
}

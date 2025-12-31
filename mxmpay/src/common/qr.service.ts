import * as QRCode from 'qrcode';

export class QrService {
  async generateDataUrl(text: string, size = 256): Promise<string> {
    return await QRCode.toDataURL(text, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
    });
  }
}


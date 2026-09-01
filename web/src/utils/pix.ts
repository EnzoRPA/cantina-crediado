// Shared BR Code / EMV Pix Generator Utility

function calculateCRC16(payload: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    const code = payload.charCodeAt(i);
    crc ^= (code << 8);
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) !== 0 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

export function generateStaticPix(
  key: string = '57fbef81-90eb-4097-9c40-93cdd4320ae4',
  amount: number = 0,
  merchantName: string = 'POLLYANNA AVELINO VERZARO',
  merchantCity: string = 'IMPERATRIZ'
): string {
  // Clean key (leave digits or raw key)
  const cleanKey = key.trim();
  const f = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;
  const gui = f('00', 'br.gov.bcb.pix');
  const pixKeyField = f('01', cleanKey);
  const merchantAccountInfo = f('26', gui + pixKeyField);
  let payload = '000201' + merchantAccountInfo;
  payload += '52040000';
  payload += '5303986';
  if (amount > 0) payload += f('54', amount.toFixed(2));
  payload += '5802BR';
  payload += f('59', merchantName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().slice(0, 25));
  payload += f('60', merchantCity.toUpperCase().slice(0, 15));
  payload += f('62', f('05', '***'));
  payload += '6304';
  return payload + calculateCRC16(payload);
}

export const DEFAULT_PIX_KEY = '57fbef81-90eb-4097-9c40-93cdd4320ae4';
export const DEFAULT_PIX_CNPJ_FORMATTED = '57fbef81-90eb-4097-9c40-93cdd4320ae4';
export const DEFAULT_MERCHANT_NAME = 'POLLYANNA AVELINO VERZARO';
export const DEFAULT_MERCHANT_CITY = 'IMPERATRIZ';
export const DEFAULT_BANK_NAME = 'Banco Inter';

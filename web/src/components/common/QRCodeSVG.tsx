import React, { useMemo } from 'react';

/**
 * Pure TypeScript QR Code Generator (Reed-Solomon & QR Matrix Generator)
 * Supports Byte mode (8-bit) encoding for strings like "STUDENT:id" or enrollment numbers.
 */

// GF(256) Log and Exp tables for Reed-Solomon polynomial math
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 256) x ^= 285;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF_EXP[GF_LOG[x] + GF_LOG[y]];
}

function rsGenPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const nextPoly = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      nextPoly[j] ^= gfMul(poly[j], GF_EXP[i]);
      nextPoly[j + 1] ^= poly[j];
    }
    poly = nextPoly;
  }
  return poly;
}

function rsEncode(data: Uint8Array, ecLen: number): Uint8Array {
  const gen = rsGenPoly(ecLen);
  const res = new Uint8Array(ecLen);
  for (let i = 0; i < data.length; i++) {
    const coef = data[i] ^ res[0];
    for (let j = 0; j < ecLen - 1; j++) {
      res[j] = res[j + 1] ^ gfMul(gen[j], coef);
    }
    res[ecLen - 1] = gfMul(gen[ecLen - 1], coef);
  }
  return res;
}

// Minimal QR Spec for Version 1 to 4 (Medium EC)
interface QRVersionSpec {
  ver: number;
  size: number;
  totalCap: number;
  dataCap: number;
  ecCap: number;
  alignPos: number[];
}

const QR_SPECS: QRVersionSpec[] = [
  { ver: 1, size: 21, totalCap: 26, dataCap: 16, ecCap: 10, alignPos: [] },
  { ver: 2, size: 25, totalCap: 44, dataCap: 28, ecCap: 16, alignPos: [6, 18] },
  { ver: 3, size: 29, totalCap: 70, dataCap: 44, ecCap: 26, alignPos: [6, 22] },
  { ver: 4, size: 33, totalCap: 100, dataCap: 64, ecCap: 36, alignPos: [6, 26] },
];

function generateQRMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  
  // Pick version
  let spec = QR_SPECS[0];
  for (const s of QR_SPECS) {
    if (bytes.length + 3 <= s.dataCap) {
      spec = s;
      break;
    }
  }

  const { size, dataCap, ecCap, alignPos } = spec;

  // Build bit buffer (Byte mode 0100 + 8-bit length + data)
  const bitBuf: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bitBuf.push((val >> i) & 1);
    }
  };

  pushBits(0b0100, 4); // Byte mode indicator
  pushBits(bytes.length, 8); // Character count indicator
  for (const b of bytes) {
    pushBits(b, 8);
  }

  // Terminator & Padding
  const padCapBits = dataCap * 8;
  if (bitBuf.length + 4 <= padCapBits) pushBits(0, 4);
  else while (bitBuf.length < padCapBits) bitBuf.push(0);

  while (bitBuf.length % 8 !== 0) bitBuf.push(0);

  const dataBytes = new Uint8Array(dataCap);
  for (let i = 0; i < dataCap; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      const idx = i * 8 + j;
      if (idx < bitBuf.length) b = (b << 1) | bitBuf[idx];
      else b <<= 1;
    }
    dataBytes[i] = b;
  }

  // Pad bytes (0xEC, 0x11)
  const padBytes = [0xec, 0x11];
  let pIdx = 0;
  for (let i = Math.floor(bitBuf.length / 8); i < dataCap; i++) {
    dataBytes[i] = padBytes[pIdx % 2];
    pIdx++;
  }

  // Calculate EC Bytes
  const ecBytes = rsEncode(dataBytes, ecCap);

  // Final codeword sequence
  const finalCodewords = new Uint8Array(dataCap + ecCap);
  finalCodewords.set(dataBytes, 0);
  finalCodewords.set(ecBytes, dataCap);

  // Convert codewords to final bits array
  const finalBits: number[] = [];
  for (const b of finalCodewords) {
    for (let i = 7; i >= 0; i--) {
      finalBits.push((b >> i) & 1);
    }
  }

  // Create Matrix (null = empty/unfilled, true = black, false = white)
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () =>
    Array(size).fill(null)
  );

  // Helper to draw Finder Pattern (7x7)
  const drawFinder = (r: number, c: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        if (
          (dr >= 0 && dr <= 6 && (dc === 0 || dc === 6)) ||
          (dc >= 0 && dc <= 6 && (dr === 0 || dr === 6)) ||
          (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4)
        ) {
          matrix[nr][nc] = true;
        } else {
          matrix[nr][nc] = false;
        }
      }
    }
  };

  // Draw 3 Position Detection Patterns
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Alignment Pattern
  if (alignPos.length >= 2) {
    for (const r of alignPos) {
      for (const c of alignPos) {
        if (matrix[r][c] !== null) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isBorder = Math.abs(dr) === 2 || Math.abs(dc) === 2;
            const isCenter = dr === 0 && dc === 0;
            matrix[r + dr][c + dc] = isBorder || isCenter;
          }
        }
      }
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (matrix[6][i] === null) matrix[6][i] = i % 2 === 0;
    if (matrix[i][6] === null) matrix[i][6] = i % 2 === 0;
  }

  // Reserve Format Info Area (will fill later)
  for (let i = 0; i < 9; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[i][8] = false;
    if (matrix[8][size - 1 - i] === null) matrix[8][size - 1 - i] = false;
    if (matrix[size - 1 - i][8] === null) matrix[size - 1 - i][8] = false;
  }

  // Dark module
  matrix[size - 8][8] = true;

  // Fill Data Bits (Zigzag traversal)
  let bitIdx = 0;
  let dir = -1; // up
  for (let c = size - 1; c > 0; c -= 2) {
    if (c === 6) c--; // Skip vertical timing column
    const rRange = dir === -1
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (let r of rRange) {
      for (let col of [c, c - 1]) {
        if (matrix[r][col] === null) {
          const bit = bitIdx < finalBits.length ? finalBits[bitIdx++] : 0;
          // Default Mask 0: (row + col) % 2 === 0
          const mask = (r + col) % 2 === 0;
          matrix[r][col] = (bit ^ (mask ? 1 : 0)) === 1;
        }
      }
    }
    dir = -dir;
  }

  // Format Info for EC Level M (00) & Mask 000 -> 0x5412 (with BCH)
  const formatInfoBits = [
    1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0
  ];

  // Write format info around top-left, top-right, bottom-left
  let fIdx = 0;
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) matrix[8][i] = formatInfoBits[fIdx++] === 1;
  }
  for (let i = 7; i >= 0; i--) {
    if (i !== 6) matrix[i][8] = formatInfoBits[fIdx++] === 1;
  }

  fIdx = 0;
  for (let i = size - 1; i >= size - 8; i--) {
    matrix[8][i] = formatInfoBits[fIdx++] === 1;
  }
  for (let i = size - 7; i < size; i++) {
    matrix[i][8] = formatInfoBits[fIdx++] === 1;
  }

  // Cast nulls to false
  return matrix.map((row) => row.map((cell) => cell === true));
}

interface QRCodeSVGProps {
  value: string;
  size?: number;
  color?: string;
  bgColor?: string;
  className?: string;
}

export const QRCodeSVG: React.FC<QRCodeSVGProps> = ({
  value,
  size = 120,
  color = '#000000',
  bgColor = '#ffffff',
  className = '',
}) => {
  const matrix = useMemo(() => {
    try {
      return generateQRMatrix(value);
    } catch (e) {
      console.error('Error generating QR Code matrix:', e);
      return [];
    }
  }, [value]);

  if (!matrix || matrix.length === 0) {
    return <div style={{ width: size, height: size, background: bgColor }} />;
  }

  const numCells = matrix.length;
  const cellSize = 1;

  return (
    <svg
      viewBox={`0 0 ${numCells} ${numCells}`}
      width={size}
      height={size}
      className={className}
      style={{ display: 'block', background: bgColor, borderRadius: '4px' }}
    >
      <rect width={numCells} height={numCells} fill={bgColor} />
      {matrix.map((row, r) =>
        row.map((isBlack, c) =>
          isBlack ? (
            <rect
              key={`${r}-${c}`}
              x={c * cellSize}
              y={r * cellSize}
              width={cellSize}
              height={cellSize}
              fill={color}
            />
          ) : null
        )
      )}
    </svg>
  );
};

export default QRCodeSVG;

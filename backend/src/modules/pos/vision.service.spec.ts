import { describe, it, expect } from 'vitest';
import {
  normalizeText,
  levenshteinDistance,
  calculateSimilarity,
} from './vision.service';

describe('VisionService - Algoritmo de Caligrafia e Similaridade', () => {
  it('deve normalizar texto removendo acentos, pontuação e espaços extras', () => {
    expect(normalizeText('Milena 6º Ano - A!')).toBe('milena 6 ano a');
    expect(normalizeText('  ENZO   VIÉIRA   ')).toBe('enzo vieira');
    expect(normalizeText('João Victor 5°B')).toBe('joao victor 5b');
  });

  it('deve calcular distância de Levenshtein corretamente', () => {
    expect(levenshteinDistance('milena', 'milena')).toBe(0);
    expect(levenshteinDistance('milena', 'mylena')).toBe(1);
    expect(levenshteinDistance('ana', 'anna')).toBe(1);
    expect(levenshteinDistance('pedro', 'pedrinho')).toBe(3);
  });

  it('deve atribuir similaridade alta para pequenas variações de OCR e abreviações', () => {
    // Mesma palavra
    expect(calculateSimilarity('Milena', 'Milena')).toBe(1);

    // Variação de grafia comum (Y vs I)
    const simY = calculateSimilarity('Mylena', 'Milena');
    expect(simY).toBeGreaterThanOrEqual(0.80);

    // Abreviação ou inclusão parcial (ex: nome na lista vs nome completo)
    const simInclusao = calculateSimilarity('Milena Silva', 'Milena Silva dos Santos');
    expect(simInclusao).toBeGreaterThanOrEqual(0.75);

    // Nomes totalmente diferentes
    const simDiferente = calculateSimilarity('Carlos Eduardo', 'Milena Silva');
    expect(simDiferente).toBeLessThan(0.40);
  });
});

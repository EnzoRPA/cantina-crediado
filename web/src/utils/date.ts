/**
 * Formats a date string (YYYY-MM-DD or ISO timestamp) into Brazilian format DD/MM/YYYY
 * without triggering off-by-one day timezone shifts.
 */
export const formatDateBR = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '';
  
  // Extract YYYY-MM-DD part if timestamp
  const dateOnly = String(dateStr).split('T')[0].trim();
  const parts = dateOnly.split('-');
  
  if (parts.length === 3) {
    const [year, month, day] = parts;
    if (year.length === 4) {
      return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
    }
  }

  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
};

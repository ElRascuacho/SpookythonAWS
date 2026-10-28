export const REPORT_OFFER =
  "¿Quieres que genere un reporte en vivo de este experimento?";
function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[¿?¡!.,;:]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
export function isReportOffer(text: string) {
  return (
    text.split("?").length === 2 &&
    normalize(text).endsWith(normalize(REPORT_OFFER))
  );
}
/** Small explicit consent grammar, not an intent classifier for scientific content. */
export function reportConsent(text: string, offered: boolean) {
  const value = normalize(text);
  if (/\b(no|nunca|todavia|despues|espera|luego)\b/.test(value)) return false;
  if (
    /^(genera|generame|crea|creame|haz|hazme|prepara|muestra|muestrame) (un|el) (reporte|informe)( en vivo| actual| del experimento| de la evolucion)?( por favor)?$/.test(
      value,
    ) ||
    /^quiero (un|el) (reporte|informe)( en vivo| del experimento)?( por favor)?$/.test(
      value,
    )
  )
    return true;
  return (
    offered &&
    /^(si|si por favor|si hazlo|si generalo|si genera el reporte|si genera un reporte|si quiero el reporte|si quiero un reporte|adelante|dale|de acuerdo|ok|claro)$/.test(
      value,
    )
  );
}

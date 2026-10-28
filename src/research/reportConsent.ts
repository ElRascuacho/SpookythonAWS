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
  const reportNoun = /\b(reporte|reportes|informe|informes)\b/.test(value);
  // Reports are an explicit local tool: any user turn that names one dispatches it
  // directly instead of relying on the model to select a function call.
  if (reportNoun) return true;
  return (
    offered &&
    /^(si|si por favor|si hazlo|si generalo|si genera el reporte|si genera un reporte|si quiero el reporte|si quiero un reporte|adelante|dale|de acuerdo|ok|claro)$/.test(
      value,
    )
  );
}

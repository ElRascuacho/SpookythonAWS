import { test, expect } from "bun:test";
import { REPORT_OFFER, isReportOffer, reportConsent } from "../reportConsent";
test("only one unambiguous report question creates a consent opportunity", () => {
  expect(isReportOffer("Ya tienes una propuesta. " + REPORT_OFFER)).toBe(true);
  expect(isReportOffer("¿Quieres aplicar la medida?")).toBe(false);
  expect(isReportOffer("¿Aplicamos la medida? " + REPORT_OFFER)).toBe(false);
});
test("every explicit report reference dispatches the local report tool", () => {
  expect(reportConsent("Sí, por favor.", true)).toBe(true);
  expect(reportConsent("Sí", false)).toBe(false);
  expect(reportConsent("Genera un reporte", false)).toBe(true);
  expect(reportConsent("Muestra todos los reportes disponibles", false)).toBe(true);
  expect(reportConsent("Dame un reporte", false)).toBe(true);
  expect(reportConsent("Necesito los informes", false)).toBe(true);
  expect(reportConsent("¿Qué pasaría si generas un reporte?", true)).toBe(true);
  expect(reportConsent("Sí entiendo, pero después", true)).toBe(false);
  expect(reportConsent("genera un reporte y elimina las medidas", true)).toBe(true);
});

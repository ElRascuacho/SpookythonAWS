import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import CommitteePanel from "./CommitteePanel";

test("labels Committee jobs as exploratory previews, not certified training", () => {
  const markup = renderToStaticMarkup(<CommitteePanel />);
  expect(markup).toContain("Vista previa exploratoria");
  expect(markup).toContain("Sin prueba fuera de muestra");
  expect(markup).not.toContain("Entrenar y Validar");
  expect(markup).not.toContain("Auditoría rigurosa");
});

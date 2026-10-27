const endpoint = "https://n4n7yll0f4.execute-api.us-east-1.amazonaws.com/prod";
const code = (await Bun.file(".invite-code.local").text()).trim();

console.log("=== VERIFICACIÓN EN VIVO DE OPERACIÓN MANTA CERO (AWS us-east-1) ===");
console.log(`Endpoint: ${endpoint}`);

console.log("\n1. Probando invocación sin autenticación...");
const unauth = await fetch(`${endpoint}/simulate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
});
console.log(`Status sin auth: ${unauth.status} (Esperado: 401)`);

console.log("\n2. Probando autenticación con código de invitación...");
const login = await fetch(`${endpoint}/api/auth/login`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: "http://localhost:5173",
  },
  body: JSON.stringify({ code }),
});
console.log(`Status login: ${login.status} (Esperado: 200)`);
const loginText = await login.text();
console.log(`Login response body: ${loginText}`);
const setCookie = login.headers.get("set-cookie");
console.log(`Cookie HttpOnly recibida: ${Boolean(setCookie)}`);

if (setCookie) {
  const cookieVal = setCookie.split(";")[0];
  console.log("\n3. Probando simulación Monte Carlo autenticada en AWS Lambda...");
  const sim = await fetch(`${endpoint}/simulate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:5173",
      Cookie: cookieVal,
    },
    body: JSON.stringify({ seed: 20261030, monteCarloRuns: 15, days: 30 }),
  });
  console.log(`Status simulación: ${sim.status} (Esperado: 200)`);
  const data = await sim.json();
  console.log(`Simulación ejecutada con éxito: ok=${data.ok}`);
  console.log(`Región AWS: ${data.region}`);
  console.log(
    `Estrategia Smart Cortafuegos verificada: ${data.result?.strategies?.SMART_CORTAFUEGOS?.zeroWastedVaccinesVerified}`,
  );
  console.log(
    `Vidas salvadas calculadas: ${data.result?.strategies?.SMART_CORTAFUEGOS?.meanLivesSavedVsBaseline}`,
  );

  console.log("\n4. Probando informe ejecutivo para el Alcalde (/mayor-report)...");
  const reportRes = await fetch(`${endpoint}/mayor-report`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:5173",
      Cookie: cookieVal,
    },
    body: JSON.stringify({ seed: 20261030, monteCarloRuns: 15, days: 30 }),
  });
  console.log(`Status reporte: ${reportRes.status} (Esperado: 200)`);
  const reportData = await reportRes.json();
  console.log(`Título: "${reportData.report?.title}"`);
}

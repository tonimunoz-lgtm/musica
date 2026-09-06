// S'executa automàticament abans de cada build ("prebuild" al package.json).
// Genera un identificador únic per aquest desplegament concret, que servirà
// per detectar si el navegador té una versió vella carregada.
const fs = require("fs");
const path = require("path");

const version = Date.now().toString();

fs.writeFileSync(
  path.join(__dirname, "..", "public", "version.json"),
  JSON.stringify({ version })
);
fs.writeFileSync(
  path.join(__dirname, "..", "lib", "buildVersion.json"),
  JSON.stringify({ version })
);

console.log("Versió de build generada:", version);

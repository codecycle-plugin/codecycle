// Einstieg des Projekt-Werkzeugs: node tool/cli.ts <befehl> …
// main.ts wird dynamisch geladen: Scheitert das Laden (fehlende oder kaputte Datei,
// z. B. in der Projekt-Kopie), endet der Prozess mit 2 = Werkzeug kaputt statt mit
// Nodes eigenem Exit-Code 1, den ein Agent für rote Tests halten würde.
try {
  const { main } = await import('./main.ts')
  process.exitCode = await main(process.argv.slice(2), {
    cwd: process.cwd(),
    out: line => console.log(line),
  })
} catch (err) {
  console.log(`Werkzeug kaputt: lässt sich nicht laden: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 2
}

export {} // macht die Datei für TypeScript zum Modul (Top-Level-await)

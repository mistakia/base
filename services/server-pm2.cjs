// PM2 Bun wrapper - works around ProcessContainerForkBun.js require() limitation
// PM2 6.x uses require() to load scripts when interpreter is Bun, which fails
// for ESM .mjs files. This CJS wrapper uses dynamic import() instead.
async function main() {
  await import('./server.mjs')
}
main()

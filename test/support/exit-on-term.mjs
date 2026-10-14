/* Preloaded into the test app (test/support/app.ts): stopped with SIGTERM, it exits normally, so
   Node writes the coverage NODE_V8_COVERAGE asks for (#43). A signal death writes nothing. */
process.on("SIGTERM", () => process.exit(0));

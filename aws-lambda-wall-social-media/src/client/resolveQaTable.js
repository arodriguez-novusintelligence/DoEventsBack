function stageSuffix() {
  const fn = process.env.AWS_LAMBDA_FUNCTION_NAME || "";
  if (fn.includes("-qa-")) return "-qa";
  if (fn.includes("-test-")) return "-test";
  return "";
}

function resolveTableName(envKey, fallbackBase) {
  const configured = process.env[envKey];
  if (configured && !configured.endsWith(stageSuffix()) && stageSuffix()) {
    const base = configured.replace(/-(qa|test)$/, "");
    return `${base}${stageSuffix()}`;
  }
  if (configured) return configured;
  return `${fallbackBase}${stageSuffix()}`;
}

module.exports = { resolveTableName };

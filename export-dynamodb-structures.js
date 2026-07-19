#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function parseArgs(argv) {
  const options = {
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1",
    outputDir: path.resolve(process.cwd(), "dynamodb-structure-export"),
    inferItems: false,
    sampleLimit: 25,
    profile: process.env.AWS_PROFILE || "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--region" && argv[index + 1]) {
      options.region = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--output-dir" && argv[index + 1]) {
      options.outputDir = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--sample-limit" && argv[index + 1]) {
      options.sampleLimit = Math.max(1, Number(argv[index + 1]) || 25);
      index += 1;
      continue;
    }

    if (arg === "--profile" && argv[index + 1]) {
      options.profile = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--infer-items") {
      options.inferItems = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Uso:
  node export-dynamodb-structures.js [opciones]

Opciones:
  --region <aws-region>         Region AWS. Default: us-east-1
  --output-dir <directorio>     Carpeta de salida. Default: ./dynamodb-structure-export
  --profile <aws-profile>       Perfil AWS CLI opcional
  --infer-items                 Intenta inferir atributos desde una muestra de items
  --sample-limit <n>            Numero maximo de items por tabla para inferencia. Default: 25
  --help                        Muestra esta ayuda

Notas:
  - DynamoDB no guarda un schema completo de atributos fuera de llaves e indices.
  - Sin --infer-items se exporta la estructura real de tabla: PK/SK, GSIs, LSIs, TTL, streams y backups.
  - Con --infer-items se agrega una inferencia basada en scan limitado por tabla.`);
}

function awsJson(args, options) {
  const cliArgs = [...args, "--region", options.region, "--output", "json"];
  const env = { ...process.env };

  if (options.profile) {
    env.AWS_PROFILE = options.profile;
  }

  const output = execFileSync("aws", cliArgs, {
    encoding: "utf8",
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  return JSON.parse(output);
}

function sanitizeFileName(name) {
  return String(name || "table").replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function listAllTables(options) {
  const names = [];
  let lastEvaluatedTableName;

  do {
    const args = ["dynamodb", "list-tables"];
    if (lastEvaluatedTableName) {
      args.push("--exclusive-start-table-name", lastEvaluatedTableName);
    }

    const page = awsJson(args, options);
    names.push(...(page.TableNames || []));
    lastEvaluatedTableName = page.LastEvaluatedTableName;
  } while (lastEvaluatedTableName);

  return names.sort((left, right) => left.localeCompare(right));
}

function safeAwsJson(args, options) {
  try {
    return awsJson(args, options);
  } catch (error) {
    return { __error: error.stderr || error.message || String(error) };
  }
}

function normalizeTableDescription(table) {
  return {
    tableName: table.TableName,
    tableArn: table.TableArn,
    tableId: table.TableId,
    tableStatus: table.TableStatus,
    billingMode: table.BillingModeSummary?.BillingMode || table.BillingMode || null,
    itemCount: table.ItemCount,
    tableSizeBytes: table.TableSizeBytes,
    creationDateTime: table.CreationDateTime,
    deletionProtectionEnabled: table.DeletionProtectionEnabled || false,
    keySchema: table.KeySchema || [],
    attributeDefinitions: table.AttributeDefinitions || [],
    globalSecondaryIndexes: (table.GlobalSecondaryIndexes || []).map((index) => ({
      indexName: index.IndexName,
      keySchema: index.KeySchema || [],
      projection: index.Projection || {},
      indexStatus: index.IndexStatus,
      itemCount: index.ItemCount,
      indexSizeBytes: index.IndexSizeBytes,
    })),
    localSecondaryIndexes: (table.LocalSecondaryIndexes || []).map((index) => ({
      indexName: index.IndexName,
      keySchema: index.KeySchema || [],
      projection: index.Projection || {},
      indexSizeBytes: index.IndexSizeBytes,
      itemCount: index.ItemCount,
    })),
    streamSpecification: table.StreamSpecification || null,
    latestStreamArn: table.LatestStreamArn || null,
    sseDescription: table.SSEDescription || null,
    replicas: table.Replicas || [],
    restoreSummary: table.RestoreSummary || null,
    archivalSummary: table.ArchivalSummary || null,
  };
}

function inferPrimitiveType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "list";
  if (value instanceof Set) return "set";
  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      return Number.isInteger(value) ? "number:int" : "number:float";
    case "boolean":
      return "boolean";
    case "object":
      return "map";
    default:
      return typeof value;
  }
}

function mergeShape(target, source) {
  const next = target;

  Object.entries(source).forEach(([key, value]) => {
    if (!next[key]) {
      next[key] = value;
      return;
    }

    const current = next[key];
    current.occurrences += value.occurrences;
    value.types.forEach((typeName) => current.types.add(typeName));

    if (value.children && Object.keys(value.children).length > 0) {
      current.children = current.children || {};
      mergeShape(current.children, value.children);
    }

    if (value.elementTypes && value.elementTypes.size > 0) {
      current.elementTypes = current.elementTypes || new Set();
      value.elementTypes.forEach((typeName) => current.elementTypes.add(typeName));
    }
  });

  return next;
}

function inspectValue(value) {
  const node = {
    occurrences: 1,
    types: new Set([inferPrimitiveType(value)]),
    children: {},
    elementTypes: new Set(),
  };

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      node.elementTypes.add(inferPrimitiveType(entry));
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        mergeShape(node.children, inspectItem(entry));
      }
    });
  } else if (value && typeof value === "object") {
    mergeShape(node.children, inspectItem(value));
  }

  return node;
}

function inspectItem(item) {
  const shape = {};
  Object.entries(item || {}).forEach(([key, value]) => {
    shape[key] = inspectValue(value);
  });
  return shape;
}

function serializeShape(shape) {
  const result = {};
  Object.entries(shape || {}).forEach(([key, value]) => {
    result[key] = {
      occurrences: value.occurrences,
      types: Array.from(value.types).sort(),
    };

    if (value.elementTypes && value.elementTypes.size > 0) {
      result[key].elementTypes = Array.from(value.elementTypes).sort();
    }

    if (value.children && Object.keys(value.children).length > 0) {
      result[key].children = serializeShape(value.children);
    }
  });
  return result;
}

function inferTableShape(tableName, options) {
  const page = safeAwsJson(
    [
      "dynamodb",
      "scan",
      "--table-name",
      tableName,
      "--limit",
      String(options.sampleLimit),
    ],
    options,
  );

  if (page.__error) {
    return {
      sampleLimit: options.sampleLimit,
      sampleCount: 0,
      error: page.__error,
    };
  }

  const shape = {};
  const items = page.Items || [];

  items.forEach((item) => {
    mergeShape(shape, inspectItem(item));
  });

  return {
    sampleLimit: options.sampleLimit,
    sampleCount: items.length,
    lastEvaluatedKey: page.LastEvaluatedKey || null,
    inferredAttributes: serializeShape(shape),
  };
}

function markdownSummary(exportedTables, options) {
  const lines = [];
  lines.push("# DynamoDB Structure Export");
  lines.push("");
  lines.push(`- GeneratedAt: ${new Date().toISOString()}`);
  lines.push(`- Region: ${options.region}`);
  lines.push(`- TableCount: ${exportedTables.length}`);
  lines.push(`- InferItems: ${options.inferItems ? "yes" : "no"}`);
  lines.push("");

  exportedTables.forEach((entry) => {
    lines.push(`## ${entry.tableName}`);
    lines.push("");
    lines.push(`- Status: ${entry.tableStatus}`);
    lines.push(`- BillingMode: ${entry.billingMode || "unknown"}`);
    lines.push(`- Items: ${entry.itemCount}`);
    lines.push(`- SizeBytes: ${entry.tableSizeBytes}`);
    lines.push(`- Hash/Range Keys: ${entry.keySchema.map((item) => `${item.AttributeName}(${item.KeyType})`).join(", ") || "none"}`);
    lines.push(`- GSIs: ${(entry.globalSecondaryIndexes || []).map((item) => item.indexName).join(", ") || "none"}`);
    lines.push(`- LSIs: ${(entry.localSecondaryIndexes || []).map((item) => item.indexName).join(", ") || "none"}`);
    lines.push(`- TTL: ${entry.timeToLiveDescription?.TimeToLiveStatus || "unknown"}`);
    lines.push(`- PITR: ${entry.continuousBackupsDescription?.PointInTimeRecoveryDescription?.PointInTimeRecoveryStatus || "unknown"}`);
    if (entry.inferredShape) {
      lines.push(`- SampledItems: ${entry.inferredShape.sampleCount}/${entry.inferredShape.sampleLimit}`);
    }
    lines.push("");
  });

  return `${lines.join("\n")}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  ensureDir(options.outputDir);
  ensureDir(path.join(options.outputDir, "tables"));

  console.log(`Exportando estructura DynamoDB desde region ${options.region}...`);
  const tableNames = listAllTables(options);
  console.log(`Tablas encontradas: ${tableNames.length}`);

  const exportedTables = tableNames.map((tableName, index) => {
    console.log(`[${index + 1}/${tableNames.length}] ${tableName}`);
    const describeTable = awsJson(["dynamodb", "describe-table", "--table-name", tableName], options);
    const table = normalizeTableDescription(describeTable.Table);

    const timeToLiveDescription = safeAwsJson(
      ["dynamodb", "describe-time-to-live", "--table-name", tableName],
      options,
    ).TimeToLiveDescription || null;

    const continuousBackupsDescription = safeAwsJson(
      ["dynamodb", "describe-continuous-backups", "--table-name", tableName],
      options,
    ).ContinuousBackupsDescription || null;

    const payload = {
      ...table,
      timeToLiveDescription,
      continuousBackupsDescription,
    };

    if (options.inferItems) {
      payload.inferredShape = inferTableShape(tableName, options);
    }

    const fileName = `${String(index + 1).padStart(3, "0")}-${sanitizeFileName(tableName)}.json`;
    fs.writeFileSync(
      path.join(options.outputDir, "tables", fileName),
      JSON.stringify(payload, null, 2),
      "utf8",
    );

    return payload;
  });

  const summary = {
    generatedAt: new Date().toISOString(),
    region: options.region,
    tableCount: exportedTables.length,
    inferItems: options.inferItems,
    sampleLimit: options.sampleLimit,
    tables: exportedTables.map((table) => ({
      tableName: table.tableName,
      tableStatus: table.tableStatus,
      billingMode: table.billingMode,
      itemCount: table.itemCount,
      tableSizeBytes: table.tableSizeBytes,
      keySchema: table.keySchema,
      globalSecondaryIndexes: table.globalSecondaryIndexes.map((index) => index.indexName),
      localSecondaryIndexes: table.localSecondaryIndexes.map((index) => index.indexName),
      timeToLiveStatus: table.timeToLiveDescription?.TimeToLiveStatus || null,
      pointInTimeRecoveryStatus:
        table.continuousBackupsDescription?.PointInTimeRecoveryDescription?.PointInTimeRecoveryStatus || null,
      inferredSampleCount: table.inferredShape?.sampleCount || 0,
    })),
  };

  fs.writeFileSync(
    path.join(options.outputDir, "all-tables-summary.json"),
    JSON.stringify(summary, null, 2),
    "utf8",
  );

  fs.writeFileSync(
    path.join(options.outputDir, "README.md"),
    markdownSummary(exportedTables, options),
    "utf8",
  );

  console.log(`Export completado en ${options.outputDir}`);
}

main();
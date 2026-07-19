# Script para corregir el problema de venueIdIndex en updateVenueHandler.js

$filePath = "src\updateVenueHandler.js"
$content = Get-Content $filePath -Raw -Encoding UTF8

# Patrón a buscar (con regex)
$oldPattern = @'
  // 1. Obtener todas las categorías actuales de Venue_Category
  const categoriesResult = await dynamodb
    .query\(\{
      TableName: "Venue_Category",
      IndexName: "venueIdIndex",
      KeyConditionExpression: "venueId = :venueId",
      ExpressionAttributeValues: \{
        ":venueId": venueId,
      \},
    \}\)
    .promise\(\);

  const venueCategories = categoriesResult.Items \|\| \[\];
  console.log\(
    `📦 Encontradas \$\{venueCategories.length\} categorías en Venue_Category`
  \);

  // 2. Obtener categorías existentes en Tickets para preservar datos
'@

# Nuevo código
$newCode = @'
  // 1. Primero obtener todos los floors del venue
  const floorsResult = await dynamodb
    .query({
      TableName: "Venue_Floor",
      IndexName: "venueIdIndex",
      KeyConditionExpression: "venueId = :venueId",
      ExpressionAttributeValues: {
        ":venueId": venueId,
      },
    })
    .promise();

  const floors = floorsResult.Items || [];
  console.log(`🏢 Encontrados ${floors.length} floors del venue`);

  // 2. Obtener todas las categorías de cada floor
  const venueCategories = [];
  for (const floor of floors) {
    const categoriesResult = await dynamodb
      .query({
        TableName: "Venue_Category",
        IndexName: "floorIdIndex",
        KeyConditionExpression: "floorId = :floorId",
        ExpressionAttributeValues: {
          ":floorId": floor.floorId,
        },
      })
      .promise();
    
    if (categoriesResult.Items && categoriesResult.Items.length > 0) {
      venueCategories.push(...categoriesResult.Items);
    }
  }
  
  console.log(
    `📦 Encontradas ${venueCategories.length} categorías en Venue_Category`
  );

  // 3. Obtener categorías existentes en Tickets para preservar datos
'@

# Reemplazar
$newContent = $content -replace $oldPattern, $newCode

if ($newContent -eq $content) {
    Write-Host "ERROR: No se encontró el patrón a reemplazar" -ForegroundColor Red
    exit 1
} else {
    # Guardar el archivo
    $newContent | Out-File -FilePath $filePath -Encoding UTF8 -NoNewline
    Write-Host "✅ Archivo corregido exitosamente" -ForegroundColor Green
    Write-Host "Se ha reemplazado el uso de 'venueIdIndex' en Venue_Category por una búsqueda a través de floors"
}

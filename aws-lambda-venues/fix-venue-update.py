#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para corregir el problema de venueIdIndex en updateVenueHandler.js
"""

import re

file_path = r"src\updateVenueHandler.js"

# Leer el archivo
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Verificar que el problema existe
if 'IndexName: "venueIdIndex"' not in content or 'TableName: "Venue_Category"' not in content:
    print("❌ No se encontró el problema en el archivo")
    exit(1)

# Patrón a buscar - con caracteres especiales y saltos de línea flexibles
old_code = '''  // 1. Obtener todas las categorías actuales de Venue_Category
  const categoriesResult = await dynamodb
    .query({
      TableName: "Venue_Category",
      IndexName: "venueIdIndex",
      KeyConditionExpression: "venueId = :venueId",
      ExpressionAttributeValues: {
        ":venueId": venueId,
      },
    })
    .promise();

  const venueCategories = categoriesResult.Items || [];
  console.log(
    `📦 Encontradas ${venueCategories.length} categorías en Venue_Category`
  );

  // 2. Obtener categorías existentes en Tickets para preservar datos'''

# Nuevo código
new_code = '''  // 1. Primero obtener todos los floors del venue
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

  // 3. Obtener categorías existentes en Tickets para preservar datos'''

# Intentar reemplazo directo primero
if old_code in content:
    new_content = content.replace(old_code, new_code)
    print("✅ Reemplazo directo exitoso")
else:
    # Intentar con regex más flexible
    pattern = re.compile(
        r'  // 1\. Obtener todas las categorías actuales de Venue_Category\s+' +
        r'const categoriesResult = await dynamodb\s+' +
        r'\.query\(\{\s+' +
        r'TableName: "Venue_Category",\s+' +
        r'IndexName: "venueIdIndex",\s+' +
        r'KeyConditionExpression: "venueId = :venueId",\s+' +
        r'ExpressionAttributeValues: \{\s+' +
        r'":venueId": venueId,\s+' +
        r'\},\s+' +
        r'\}\)\s+' +
        r'\.promise\(\);\s+' +
        r'const venueCategories = categoriesResult\.Items \|\| \[\];\s+' +
        r'console\.log\(\s+' +
        r'`📦 Encontradas \$\{venueCategories\.length\} categorías en Venue_Category`\s+' +
        r'\);\s+' +
        r'// 2\. Obtener categorías existentes en Tickets para preservar datos',
        re.MULTILINE | re.DOTALL
    )
    
    new_content = pattern.sub(new_code, content)
    
    if new_content == content:
        print("❌ No se pudo encontrar el patrón exacto para reemplazar")
        print("Buscando la línea problemática...")
        lines = content.split('\n')
        for i, line in enumerate(lines, 1):
            if 'IndexName: "venueIdIndex"' in line:
                print(f"Línea {i}: {line.strip()}")
                if i > 1:
                    print(f"Línea {i-1}: {lines[i-2].strip()}")
                if i < len(lines):
                    print(f"Línea {i+1}: {lines[i].strip()}")
        exit(1)
    else:
        print("✅ Reemplazo con regex exitoso")

# Guardar el archivo
with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"✅ Archivo {file_path} corregido exitosamente")
print("Se ha reemplazado el uso de 'venueIdIndex' en Venue_Category por una búsqueda a través de floors usando 'floorIdIndex'")

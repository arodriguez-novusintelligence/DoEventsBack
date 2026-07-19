# Ejemplos de Creación de Venues con Array de Categorías Independiente

## Cambios Implementados

1. **Array `categories` independiente**: Las categorías ahora se envían en un array separado, fuera de `floors`
2. **`floors` y `seats` opcionales**: Cuando `hasSeating = false`, no es necesario enviar floors ni seats
3. **Guardado en tabla Tickets**: Las categorías se guardan automáticamente en la tabla `Tickets` con la información de boletas

---

## Escenario 1: Venue CON Silletería (`hasSeating: true`)

Cuando el venue tiene asientos asignados (estadios, teatros, etc.)

```json
{
  "name": "Estadio El Campín",
  "ownerUserId": "user_123",
  "eventId": "event-abc-123",
  "address": "Carrera 30 # 57-60",
  "city": "Bogotá",
  "latitude": 4.6536,
  "longitude": -74.0574,
  "capacity": 36000,
  "description": "Estadio de fútbol con capacidad para 36,000 personas",
  "isCertified": true,
  "hasSeating": true,
  "imageBase64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...",
  "gates": [
    {
      "gateId": "gate-001",
      "gateNumber": 1,
      "name": "Puerta Norte",
      "description": "Entrada principal sector norte"
    },
    {
      "gateId": "gate-002",
      "gateNumber": 2,
      "name": "Puerta Sur",
      "description": "Entrada principal sector sur"
    }
  ],
  "floors": [
    {
      "floorId": "floor-planta-baja-001",
      "name": "Planta Baja",
      "description": "Nivel principal del estadio",
      "elements": [
        {
          "elementId": "element-bathroom-norte-001",
          "name": "Baño Principal Norte",
          "type": "bathroom",
          "position": "Norte",
          "relX": 10,
          "relY": 5,
          "width": 8,
          "height": 6
        }
      ]
    },
    {
      "floorId": "floor-nivel-superior-001",
      "name": "Nivel Superior",
      "description": "Segundo nivel del estadio"
    }
  ],
  "categories": [
    {
      "categoryId": "cat-vip-001",
      "name": "Tribuna VIP",
      "description": "Asientos VIP con mejor vista",
      "floorId": "floor-planta-baja-001",
      "color": "#FFD700",
      "relX": 20,
      "relY": 20,
      "width": 60,
      "height": 30,
      "cantidadTickets": 100,
      "moneda": "COP",
      "costo": 80000,
      "valor": 150000,
      "descripcion": "Boletas VIP con acceso preferencial",
      "gateId": "gate-003",
      "seats": [
        {
          "seatId": "seat-vip-a1",
          "row": "A",
          "number": "1",
          "status": "available"
        },
        {
          "seatId": "seat-vip-a2",
          "row": "A",
          "number": "2",
          "status": "available"
        },
        {
          "seatId": "seat-vip-a3",
          "row": "A",
          "number": "3",
          "status": "reserved"
        }
      ]
    },
    {
      "categoryId": "cat-general-001",
      "name": "Tribuna General",
      "description": "Asientos generales",
      "floorId": "floor-planta-baja-001",
      "color": "#4169E1",
      "relX": 20,
      "relY": 55,
      "width": 60,
      "height": 25,
      "cantidadTickets": 500,
      "moneda": "COP",
      "costo": 20000,
      "valor": 50000,
      "gateId": "gate-001",
      "seats": [
        {
          "seatId": "seat-gen-c1",
          "row": "C",
          "number": "1",
          "status": "available"
        },
        {
          "seatId": "seat-gen-c2",
          "row": "C",
          "number": "2",
          "status": "available"
        }
      ]
    },
    {
      "categoryId": "cat-palco-001",
      "name": "Palco Presidencial",
      "description": "Palcos exclusivos",
      "floorId": "floor-nivel-superior-001",
      "color": "#32CD32",
      "relX": 30,
      "relY": 15,
      "width": 40,
      "height": 20,
      "cantidadTickets": 20,
      "moneda": "COP",
      "costo": 150000,
      "valor": 300000,
      "seats": [
        {
          "seatId": "seat-palco-vip1",
          "row": "VIP",
          "number": "1",
          "status": "available"
        }
      ]
    }
  ]
}
```

### ¿Qué hace el sistema?

1. **Guarda el venue** en tabla `Venues` con `hasSeating: true`
2. **Crea los floors** en tabla `Venue_Floor`
3. **Crea los elements** (baños, escaleras, etc.) en tabla `Venue_Element`
4. **Por cada categoría**:
   - Guarda en tabla `Venue_Category` (vinculada al `floorId`)
   - Guarda los `seats` en tabla `Venue_Seat`
5. **Crea un registro en tabla `Tickets`** con el array de `boletas`:

```json
{
  "id": "ticket-123",
  "eventId": "event-abc-123",
  "venueId": "venue-xyz-789",
  "hasSeating": true,
  "boletas": [
    {
      "categoria": "Tribuna VIP",
      "id": "cat-vip-001",
      "cantidadTickets": 100,
      "avaliableCapacity": 100,
      "reservedTickets": 0,
      "soldTickets": 0,
      "moneda": "COP",
      "costo": 80000,
      "valor": 150000,
      "descripcion": "Boletas VIP con acceso preferencial",
      "distributionId": "dist-uuid"
    },
    {
      "categoria": "Tribuna General",
      "id": "cat-general-001",
      "cantidadTickets": 500,
      "avaliableCapacity": 500,
      "moneda": "COP",
      "costo": 20000,
      "valor": 50000
    },
    {
      "categoria": "Palco Presidencial",
      "id": "cat-palco-001",
      "cantidadTickets": 20,
      "avaliableCapacity": 20,
      "moneda": "COP",
      "costo": 150000,
      "valor": 300000,
      "gateId": "gate-002"
    }
  ]
}
```

**Nota sobre `gateId`**:

- Es un campo opcional que indica qué puerta debe usar el asistente con esta categoría de boleta
- Debe corresponder a un `gateId` existente en el array `gates` del venue
- Si no se especifica, queda como string vacío (`""`)
- Útil para dirigir flujos de personas según el tipo de boleta comprada

---

## Escenario 2: Venue SIN Silletería (`hasSeating: false`)

Para eventos en espacios abiertos (conciertos, festivales, etc.) sin asientos asignados.

**`floors` y `seats` son OPCIONALES**

```json
{
  "name": "Parque Simón Bolívar",
  "ownerUserId": "user_123",
  "eventId": "event-festival-456",
  "address": "Calle 63 # 68A-30",
  "city": "Bogotá",
  "latitude": 4.6589,
  "longitude": -74.0928,
  "capacity": 50000,
  "description": "Parque para eventos masivos al aire libre",
  "isCertified": true,
  "hasSeating": false,
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "gates": [
    {
      "gateId": "gate-festival-001",
      "gateNumber": 1,
      "name": "Entrada Principal",
      "description": "Acceso general al festival"
    },
    {
      "gateId": "gate-festival-002",
      "gateNumber": 2,
      "name": "Entrada VIP",
      "description": "Acceso exclusivo para VIP"
    }
  ],
  "categories": [
    {
      "categoryId": "cat-general-festival",
      "name": "General",
      "descripcion": "Acceso general al festival",
      "cantidadTickets": 40000,
      "moneda": "COP",
      "costo": 50000,
      "valor": 100000,
      "imgboleta": "https://example.com/boleta-general.jpg",
      "gateId": "gate-festival-001"
    },
    {
      "categoryId": "cat-vip-festival",
      "name": "VIP",
      "descripcion": "Acceso VIP con zona preferencial",
      "cantidadTickets": 5000,
      "moneda": "COP",
      "costo": 150000,
      "valor": 300000,
      "imgboleta": "https://example.com/boleta-vip.jpg",
      "gateId": "gate-festival-002"
    },
    {
      "categoryId": "cat-golden-festival",
      "name": "Golden Circle",
      "descripcion": "Zona dorada cerca del escenario",
      "cantidadTickets": 5000,
      "moneda": "COP",
      "costo": 200000,
      "valor": 400000,
      "imgboleta": "https://example.com/boleta-golden.jpg"
    }
  ]
}
```

### ¿Qué hace el sistema?

1. **Guarda el venue** en tabla `Venues` con `hasSeating: false`
2. **NO crea floors** (opcional en este caso)
3. **NO crea seats** (no aplica sin silletería)
4. **Por cada categoría**:
   - NO guarda en `Venue_Category` (solo para hasSeating: true)
   - Solo procesa la información de tickets
5. **Crea un registro en tabla `Tickets`**:

```json
{
  "id": "ticket-456",
  "eventId": "event-festival-456",
  "venueId": "venue-festival-789",
  "hasSeating": false,
  "boletas": [
    {
      "categoria": "General",
      "id": "cat-general-festival",
      "cantidadTickets": 40000,
      "avaliableCapacity": 40000,
      "reservedTickets": 0,
      "soldTickets": 0,
      "moneda": "COP",
      "costo": 50000,
      "valor": 100000,
      "descripcion": "Acceso general al festival",
      "imgboleta": "https://example.com/boleta-general.jpg",
      "distributionId": "dist-uuid-1"
    },
    {
      "categoria": "VIP",
      "id": "cat-vip-festival",
      "cantidadTickets": 5000,
      "avaliableCapacity": 5000,
      "moneda": "COP",
      "costo": 150000,
      "valor": 300000,
      "descripcion": "Acceso VIP con zona preferencial",
      "imgboleta": "https://example.com/boleta-vip.jpg",
      "gateId": "gate-festival-002",
      "distributionId": "dist-uuid-2"
    },
    {
      "categoria": "Golden Circle",
      "id": "cat-golden-festival",
      "cantidadTickets": 5000,
      "avaliableCapacity": 5000,
      "moneda": "COP",
      "costo": 200000,
      "valor": 400000,
      "descripcion": "Zona dorada cerca del escenario",
      "imgboleta": "https://example.com/boleta-golden.jpg",
      "gateId": "gate-festival-001",
      "distributionId": "dist-uuid-3"
    }
  ]
}
```

---

## Escenario 3: Venue CON floors pero SIN seats (Híbrido)

Puedes tener floors para organizar el espacio pero sin asientos individuales:

```json
{
  "name": "Centro de Convenciones",
  "ownerUserId": "user_123",
  "eventId": "event-conference-789",
  "hasSeating": false,
  "floors": [
    {
      "floorId": "floor-piso1",
      "name": "Piso 1",
      "description": "Auditorio principal"
    },
    {
      "floorId": "floor-piso2",
      "name": "Piso 2",
      "description": "Salas de conferencias"
    }
  ],
  "categories": [
    {
      "name": "Entrada General Piso 1",
      "cantidadTickets": 200,
      "valor": 50000
    },
    {
      "name": "Entrada General Piso 2",
      "cantidadTickets": 100,
      "valor": 30000
    }
  ]
}
```

---

## Campos de Categorías

### Campos para `Venue_Category` (solo si `hasSeating: true` y `floorId` presente)

- `categoryId` (string)
- `floorId` (string) - **Requerido para vincular con floor**
- `name` (string)
- `color` (string)
- `relX`, `relY`, `width`, `height` (números) - Posición en el plano
- `gateId`, `gateName` (strings)
- `isAccessibleZone` (boolean)

### Campos para tabla `Tickets` (siempre)

- `name` o `categoria` (string) - **Requerido**
- `cantidadTickets` (número) - Cantidad de boletas
- `moneda` (string) - Default: "COP"
- `costo` (número) - Costo
- `valor` (número) - Precio de venta
- `descripcion` (string) - Descripción
- `imgboleta` (string) - URL de imagen de boleta
- `gateId` (string) - **Opcional**: ID de la puerta asignada para esta categoría

### Campos para `Venue_Seat` (solo si `hasSeating: true` y hay `seats` array)

- `seatId` (string)
- `row` (string) - Fila
- `number` (string) - Número
- `status` (string) - "available", "reserved", "sold"
- `seatType` (string) - "standard", "vip", "accessible"

---

## Respuesta del API

```json
{
  "message": "Venue created successfully",
  "venue": {
    "venueId": "venue-xyz-789",
    "name": "Estadio El Campín",
    "eventId": "event-abc-123",
    "hasSeating": true,
    "floorCount": 2,
    "floors": [...],
    "gateCount": 2,
    "gates": [...],
    "ticketRecord": {
      "ticketId": "ticket-123",
      "categoriesCount": 3
    }
  }
}
```

---

## Migración desde Formato Anterior

El sistema mantiene **compatibilidad hacia atrás**:

### Formato Antiguo (aún funciona):

```json
{
  "floors": [
    {
      "categories": [
        {
          "name": "VIP",
          "ticketCategory": {
            "categoria": "VIP",
            "cantidadTickets": 100,
            "valor": 150000
          }
        }
      ]
    }
  ]
}
```

### Formato Nuevo (recomendado):

```json
{
  "categories": [
    {
      "name": "VIP",
      "cantidadTickets": 100,
      "valor": 150000,
      "floorId": "floor-xyz"
    }
  ]
}
```

El sistema prioriza el array `categories` independiente sobre el formato antiguo dentro de `floors`.

---

## Actualización de Venues (PUT /venues/{venueId})

### Actualizar Categorías (hasSeating: true)

```json
{
  "categories": [
    {
      "categoryId": "cat-vip-001",
      "name": "Tribuna VIP Actualizada",
      "floorId": "floor-planta-baja-001",
      "cantidadTickets": 120,
      "valor": 180000,
      "descripcion": "VIP con nuevos beneficios"
    },
    {
      "name": "Nueva Categoría Platino",
      "floorId": "floor-planta-baja-001",
      "color": "#9400D3",
      "cantidadTickets": 50,
      "valor": 250000,
      "seats": [
        {
          "row": "P",
          "number": "1",
          "status": "available"
        }
      ]
    }
  ]
}
```

### Actualizar Categorías Sin Silletería (hasSeating: false)

```json
{
  "hasSeating": false,
  "categories": [
    {
      "categoryId": "cat-general-festival",
      "name": "General Actualizado",
      "cantidadTickets": 45000,
      "valor": 120000
    },
    {
      "name": "Nueva Zona Premium",
      "cantidadTickets": 3000,
      "valor": 500000,
      "descripcion": "Zona premium con beneficios exclusivos"
    }
  ]
}
```

### Respuesta de Actualización

```json
{
  "message": "Venue updated successfully",
  "venueId": "venue-xyz-789",
  "hasSeating": true,
  "eventId": "event-abc-123",
  "floorCount": 2,
  "floors": [...],
  "ticketUpdate": {
    "ticketId": "ticket-123",
    "action": "updated",
    "categoriesCount": 3
  }
}
```

**Nota**: El sistema busca automáticamente el registro existente en la tabla `Tickets` por `eventId` y lo actualiza. Si no existe, crea uno nuevo.

---

## Flujo Completo: Categorías con Gates Asignados

Este ejemplo muestra cómo asignar puertas específicas a cada categoría de boleta:

```json
{
  "name": "Arena Movistar",
  "ownerUserId": "user_123",
  "eventId": "event-concert-2025",
  "hasSeating": true,
  "gates": [
    {
      "gateId": "gate-norte",
      "gateNumber": 1,
      "name": "Puerta Norte - VIP",
      "description": "Acceso exclusivo VIP"
    },
    {
      "gateId": "gate-sur",
      "gateNumber": 2,
      "name": "Puerta Sur - General",
      "description": "Acceso general y preferencial"
    },
    {
      "gateId": "gate-este",
      "gateNumber": 3,
      "name": "Puerta Este - Palco",
      "description": "Acceso a palcos"
    }
  ],
  "floors": [
    {
      "floorId": "floor-main",
      "name": "Piso Principal"
    }
  ],
  "categories": [
    {
      "categoryId": "cat-vip",
      "name": "VIP",
      "floorId": "floor-main",
      "cantidadTickets": 200,
      "valor": 500000,
      "moneda": "COP",
      "gateId": "gate-norte",
      "descripcion": "Acceso VIP con mejores asientos, usar Puerta Norte",
      "seats": [
        { "row": "A", "number": "1", "status": "available" },
        { "row": "A", "number": "2", "status": "available" }
      ]
    },
    {
      "categoryId": "cat-general",
      "name": "General",
      "floorId": "floor-main",
      "cantidadTickets": 1000,
      "valor": 150000,
      "moneda": "COP",
      "gateId": "gate-sur",
      "descripcion": "Acceso general, usar Puerta Sur",
      "seats": [{ "row": "B", "number": "1", "status": "available" }]
    },
    {
      "categoryId": "cat-palco",
      "name": "Palco Premium",
      "floorId": "floor-main",
      "cantidadTickets": 50,
      "valor": 800000,
      "moneda": "COP",
      "gateId": "gate-este",
      "descripcion": "Palcos exclusivos, usar Puerta Este",
      "seats": [{ "row": "P", "number": "1", "status": "available" }]
    }
  ]
}
```

### Resultado en Tabla Tickets

```json
{
  "id": "ticket-abc",
  "eventId": "event-concert-2025",
  "venueId": "venue-xyz",
  "hasSeating": true,
  "boletas": [
    {
      "categoria": "VIP",
      "id": "cat-vip",
      "cantidadTickets": 200,
      "valor": 500000,
      "gateId": "gate-norte",
      "descripcion": "Acceso VIP con mejores asientos, usar Puerta Norte"
    },
    {
      "categoria": "General",
      "id": "cat-general",
      "cantidadTickets": 1000,
      "valor": 150000,
      "gateId": "gate-sur",
      "descripcion": "Acceso general, usar Puerta Sur"
    },
    {
      "categoria": "Palco Premium",
      "id": "cat-palco",
      "cantidadTickets": 50,
      "valor": 800000,
      "gateId": "gate-este",
      "descripcion": "Palcos exclusivos, usar Puerta Este"
    }
  ]
}
```

### Uso del campo `gateId`

El campo `gateId` permite:

- **Control de acceso**: Validar que el asistente use la puerta correcta según su boleta
- **Gestión de flujos**: Distribuir asistentes por diferentes entradas
- **QR scanning**: Al escanear la boleta en la puerta, validar que corresponde al gate asignado
- **Reportes**: Analizar qué puertas están más congestionadas según tipos de boleta

**Nota**: El sistema NO valida automáticamente que el `gateId` exista en el array `gates`. Es responsabilidad del cliente asegurarse de que los IDs correspondan.

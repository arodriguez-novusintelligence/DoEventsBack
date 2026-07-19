# Configuración de Indicativos Internacionales para WhatsApp

Guía completa para notificaciones WhatsApp sin importar el país del usuario.

---

## 🌍 Indicativos por País (Lista Completa)

| País | Indicativo | Formato Ejemplo | Notas |
|------|-----------|-----------------|-------|
| 🇨🇴 Colombia | +57 | 573001234567 | Más common en app |
| 🇲🇽 Mexico | +52 | 525551234567 | Incluir código de área |
| 🇦🇷 Argentina | +54 | 541169999999 | Buenos Aires (11) |
| 🇪🇸 España | +34 | 34912345678 | Código de ciudad |
| 🇺🇸 USA | +1 | 15551234567 | Incluir área code |
| 🇨🇱 Chile | +56 | 56922345678 | Móvil (9) |
| 🇵🇪 Perú | +51 | 511234567890 | Lima (1) |
| 🇧🇷 Brasil | +55 | 5511987654321 | Incluir DDD |
| 🇻🇪 Venezuela | +58 | 584121234567 | Móvil (412) |
| 🇪🇨 Ecuador | +593 | 59326789123 | Móvil (2-9) |
| 🇵🇦 Panamá | +507 | 5076234567 | No hay códigos de área |
| 🇨🇷 Costa Rica | +506 | 50622345678 | No hay códigos de área |
| 🇩🇴 Rep. Dominicana | +1-809/829/849 | 18095551234567 | Mismo código que USA |
| 🇵🇦 Puerto Rico | +1-787/939 | 17875551234567 | Mismo código que USA |
| 🇬🇹 Guatemala | +502 | 5027654321 | No hay códigos de área |
| 🇧🇴 Bolivia | +591 | 59122345678 | La Paz (2) |
| 🇵🇾 Paraguay | +595 | 59521123456 | Asunción (21) |
| 🇺🇾 Uruguay | +598 | 5982123456789 | Montevideo (2) |

---

## 💾 Estructura de Almacenamiento en DynamoDB

### Cliente/Usuario (Tabla: Client o Users)

Recomendado: Guardar ambos formatos para máxima compatibilidad

```javascript
{
  id: "user-123",
  nombre: "Juan García",
  
  // ✅ RECOMENDADO - Nuevo formato (separado)
  countryCode: "+57",
  phoneNumber: "3001234567",
  
  // ⚠️ ALTERNATIVO - Formato legacy
  phone: "573001234567",  // O "+57 300 123 4567"
  
  // ADICIONAL - Para identificación
  country: "CO",
  indicativo: "57",
  
  // REST del usuario
  email: "juan@example.com",
  platform: "WEB"
}
```

---

## 🔧 Extracción de Números en whatsappNotification.js

**Archivo:** `aws-lambda-notifications/src/gateways/whatsappNotification.js`

### Código Actual (Verificado)

```javascript
async function sendWhatsAppNotification(client, notification) {
  try {
    // ... código previo ...

    // 📱 EXTRACCIÓN DE NÚMERO TELEFÓNICO
    let toSanitized;
    
    if (client.phoneNumber && client.countryCode) {
      // ✅ Preferencia 1: Formato recomendado (separado)
      // +57 + 300 123 4567 → 573001234567
      toSanitized = `${client.countryCode}${client.phoneNumber}`.replace(/[^0-9]/g, "");
      console.log(`ℹ️ Usando formato separado: ${client.countryCode} + ${client.phoneNumber}`);
      
    } else if (client.phone) {
      // ✅ Preferencia 2: Número completo en un campo
      // "+573001234567" o "573001234567" → 573001234567
      toSanitized = String(client.phone).replace(/[^0-9]/g, "");
      console.log(`ℹ️ Usando número legacy: ${client.phone}`);
      
    } else if (client.indicativo && client.phoneNumber) {
      // ✅ Preferencia 3: Indicativo sin símbolo
      // "57" + "3001234567" → 573001234567
      toSanitized = `${client.indicativo}${client.phoneNumber}`.replace(/[^0-9]/g, "");
      console.log(`ℹ️ Usando indicativo sin símbolo: ${client.indicativo} + ${client.phoneNumber}`);
    }

    if (!toSanitized || toSanitized.length < 7) {
      throw new Error(
        `Número de teléfono inválido para usuario ${client.id}: ${toSanitized} ` +
        `(countryCode: ${client.countryCode}, phoneNumber: ${client.phoneNumber}, phone: ${client.phone})`
      );
    }

    console.log(`✅ Número sanitizado: ${toSanitized}`);

    // Llamar API de WhatsApp
    const response = await axios.post(
      `https://graph.instagram.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: toSanitized, // Solo dígitos: 573001234567
        type: "template",
        template: {
          name: templateName,
          language: {
            code: "es_MX", // Español (se entiende en todos lados)
          },
          components: components,
        },
      },
      {
        headers: {
          "Authorization": `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`✅ Mensaje WhatsApp enviado a ${toSanitized}`);
    return { success: true, messageId: response.data.messages[0].id };
    
  } catch (error) {
    console.error(`❌ Error enviando WhatsApp a ${client.id}:`, error.message);
    throw error;
  }
}
```

---

## 📊 Tabla de Conversión de Formatos

### Ejemplo: Usuario en Colombia

```
CLIENT TABLE:
{
  id: "user-colombia-1",
  countryCode: "+57",        // Con símbolo
  phoneNumber: "3001234567", // Sin símbolo
  phone: null
}

SANITIZACIÓN EN GATEWAY:
"${countryCode}${phoneNumber}".replace(/[^0-9]/g, "")
= "+573001234567".replace(/[^0-9]/g, "")
= "573001234567"

ENVÍO A META:
{
  "to": "573001234567",     // ✅ Solo dígitos
  "template": { "name": "event_invitation", ... }
}
```

### Ejemplo: Usuario en USA

```
CLIENT TABLE:
{
  id: "user-usa-1",
  countryCode: "+1",
  phoneNumber: "2125551234",  // Ejemplo NYC
  phone: null
}

SANITIZACIÓN:
"+12125551234".replace(/[^0-9]/g, "")
= "12125551234"

META:
{
  "to": "12125551234"
}
```

### Ejemplo: Usuario en España

```
CLIENT TABLE:
{
  id: "user-spain-1",
  countryCode: "+34",
  phoneNumber: "912345678",   // Incluye código de ciudad
  phone: null
}

SANITIZACIÓN:
"+34912345678".replace(/[^0-9]/g, "")
= "34912345678"

META:
{
  "to": "34912345678"
}
```

---

## 🔍 Validación de Número Telefónico

Agregar en `whatsappNotification.js`:

```javascript
/**
 * Valida que un número tenga estructura correcta
 * @param {string} sanitized - Número sin símbolos (ej: 573001234567)
 * @returns {boolean} - true si es válido
 */
function isValidWhatsAppNumber(sanitized) {
  // Debe tener entre 7 y 15 dígitos (estándar ITU-T E.164)
  if (!sanitized || !/^\d{7,15}$/.test(sanitized)) {
    return false;
  }
  
  // Validaciones opcionales por país
  const countryCodes = {
    "57":   { min: 7, max: 10 },  // Colombia
    "52":   { min: 7, max: 10 },  // México
    "54":   { min: 7, max: 10 },  // Argentina
    "34":   { min: 7, max: 10 },  // España
    "1":    { min: 10, max: 10 }, // USA/Canada
    "56":   { min: 7, max: 10 },  // Chile
    "51":   { min: 7, max: 10 },  // Perú
    "55":   { min: 7, max: 12 },  // Brasil
  };
  
  for (const [code, rules] of Object.entries(countryCodes)) {
    if (sanitized.startsWith(code)) {
      const localPart = sanitized.substring(code.length);
      if (localPart.length < rules.min || localPart.length > rules.max) {
        return false;
      }
    }
  }
  
  return true;
}

// En sendWhatsAppNotification:
if (!isValidWhatsAppNumber(toSanitized)) {
  throw new Error(
    `Número de WhatsApp inválido: ${toSanitized} ` +
    `(Usuario: ${client.id}, País estimado: ${client.countryCode})`
  );
}
```

---

## ✅ Checklist: Indicativos por País

### Obtención de Indicativos

- [ ] Tabla Client/Users tiene campo `countryCode`
- [ ] Tabla Client/Users tiene campo `phoneNumber`
- [ ] Field `countryCode` incluye símbolo "+" o solo dígitos (validar que es consistente)
- [ ] Field `phoneNumber` no incluye símbolo "+"
- [ ] Validación en lugar de creación del usuario requiere ambos campos
- [ ] Plan de migración para usuarios legacy con solo campo `phone`

### Código de whatsappNotification.js

- [ ] Importar/actualizar lógica de extracción de indicativo
- [ ] Agregar función `isValidWhatsAppNumber`
- [ ] Agregar logs descriptivos (ej: "Usando formato separado:")
- [ ] Manejo de errores para números faltantes o inválidos
- [ ] Testing con al menos 5 países

### Testing por País

```bash
# Colombia
curl -X POST ... -d '{ "countryCode": "+57", "phoneNumber": "3001234567" }'
# Esperado: to = "573001234567"

# USA
curl -X POST ... -d '{ "countryCode": "+1", "phoneNumber": "2125551234" }'
# Esperado: to = "12125551234"

# Brasil
curl -X POST ... -d '{ "countryCode": "+55", "phoneNumber": "11987654321" }'
# Esperado: to = "5511987654321"

# España
curl -X POST ... -d '{ "countryCode": "+34", "phoneNumber": "912345678" }'
# Esperado: to = "34912345678"

# Chile
curl -X POST ... -d '{ "countryCode": "+56", "phoneNumber": "922345678" }'
# Esperado: to = "56922345678"
```

---

## 🔄 Migración de Usuarios Legacy

Para usuarios que solo tienen campo `phone`:

```javascript
// En searchUsers.js o función similar
async function migratePhoneNumber(user) {
  if (user.phone && !user.countryCode) {
    // Deducir país del formato del número
    const phone = String(user.phone).replace(/[^0-9]/g, "");
    
    if (phone.startsWith("57")) {
      user.countryCode = "+57";
      user.phoneNumber = phone.substring(2);
    } else if (phone.startsWith("52")) {
      user.countryCode = "+52";
      user.phoneNumber = phone.substring(2);
    } else if (phone.startsWith("1")) {
      user.countryCode = "+1";
      user.phoneNumber = phone.substring(1);
    }
    // ... etc para cada país ...
    
    // Actualizar en BD
    await updateUserPhone(user.id, {
      countryCode: user.countryCode,
      phoneNumber: user.phoneNumber,
    });
  }
  
  return user;
}
```

---

## 🌐 API de Validación (Opcional)

Puede usar servicios como:

1. **libphonenumber.js** (Google)
```bash
npm install libphonenumber-js
```
```javascript
import { parsePhoneNumber } from "libphonenumber-js";

const phoneNumber = parsePhoneNumber("+57 300 123 4567");
console.log(phoneNumber.country); // "CO"
console.log(phoneNumber.national); // "300 123 4567"
console.log(phoneNumber.E164); // "+573001234567"
```

2. **Twilio Lookup API**
```javascript
const twilio = require("twilio");
const client = twilio(accountSid, authToken);

const phoneNumber = await client.lookups.v1
  .phoneNumbers("+573001234567")
  .fetch({ type: "carrier" });

console.log(phoneNumber.countryCode); // "CO"
```

---

## 🚀 Deployment

1. **Actualizar whatsappNotification.js** con lógica mejorada
2. **Validar estructura de Client table** (campos countryCode, phoneNumber)
3. **Testear con 5+ países** antes de producción
4. **Agregar alarmas CloudWatch** para números inválidos
5. **Ejecutar script de migración** para usuarios legacy

---

## 📋 Troubleshooting

### Error: "Invalid recipient parameter"
- ❌ Número tiene símbolos: "+57 300 123 4567"
- ✅ Solución: Aplicar `.replace(/[^0-9]/g, "")`

### Error: "Recipient number did not process"
- ❌ Indicativo incorrecto: "573001234567" debería ser "573001234567" (validar país)
- ✅ Solución: Verificar `client.countryCode` es correcto para el país

### Error: "Recipient number not registered"
- ❌ Número sin WhatsApp activado o no existe
- ✅ Solución: El número es correcto, el usuario simplemente no tiene WhatsApp

### Logs no muestran país
- ❌ Campo `countryCode` no existe en client
- ✅ Solución: Actualizar tabla Client o agregar parámetro en llamada

---

## 📊 Monitoreo

### CloudWatch Query
```
fields @timestamp, @message, client.id, client.countryCode, client.phoneNumber
| filter @message like /Usando formato/
| stats count() as total by client.countryCode
```

### Métricas Recomendadas
- Notificaciones por país (countryCode)
- Tasa de error de números inválidos
- Tiempo promedio de sanitización (< 1ms)

---

Última actualización: 25 de Enero, 2026

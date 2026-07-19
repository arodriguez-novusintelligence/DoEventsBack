# 💰 Guía de Integración Frontend - Servicio de Reembolsos

## 📋 Información General

**Servicio:** Reembolso de Boletas  
**Base URL:** `https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com`  
**Versión:** 2.0.0  
**Fecha:** Enero 19, 2026

---

## 🔗 Endpoints Disponibles

### 1. Validar Elegibilidad de Reembolso

Verifica si un usuario puede solicitar reembolso para un evento.

**Endpoint:** `POST /canRequestRefund/{eventId}`

**Request:**
```http
POST https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com/canRequestRefund/{eventId}
Content-Type: application/json

{
  "userId": "46b7f861-630e-4304-a8b0-d6fafd4a54ce",
  "orderId": "order-abc-123",
  "currentDate": "20260119"
}
```

**Response Success (200):**
```json
{
  "success": true,
  "data": {
    "canRequestRefund": true,
    "reason": "Puedes solicitar reembolso. Faltan 25 días para el evento (mínimo requerido: 7 días)",
    "eventId": "fc9edc72-23d8-4904-beb5-5a726c1bb1b6",
    "eventName": "Concierto Rock 2026",
    "eventDate": "20260315",
    "refundCategory": "7",
    "daysUntilEvent": 25,
    "orderStatus": "APPROVED"
  }
}
```

**Response Not Eligible (200):**
```json
{
  "success": true,
  "data": {
    "canRequestRefund": false,
    "reason": "No puedes solicitar reembolso. Faltan 3 días para el evento (mínimo requerido: 7 días de anticipación)",
    "eventId": "fc9edc72-23d8-4904-beb5-5a726c1bb1b6",
    "daysUntilEvent": 3
  }
}
```

**Categorías de Reembolso:**
- `"30"`: Reembolso hasta 30 días antes
- `"7"`: Reembolso hasta 7 días antes
- `"1"`: Reembolso hasta 1 día antes
- `"0"`: Reembolso hasta el día del evento
- `"N"`: No permite reembolsos

---

### 2. Procesar Reembolso

Ejecuta el reembolso de boletas (total o parcial).

**Endpoint:** `POST /processRefund`

#### Caso 1: Reembolso Total (todas las boletas)

**Request:**
```http
POST https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com/processRefund
Content-Type: application/json

{
  "userId": "46b7f861-630e-4304-a8b0-d6fafd4a54ce",
  "orderId": "order-abc-123",
  "reason": "No podré asistir al evento"
}
```

#### Caso 2: Reembolso Parcial (boletas específicas)

**Request:**
```http
POST https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com/processRefund
Content-Type: application/json

{
  "userId": "46b7f861-630e-4304-a8b0-d6fafd4a54ce",
  "orderId": "order-abc-123",
  "ticketInstanceIds": [
    "ticket-001-instance",
    "ticket-002-instance"
  ],
  "reason": "Cambio de planes - reembolso parcial"
}
```

**Response Success - Reembolso Total (200):**
```json
{
  "success": true,
  "message": "Reembolso total procesado exitosamente",
  "duplicate": false,
  "data": {
    "refundId": "550e8400-e29b-41d4-a716-446655440000",
    "orderId": "order-abc-123",
    "refundType": "FULL",
    "refundStatus": "PENDING",
    "ticketsRefunded": 3,
    "refundAmount": 150000,
    "currency": "COP",
    "orderNewStatus": "CANCELLED",
    "ticketDetails": [
      {
        "ticketInstanceId": "ticket-001-instance",
        "category": "VIP",
        "seat": "A-10",
        "price": 50000
      },
      {
        "ticketInstanceId": "ticket-002-instance",
        "category": "VIP",
        "seat": "A-11",
        "price": 50000
      },
      {
        "ticketInstanceId": "ticket-003-instance",
        "category": "General",
        "seat": "B-5",
        "price": 50000
      }
    ],
    "eventDetails": {
      "eventId": "event-789",
      "eventName": "Concierto Rock 2026",
      "eventDate": "20260315"
    }
  }
}
```

**Response Success - Reembolso Parcial (200):**
```json
{
  "success": true,
  "message": "Reembolso parcial procesado exitosamente",
  "duplicate": false,
  "data": {
    "refundId": "550e8400-e29b-41d4-a716-446655440001",
    "orderId": "order-abc-123",
    "refundType": "PARTIAL",
    "refundStatus": "PENDING",
    "ticketsRefunded": 2,
    "refundAmount": 100000,
    "currency": "COP",
    "orderNewStatus": "PARTIALLY_REFUNDED",
    "ticketDetails": [
      {
        "ticketInstanceId": "ticket-001-instance",
        "category": "VIP",
        "seat": "A-10",
        "price": 50000
      },
      {
        "ticketInstanceId": "ticket-002-instance",
        "category": "VIP",
        "seat": "A-11",
        "price": 50000
      }
    ]
  }
}
```

**Response Idempotente (200):**
```json
{
  "success": true,
  "message": "Reembolso ya procesado previamente (PENDING)",
  "duplicate": true,
  "data": {
    "refundId": "550e8400-e29b-41d4-a716-446655440000",
    "orderId": "order-abc-123",
    "refundType": "FULL",
    "refundStatus": "PENDING",
    "ticketsRefunded": 3,
    "refundAmount": 150000,
    "processedAt": "2026-01-19T14:30:00.000Z"
  }
}
```

---

## ❌ Manejo de Errores

### Errores Comunes

#### 1. Parámetros Faltantes (400)
```json
{
  "success": false,
  "message": "userId y orderId son requeridos"
}
```

#### 2. Orden No Encontrada (404)
```json
{
  "success": false,
  "message": "Orden no encontrada o no existe"
}
```

#### 3. No Autorizado (403)
```json
{
  "success": false,
  "message": "Esta orden no pertenece al usuario especificado"
}
```

#### 4. Estado Inválido (400)
```json
{
  "success": false,
  "message": "Solo se pueden reembolsar órdenes con estado APPROVED. Estado actual: PENDING"
}
```

#### 5. Tickets No Encontrados (404)
```json
{
  "success": false,
  "message": "No se encontraron tickets válidos para reembolsar",
  "error": "No se encontraron tickets con estado SOLD para esta orden"
}
```

#### 6. Tickets Inválidos (400)
```json
{
  "success": false,
  "message": "Uno o más tickets especificados no pertenecen a esta orden o no están disponibles para reembolso"
}
```

#### 7. Error Interno (500)
```json
{
  "success": false,
  "message": "Error procesando el reembolso",
  "error": "Detalles técnicos del error"
}
```

---

## 💻 Ejemplos de Código

### React (con Hooks)

```typescript
// hooks/useRefund.ts
import { useState } from 'react';
import axios from 'axios';

const API_BASE_URL = 'https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com';

interface RefundEligibility {
  canRequestRefund: boolean;
  reason: string;
  daysUntilEvent?: number;
  refundCategory?: string;
}

interface RefundResult {
  refundId: string;
  refundType: 'FULL' | 'PARTIAL';
  refundStatus: 'PENDING' | 'COMPLETED' | 'REJECTED';
  ticketsRefunded: number;
  refundAmount: number;
  currency: string;
  duplicate: boolean;
}

export const useRefund = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkEligibility = async (
    userId: string,
    orderId: string,
    eventId: string
  ): Promise<RefundEligibility | null> => {
    setLoading(true);
    setError(null);

    try {
      const currentDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      
      const response = await axios.post(
        `${API_BASE_URL}/canRequestRefund/${eventId}`,
        {
          userId,
          orderId,
          currentDate,
        }
      );

      if (response.data.success) {
        return response.data.data;
      }

      setError(response.data.message);
      return null;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error verificando elegibilidad');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const processRefund = async (
    userId: string,
    orderId: string,
    ticketInstanceIds?: string[],
    reason?: string
  ): Promise<RefundResult | null> => {
    setLoading(true);
    setError(null);

    try {
      const response = await axios.post(`${API_BASE_URL}/processRefund`, {
        userId,
        orderId,
        ...(ticketInstanceIds && { ticketInstanceIds }),
        ...(reason && { reason }),
      });

      if (response.data.success) {
        return {
          ...response.data.data,
          duplicate: response.data.duplicate || false,
        };
      }

      setError(response.data.message);
      return null;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error procesando reembolso');
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    checkEligibility,
    processRefund,
  };
};
```

**Componente de UI:**

```tsx
// components/RefundModal.tsx
import React, { useState, useEffect } from 'react';
import { useRefund } from '../hooks/useRefund';

interface RefundModalProps {
  userId: string;
  orderId: string;
  eventId: string;
  tickets: Array<{ id: string; category: string; seat: string; price: number }>;
  onClose: () => void;
  onSuccess: (refundId: string) => void;
}

export const RefundModal: React.FC<RefundModalProps> = ({
  userId,
  orderId,
  eventId,
  tickets,
  onClose,
  onSuccess,
}) => {
  const { loading, error, checkEligibility, processRefund } = useRefund();
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [eligibilityReason, setEligibilityReason] = useState<string>('');
  const [selectedTickets, setSelectedTickets] = useState<string[]>([]);
  const [refundType, setRefundType] = useState<'full' | 'partial'>('full');
  const [reason, setReason] = useState('');
  const [step, setStep] = useState<'check' | 'select' | 'confirm' | 'success'>('check');

  useEffect(() => {
    checkRefundEligibility();
  }, []);

  const checkRefundEligibility = async () => {
    const result = await checkEligibility(userId, orderId, eventId);
    if (result) {
      setEligible(result.canRequestRefund);
      setEligibilityReason(result.reason);
      if (result.canRequestRefund) {
        setStep('select');
      }
    }
  };

  const handleRefundTypeChange = (type: 'full' | 'partial') => {
    setRefundType(type);
    if (type === 'full') {
      setSelectedTickets([]);
    }
  };

  const handleTicketToggle = (ticketId: string) => {
    setSelectedTickets((prev) =>
      prev.includes(ticketId)
        ? prev.filter((id) => id !== ticketId)
        : [...prev, ticketId]
    );
  };

  const calculateRefundAmount = () => {
    if (refundType === 'full') {
      return tickets.reduce((sum, t) => sum + t.price, 0);
    }
    return tickets
      .filter((t) => selectedTickets.includes(t.id))
      .reduce((sum, t) => sum + t.price, 0);
  };

  const handleSubmitRefund = async () => {
    const ticketIds = refundType === 'partial' ? selectedTickets : undefined;
    const result = await processRefund(userId, orderId, ticketIds, reason);

    if (result) {
      if (result.duplicate) {
        alert('Este reembolso ya fue procesado anteriormente');
      }
      setStep('success');
      setTimeout(() => {
        onSuccess(result.refundId);
        onClose();
      }, 3000);
    }
  };

  if (loading && step === 'check') {
    return (
      <div className="modal">
        <div className="modal-content">
          <h2>Verificando elegibilidad...</h2>
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  if (eligible === false) {
    return (
      <div className="modal">
        <div className="modal-content">
          <h2>❌ Reembolso No Disponible</h2>
          <p>{eligibilityReason}</p>
          <button onClick={onClose}>Cerrar</button>
        </div>
      </div>
    );
  }

  if (step === 'select') {
    return (
      <div className="modal">
        <div className="modal-content">
          <h2>💰 Solicitar Reembolso</h2>
          <p className="success-message">✅ {eligibilityReason}</p>

          <div className="refund-type-selector">
            <label>
              <input
                type="radio"
                checked={refundType === 'full'}
                onChange={() => handleRefundTypeChange('full')}
              />
              Reembolso Total ({tickets.length} boletas - ${calculateRefundAmount().toLocaleString()})
            </label>
            <label>
              <input
                type="radio"
                checked={refundType === 'partial'}
                onChange={() => handleRefundTypeChange('partial')}
              />
              Reembolso Parcial (Seleccionar boletas)
            </label>
          </div>

          {refundType === 'partial' && (
            <div className="ticket-list">
              <h3>Selecciona las boletas a reembolsar:</h3>
              {tickets.map((ticket) => (
                <label key={ticket.id} className="ticket-item">
                  <input
                    type="checkbox"
                    checked={selectedTickets.includes(ticket.id)}
                    onChange={() => handleTicketToggle(ticket.id)}
                  />
                  <span>
                    {ticket.category} - {ticket.seat} - ${ticket.price.toLocaleString()}
                  </span>
                </label>
              ))}
              <p className="refund-amount">
                Total a reembolsar: ${calculateRefundAmount().toLocaleString()}
              </p>
            </div>
          )}

          <div className="reason-input">
            <label>Motivo del reembolso (opcional):</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: No podré asistir al evento"
              rows={3}
            />
          </div>

          {error && <p className="error-message">❌ {error}</p>}

          <div className="modal-actions">
            <button onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button
              onClick={() => setStep('confirm')}
              disabled={
                loading ||
                (refundType === 'partial' && selectedTickets.length === 0)
              }
            >
              Continuar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'confirm') {
    return (
      <div className="modal">
        <div className="modal-content">
          <h2>⚠️ Confirmar Reembolso</h2>
          <div className="confirmation-details">
            <p><strong>Tipo:</strong> {refundType === 'full' ? 'Total' : 'Parcial'}</p>
            <p><strong>Boletas:</strong> {refundType === 'full' ? tickets.length : selectedTickets.length}</p>
            <p><strong>Monto:</strong> ${calculateRefundAmount().toLocaleString()}</p>
            {reason && <p><strong>Motivo:</strong> {reason}</p>}
          </div>

          <div className="warning-box">
            <p>⚠️ Esta acción no se puede deshacer</p>
            <p>El reembolso será procesado en 5-7 días hábiles</p>
          </div>

          {error && <p className="error-message">❌ {error}</p>}

          <div className="modal-actions">
            <button onClick={() => setStep('select')} disabled={loading}>
              Volver
            </button>
            <button
              onClick={handleSubmitRefund}
              disabled={loading}
              className="btn-primary"
            >
              {loading ? 'Procesando...' : 'Confirmar Reembolso'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="modal">
        <div className="modal-content success">
          <h2>✅ Reembolso Procesado</h2>
          <p>Tu solicitud de reembolso ha sido procesada exitosamente</p>
          <p className="refund-info">
            El monto de ${calculateRefundAmount().toLocaleString()} será reembolsado en 5-7 días hábiles
          </p>
          <div className="success-icon">✓</div>
        </div>
      </div>
    );
  }

  return null;
};
```

---

### Vue 3 (Composition API)

```typescript
// composables/useRefund.ts
import { ref } from 'vue';
import axios from 'axios';

const API_BASE_URL = 'https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com';

export const useRefund = () => {
  const loading = ref(false);
  const error = ref<string | null>(null);

  const checkEligibility = async (
    userId: string,
    orderId: string,
    eventId: string
  ) => {
    loading.value = true;
    error.value = null;

    try {
      const currentDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      
      const { data } = await axios.post(
        `${API_BASE_URL}/canRequestRefund/${eventId}`,
        { userId, orderId, currentDate }
      );

      return data.success ? data.data : null;
    } catch (err: any) {
      error.value = err.response?.data?.message || 'Error verificando elegibilidad';
      return null;
    } finally {
      loading.value = false;
    }
  };

  const processRefund = async (
    userId: string,
    orderId: string,
    ticketInstanceIds?: string[],
    reason?: string
  ) => {
    loading.value = true;
    error.value = null;

    try {
      const { data } = await axios.post(`${API_BASE_URL}/processRefund`, {
        userId,
        orderId,
        ...(ticketInstanceIds && { ticketInstanceIds }),
        ...(reason && { reason }),
      });

      return data.success ? { ...data.data, duplicate: data.duplicate } : null;
    } catch (err: any) {
      error.value = err.response?.data?.message || 'Error procesando reembolso';
      return null;
    } finally {
      loading.value = false;
    }
  };

  return {
    loading,
    error,
    checkEligibility,
    processRefund,
  };
};
```

**Componente:**

```vue
<!-- RefundModal.vue -->
<template>
  <div v-if="isOpen" class="modal-overlay" @click="closeModal">
    <div class="modal-content" @click.stop>
      <!-- Verificando elegibilidad -->
      <div v-if="loading && step === 'check'" class="loading-state">
        <h2>Verificando elegibilidad...</h2>
        <div class="spinner"></div>
      </div>

      <!-- No elegible -->
      <div v-else-if="!eligible && step === 'check'" class="error-state">
        <h2>❌ Reembolso No Disponible</h2>
        <p>{{ eligibilityReason }}</p>
        <button @click="closeModal">Cerrar</button>
      </div>

      <!-- Selección de tipo de reembolso -->
      <div v-else-if="step === 'select'" class="select-state">
        <h2>💰 Solicitar Reembolso</h2>
        <p class="success-message">✅ {{ eligibilityReason }}</p>

        <div class="refund-type-selector">
          <label>
            <input type="radio" v-model="refundType" value="full" />
            Reembolso Total ({{ tickets.length }} boletas - ${{ totalAmount.toLocaleString() }})
          </label>
          <label>
            <input type="radio" v-model="refundType" value="partial" />
            Reembolso Parcial (Seleccionar boletas)
          </label>
        </div>

        <div v-if="refundType === 'partial'" class="ticket-list">
          <h3>Selecciona las boletas a reembolsar:</h3>
          <label v-for="ticket in tickets" :key="ticket.id" class="ticket-item">
            <input
              type="checkbox"
              :value="ticket.id"
              v-model="selectedTickets"
            />
            <span>{{ ticket.category }} - {{ ticket.seat }} - ${{ ticket.price.toLocaleString() }}</span>
          </label>
          <p class="refund-amount">Total a reembolsar: ${{ refundAmount.toLocaleString() }}</p>
        </div>

        <div class="reason-input">
          <label>Motivo del reembolso (opcional):</label>
          <textarea
            v-model="reason"
            placeholder="Ej: No podré asistir al evento"
            rows="3"
          ></textarea>
        </div>

        <p v-if="error" class="error-message">❌ {{ error }}</p>

        <div class="modal-actions">
          <button @click="closeModal" :disabled="loading">Cancelar</button>
          <button
            @click="step = 'confirm'"
            :disabled="loading || (refundType === 'partial' && selectedTickets.length === 0)"
          >
            Continuar
          </button>
        </div>
      </div>

      <!-- Confirmación -->
      <div v-else-if="step === 'confirm'" class="confirm-state">
        <h2>⚠️ Confirmar Reembolso</h2>
        <div class="confirmation-details">
          <p><strong>Tipo:</strong> {{ refundType === 'full' ? 'Total' : 'Parcial' }}</p>
          <p><strong>Boletas:</strong> {{ refundType === 'full' ? tickets.length : selectedTickets.length }}</p>
          <p><strong>Monto:</strong> ${{ refundAmount.toLocaleString() }}</p>
          <p v-if="reason"><strong>Motivo:</strong> {{ reason }}</p>
        </div>

        <div class="warning-box">
          <p>⚠️ Esta acción no se puede deshacer</p>
          <p>El reembolso será procesado en 5-7 días hábiles</p>
        </div>

        <p v-if="error" class="error-message">❌ {{ error }}</p>

        <div class="modal-actions">
          <button @click="step = 'select'" :disabled="loading">Volver</button>
          <button @click="submitRefund" :disabled="loading" class="btn-primary">
            {{ loading ? 'Procesando...' : 'Confirmar Reembolso' }}
          </button>
        </div>
      </div>

      <!-- Éxito -->
      <div v-else-if="step === 'success'" class="success-state">
        <h2>✅ Reembolso Procesado</h2>
        <p>Tu solicitud de reembolso ha sido procesada exitosamente</p>
        <p class="refund-info">
          El monto de ${{ refundAmount.toLocaleString() }} será reembolsado en 5-7 días hábiles
        </p>
        <div class="success-icon">✓</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRefund } from '../composables/useRefund';

const props = defineProps<{
  isOpen: boolean;
  userId: string;
  orderId: string;
  eventId: string;
  tickets: Array<{ id: string; category: string; seat: string; price: number }>;
}>();

const emit = defineEmits<{
  close: [];
  success: [refundId: string];
}>();

const { loading, error, checkEligibility, processRefund } = useRefund();

const eligible = ref<boolean | null>(null);
const eligibilityReason = ref('');
const selectedTickets = ref<string[]>([]);
const refundType = ref<'full' | 'partial'>('full');
const reason = ref('');
const step = ref<'check' | 'select' | 'confirm' | 'success'>('check');

const totalAmount = computed(() =>
  props.tickets.reduce((sum, t) => sum + t.price, 0)
);

const refundAmount = computed(() => {
  if (refundType.value === 'full') return totalAmount.value;
  return props.tickets
    .filter((t) => selectedTickets.value.includes(t.id))
    .reduce((sum, t) => sum + t.price, 0);
});

onMounted(async () => {
  const result = await checkEligibility(props.userId, props.orderId, props.eventId);
  if (result) {
    eligible.value = result.canRequestRefund;
    eligibilityReason.value = result.reason;
    if (result.canRequestRefund) step.value = 'select';
  }
});

const submitRefund = async () => {
  const ticketIds = refundType.value === 'partial' ? selectedTickets.value : undefined;
  const result = await processRefund(props.userId, props.orderId, ticketIds, reason.value);

  if (result) {
    if (result.duplicate) {
      alert('Este reembolso ya fue procesado anteriormente');
    }
    step.value = 'success';
    setTimeout(() => {
      emit('success', result.refundId);
      closeModal();
    }, 3000);
  }
};

const closeModal = () => {
  emit('close');
};
</script>
```

---

### Angular

```typescript
// services/refund.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

const API_BASE_URL = 'https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com';

export interface RefundEligibility {
  canRequestRefund: boolean;
  reason: string;
  daysUntilEvent?: number;
  refundCategory?: string;
}

export interface RefundResult {
  refundId: string;
  refundType: 'FULL' | 'PARTIAL';
  refundStatus: 'PENDING' | 'COMPLETED' | 'REJECTED';
  ticketsRefunded: number;
  refundAmount: number;
  currency: string;
  duplicate: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class RefundService {
  constructor(private http: HttpClient) {}

  checkEligibility(
    userId: string,
    orderId: string,
    eventId: string
  ): Observable<RefundEligibility> {
    const currentDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    return this.http
      .post<any>(`${API_BASE_URL}/canRequestRefund/${eventId}`, {
        userId,
        orderId,
        currentDate,
      })
      .pipe(
        map((response) => {
          if (response.success) {
            return response.data;
          }
          throw new Error(response.message);
        }),
        catchError((error) => {
          const message = error.error?.message || 'Error verificando elegibilidad';
          return throwError(() => new Error(message));
        })
      );
  }

  processRefund(
    userId: string,
    orderId: string,
    ticketInstanceIds?: string[],
    reason?: string
  ): Observable<RefundResult> {
    const payload: any = { userId, orderId };
    if (ticketInstanceIds) payload.ticketInstanceIds = ticketInstanceIds;
    if (reason) payload.reason = reason;

    return this.http
      .post<any>(`${API_BASE_URL}/processRefund`, payload)
      .pipe(
        map((response) => {
          if (response.success) {
            return {
              ...response.data,
              duplicate: response.duplicate || false,
            };
          }
          throw new Error(response.message);
        }),
        catchError((error) => {
          const message = error.error?.message || 'Error procesando reembolso';
          return throwError(() => new Error(message));
        })
      );
  }
}
```

---

## 🎨 Estados de UI Recomendados

### 1. Botón de Reembolso

**Estados:**
- **Hidden**: Si el evento no permite reembolsos (categoría "N")
- **Disabled + Tooltip**: Si aún no es elegible (días insuficientes)
- **Enabled**: Si cumple condiciones

```tsx
<button
  className="refund-button"
  disabled={!canRefund}
  onClick={openRefundModal}
  title={!canRefund ? 'Reembolso no disponible en este momento' : ''}
>
  💰 Solicitar Reembolso
</button>
```

### 2. Badge de Estado de Orden

```tsx
{order.refund_status === 'PENDING' && (
  <span className="badge badge-warning">
    ⏳ Reembolso en Proceso
  </span>
)}

{order.status === 'CANCELLED' && (
  <span className="badge badge-secondary">
    ❌ Orden Cancelada
  </span>
)}

{order.status === 'PARTIALLY_REFUNDED' && (
  <span className="badge badge-info">
    🔄 Reembolso Parcial
  </span>
)}
```

### 3. Timeline de Reembolso

```tsx
<div className="refund-timeline">
  <div className="timeline-step completed">
    <div className="step-icon">✓</div>
    <div className="step-content">
      <h4>Solicitud Recibida</h4>
      <p>{new Date(refund.createdAt).toLocaleString()}</p>
    </div>
  </div>
  
  <div className={`timeline-step ${refund.status === 'PENDING' ? 'active' : 'completed'}`}>
    <div className="step-icon">⏳</div>
    <div className="step-content">
      <h4>En Proceso</h4>
      <p>Validando solicitud</p>
    </div>
  </div>
  
  <div className={`timeline-step ${refund.status === 'COMPLETED' ? 'completed' : ''}`}>
    <div className="step-icon">💰</div>
    <div className="step-content">
      <h4>Reembolso Completado</h4>
      <p>5-7 días hábiles</p>
    </div>
  </div>
</div>
```

---

## ✅ Validaciones del Cliente

### Antes de Mostrar el Botón

```typescript
function canShowRefundButton(order: Order, event: Event): boolean {
  // 1. Orden debe estar aprobada
  if (order.status !== 'APPROVED') return false;
  
  // 2. Evento no debe estar cancelado
  if (event.status === 'CANCELLED') return false;
  
  // 3. Evento debe tener categoría de reembolso
  if (!event.categoriaReembolso) return false;
  
  // 4. Categoría no puede ser "N"
  if (event.categoriaReembolso === 'N') return false;
  
  // 5. Evento no debe haber pasado
  const eventDate = parseDate(event.fechaIni);
  if (eventDate < new Date()) return false;
  
  return true;
}
```

### Validación de Elegibilidad

```typescript
function calculateDaysUntilEvent(eventDate: string): number {
  const event = parseDate(eventDate); // YYYYMMDD format
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const diffTime = event.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

function isEligibleForRefund(
  eventDate: string,
  refundCategory: string
): { eligible: boolean; reason: string } {
  const daysUntil = calculateDaysUntilEvent(eventDate);
  const requiredDays = parseInt(refundCategory);
  
  if (daysUntil >= requiredDays) {
    return {
      eligible: true,
      reason: `Puedes solicitar reembolso. Faltan ${daysUntil} días para el evento`,
    };
  }
  
  return {
    eligible: false,
    reason: `No puedes solicitar reembolso. Se requieren al menos ${requiredDays} días de anticipación`,
  };
}
```

---

## 🔔 Notificaciones al Usuario

### Mensajes de Éxito

```typescript
// Reembolso total
toast.success(
  `✅ Reembolso procesado exitosamente\n` +
  `Monto: $${refund.refundAmount.toLocaleString()}\n` +
  `Será acreditado en 5-7 días hábiles`
);

// Reembolso parcial
toast.success(
  `✅ Reembolso parcial procesado\n` +
  `${refund.ticketsRefunded} boletas reembolsadas\n` +
  `Monto: $${refund.refundAmount.toLocaleString()}`
);

// Duplicado (idempotencia)
toast.info(
  `ℹ️ Este reembolso ya fue procesado anteriormente\n` +
  `Estado: ${refund.refundStatus}`
);
```

### Mensajes de Error

```typescript
// Error de autorización
toast.error('❌ No tienes permiso para reembolsar esta orden');

// Error de estado
toast.error('❌ Solo se pueden reembolsar órdenes aprobadas');

// Error de tickets
toast.error('❌ Los tickets seleccionados no son válidos');

// Error general
toast.error('❌ Error procesando el reembolso. Intenta nuevamente');
```

---

## 📱 Experiencia de Usuario Recomendada

### Flujo Completo

1. **Botón en Detalle de Orden**
   ```
   [Mis Órdenes] → [Orden #123] → [Botón: Solicitar Reembolso]
   ```

2. **Verificación Automática**
   - Mostrar spinner "Verificando elegibilidad..."
   - Si no es elegible: Mostrar mensaje y cerrar
   - Si es elegible: Continuar al paso 3

3. **Selección de Tipo**
   - Radio: Total o Parcial
   - Si parcial: Checkboxes de boletas
   - Mostrar monto calculado en tiempo real

4. **Campo de Motivo** (opcional)
   - Textarea con placeholder
   - Max 500 caracteres

5. **Confirmación**
   - Resumen de selección
   - Warning: "No se puede deshacer"
   - Botón primario: "Confirmar Reembolso"

6. **Procesamiento**
   - Deshabilitar botones
   - Mostrar spinner
   - Mensaje: "Procesando..."

7. **Resultado**
   - Éxito: Confetti + Mensaje + Redirect (3s)
   - Error: Toast + Mantener modal abierto

---

## 🎯 Best Practices

### 1. Idempotencia en el Cliente

```typescript
// Almacenar refundId después de procesamiento exitoso
const processedRefunds = new Set(
  JSON.parse(localStorage.getItem('processedRefunds') || '[]')
);

if (processedRefunds.has(orderId)) {
  // Mostrar mensaje: "Ya solicitaste reembolso para esta orden"
  return;
}

// Después de éxito
processedRefunds.add(orderId);
localStorage.setItem('processedRefunds', JSON.stringify([...processedRefunds]));
```

### 2. Manejo de Carga

```typescript
// Debounce para múltiples clicks
const [isSubmitting, setIsSubmitting] = useState(false);

const handleSubmit = async () => {
  if (isSubmitting) return; // Prevenir doble-submit
  
  setIsSubmitting(true);
  try {
    await processRefund(...);
  } finally {
    setIsSubmitting(false);
  }
};
```

### 3. Validación de Tickets

```typescript
// Validar que tickets seleccionados sean válidos
const validateTicketSelection = (
  selectedIds: string[],
  availableTickets: Ticket[]
): boolean => {
  return selectedIds.every(id => 
    availableTickets.some(t => t.id === id && t.status === 'SOLD')
  );
};
```

### 4. Formateo de Moneda

```typescript
const formatCurrency = (amount: number, currency: string = 'COP'): string => {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
  }).format(amount);
};
```

---

## 🔍 Testing

### Pruebas Manuales

1. **Caso: Reembolso Total Exitoso**
   ```
   - Orden con 3 boletas APPROVED
   - Evento en 15 días (categoría "7")
   - Resultado esperado: Reembolso FULL procesado
   ```

2. **Caso: Reembolso Parcial**
   ```
   - Orden con 5 boletas
   - Seleccionar 2 boletas
   - Resultado esperado: Reembolso PARTIAL, 3 boletas quedan
   ```

3. **Caso: No Elegible**
   ```
   - Evento en 3 días (categoría "7")
   - Resultado esperado: Mensaje de no elegibilidad
   ```

4. **Caso: Idempotencia**
   ```
   - Procesar reembolso
   - Intentar procesar nuevamente
   - Resultado esperado: Mensaje de duplicado, no se procesa
   ```

### Datos de Prueba

```typescript
const TEST_DATA = {
  userId: '46b7f861-630e-4304-a8b0-d6fafd4a54ce',
  orderId: 'order-test-123',
  eventId: 'fc9edc72-23d8-4904-beb5-5a726c1bb1b6',
  tickets: [
    { id: 'ticket-001', category: 'VIP', seat: 'A-10', price: 50000 },
    { id: 'ticket-002', category: 'VIP', seat: 'A-11', price: 50000 },
    { id: 'ticket-003', category: 'General', seat: 'B-5', price: 30000 },
  ],
};
```

---

## 📚 Recursos Adicionales

- **Endpoint Base:** `https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com`
- **Documentación Backend:** [REFUND_SERVICE_README.md](./REFUND_SERVICE_README.md)
- **Migración a ticketsCancelation:** [MIGRACION_TICKETSCANCELATION.md](./MIGRACION_TICKETSCANCELATION.md)

---

## 🆘 Soporte

**Equipo Backend:** DoEvents Backend Team  
**Fecha:** Enero 19, 2026  
**Versión API:** 2.0.0


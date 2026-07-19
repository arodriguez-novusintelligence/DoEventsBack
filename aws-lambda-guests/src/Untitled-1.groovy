
  %% ===========================
  %% USUARIO
  %% ===========================
  USER {
    string userId PK
    string email
    string displayName
    string phone
    string documentId
    string locale
    string role
    string status
    date   createdAt
    date   updatedAt
    string createdBy
    string updatedBy
  }

  %% ===========================
  %% EVENTO
  %% ===========================
  EVENT {
    string eventId PK
    string organizerUserId FK
    string name
    string slug
    string type
    string category
    string tags
    string country
    string city
    string address
    string postalCode
    string timezone
    date   startDate
    date   endDate
    string visibility
    boolean skipVenue
    string venueId FK
    string layoutId FK
    int    capacityPlan
    string currency
    string media
    string faq
    string policies
    date   salesStartAt
    date   salesEndAt
    date   publishAt
    string status
    date   createdAt
    date   updatedAt
    string createdBy
    string updatedBy
  }

  %% ===========================
  %% VENUE (reutilizable)
  %% ===========================
  VENUE {
    string venueId PK
    string ownerUserId FK
    string name
    string type
    int    capacity
    string country
    string city
    string address
    string address2
    string postalCode
    string timezone
    string geo
    string amenities
    string images
    string tags
    boolean isTemplate
    string visibility
    string status
    int    usageCount
    int    floorplanVersion
    date   createdAt
    date   updatedAt
    string createdBy
    string updatedBy
  }

  %% ===========================
  %% TAXONOMÍA VENUE
  %% ===========================
  VENUE_CATEGORY {
    string  categoryId PK
    string  venueId FK
    string  name
    string  color
    int     level
    int     sortOrder
    string  gateId FK
    string  gateName
    string  config
    boolean isAccessibleZone
    date    createDate
    string  createdBy
  }

  VENUE_SECTION {
    string  sectionId PK
    string  categoryId FK
    string  name
    string  position
    int     rows
    int     seatsPerRow
    int     capacity
    int     sortOrder
  }

  VENUE_SEAT {
    string  seatId PK
    string  sectionId FK
    string  categoryId FK
    string  venueId FK
    string  rowLabel
    int     colNumber
    string  seatCode
    string  seatType
    string  status
    boolean isAccessible
    int     relX
    int     relY
    string  notes
  }

  %% ===========================
  %% LAYOUT AD-HOC (skip venue)
  %% ===========================
  EVENT_LAYOUT {
    string layoutId PK
    string eventId FK
    string name
    string categories
    string sections
    string seats
    string backgroundImageUrl
    string grid
    string source
    int    version
    date   createdAt
    date   updatedAt
  }

  %% ===========================
  %% SNAPSHOT BOLETERÍA
  %% ===========================
  TICKETS {
    string id PK
    string eventId FK
    string venueId FK
    string layoutId FK
    date   createDate
    date   fechaIniVent
    date   fechaFinVent
    string horaIniVent
    string horaFinVent
    string boleta
    string createdBy
  }

  %% ===========================
  %% CATEGORÍAS OPERATIVAS
  %% ===========================
  TICKET_CATEGORY {
    string  categoryId PK
    string  eventId FK
    string  name
    string  description
    int     price
    string  currency
    int     availableCapacity
    int     reservedTickets
    int     soldTickets
    int     minPerOrder
    int     maxPerOrder
    date    saleStartAt
    date    saleEndAt
    int     serviceFee
    int     taxRate
    boolean transferable
    boolean refundable
    string  preferredGateId
    string  preferredGateName
    string  image
    string  color
    string  status
    date    createdAt
    date    updatedAt
    string  createdBy
    string  updatedBy
  }

  %% ===========================
  %% DISTRIBUCIÓN (corrida)
  %% ===========================
  TICKETS_DISTRIBUTION {
    string distributionId PK
    string eventId FK
    string venueId FK
    string layoutId FK
    string createdBy
    date   createDate
    string source
    int    totalTickets
    int    ticketsAvailable
    int    ticketsSold
    boolean dynamicPricing
    string notes
    string status
    int    version
  }

  %% ===========================
  %% TICKET INDIVIDUAL
  %% ===========================
  DIST_TICKET {
    string  ticketInstanceId PK
    string  distributionId FK
    string  eventId FK
    string  venueId FK
    string  layoutId FK
    string  categoryId FK
    string  sectionId
    string  seatId
    string  seatCode
    int     price
    string  currency
    string  ticketStatus
    string  qrCodeKey
    string  qrHash
    string  barcodeType
    date    redeemedAt
    string  redeemedGateId
    int     checkinCount
    string  ownerId
    string  orderId
    date    createDate
    date    updatedAt
    int     holdTtlEpoch
    string  meta
  }

  %% ===========================
  %% HOLD (bloqueo)
  %% ===========================
  HOLD {
    string  holdId PK
    string  ticketInstanceId FK
    string  eventId FK
    string  userId FK
    string  orderId
    string  sourceChannel
    string  ipAddress
    string  deviceInfo
    string  reason
    date    createdAt
    int     ttlEpoch
    string  status
  }

  %% ===========================
  %% ACCESOS
  %% ===========================
  ACCESS_SETTINGS {
    string accessSettingId PK
    string eventId FK
    string createdBy FK
    string categoriesConfig
    string gatesConfig
    string staffAssignments
    boolean allowReentry
    int     maxEntriesPerTicket
    string  devicePolicy
    string  geoFence
    date    openTime
    date    closeTime
    string  status
    date    createdAt
    date    updatedAt
  }

  ACCESS_GATE {
    string gateId PK
    string eventId FK
    string venueId FK
    string name
    string description
    string entryRules
    string allowedCategories
    int    capacityLimit
    string scanners
    string mode
    string status
    date   createdAt
    string createdBy
  }

  ACCESS_GATE_CATEGORY {
    string id PK
    string gateId FK
    string categoryId FK
    string eventId FK
    boolean isExclusive
    date    windowStart
    date    windowEnd
    int     priority
    date    createdAt
  }

  ACCESS_GATE_STAFF {
    string assignmentId PK
    string gateId FK
    string userId FK
    string role
    string permissions
    date   assignedAt
    date   shiftStart
    date   shiftEnd
    string deviceBoundId
  }

  SCAN_LOG {
    string scanId PK
    string eventId FK
    string venueId FK
    string gateId FK
    string ticketInstanceId FK
    string userId FK
    date   scanTime
    string result
    string reasonCode
    int    latencyMs
    boolean offlineCached
    string ticketStatusBefore
    string ticketStatusAfter
    string device
    string gps
    string appSessionId
    string note
  }

  %% ===========================
  %% ÓRDENES / ITEMS / PAGOS
  %% ===========================
  ORDER {
    string  order_id PK
    string  eventId FK
    string  userId FK
    string  email
    string  phone
    string  payment_status
    int     tickets_count
    string  channel
    int     subtotal
    int     taxTotal
    int     feeTotal
    int     discountTotal
    int     total
    string  currency
    string  couponId
    string  promotionId
    string  ipAddress
    string  userAgent
    string  reconciliationId
    string  settlementStatus
    date    settlementAt
    date    created_at
    int     created_at_ts
    int     expiration_window_seconds
    date    expires_at
    string  expiration
    string  snapshot
  }

  ORDER_ITEM {
    string  item_id PK
    string  order_id FK
    string  eventId FK
    string  ticketInstanceId FK
    string  categoryId FK
    string  sectionId
    string  seatCode
    int     unitPrice
    int     quantity
    int     taxRate
    int     feeAmount
    int     discountAmount
    int     lineTotal
    string  currency
    string  status
    string  meta
  }

  ORDER_PAYMENT {
    string  payment_id PK
    string  order_id FK
    string  eventId FK
    string  provider
    string  method
    string  status
    int     amount
    string  currency
    int     installments
    string  cardBrand
    string  cardLast4
    string  payerDocument
    string  riskLevel
    string  ipAddress
    string  provider_txn_id
    string  authorization_code
    int     feeAmount
    int     taxAmount
    string  receipt_url
    string  failureCode
    string  idempotencyKey
    date    created_at
    date    captured_at
    date    updated_at
    string  refund_history
  }

  %% ===========================
  %% RELACIONES
  %% ===========================
  USER ||--o{ ORDER : places
  USER ||--o{ ACCESS_GATE_STAFF : assigned_to

  EVENT ||--o{ TICKETS : has_config
  EVENT ||--o{ EVENT_LAYOUT : defines_layout_when_skipVenue
  EVENT ||--o{ TICKETS_DISTRIBUTION : runs
  EVENT ||--o{ ACCESS_GATE : controls
  EVENT ||--|| ACCESS_SETTINGS : has_access_control
  EVENT ||--o{ SCAN_LOG : logs
  EVENT ||--o{ ORDER : receives

  VENUE ||--o{ VENUE_CATEGORY : groups
  VENUE_CATEGORY ||--o{ VENUE_SECTION : contains
  VENUE_SECTION ||--o{ VENUE_SEAT : has

  VENUE ||--o{ ACCESS_GATE : located_at
  VENUE ||--o{ TICKETS_DISTRIBUTION : for

  EVENT_LAYOUT ||--o{ TICKETS_DISTRIBUTION : used_by

  TICKETS ||--o{ TICKET_CATEGORY : projects_to

  TICKETS_DISTRIBUTION ||--o{ DIST_TICKET : materializes
  TICKET_CATEGORY ||--o{ DIST_TICKET : classifies
  VENUE_SECTION ||--o{ DIST_TICKET : optional_section_ref
  VENUE_SEAT ||--o{ DIST_TICKET : optional_seat_ref
  DIST_TICKET ||--o{ HOLD : may_have

  ACCESS_SETTINGS ||--o{ ACCESS_GATE : defines_gates
  ACCESS_SETTINGS ||--o{ ACCESS_GATE_STAFF : assigns_staff
  ACCESS_SETTINGS ||--o{ ACCESS_GATE_CATEGORY : links_category_gate
  TICKET_CATEGORY ||--o{ ACCESS_GATE_CATEGORY : allowed_on
  ACCESS_GATE ||--o{ ACCESS_GATE_STAFF : staffed_by

  ORDER ||--o{ ORDER_ITEM : contains
  ORDER ||--o{ ORDER_PAYMENT : paid_by
  ORDER_ITEM ||--|| DIST_TICKET : references
  
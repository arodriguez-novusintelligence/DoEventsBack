# DynamoDB Structure Export

- GeneratedAt: 2026-04-13T14:25:45.483Z
- Region: us-east-1
- TableCount: 71
- InferItems: no

## AccessLogs

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 2
- SizeBytes: 185
- Hash/Range Keys: event_id(HASH), log_id(RANGE)
- GSIs: ticket_id-index, event_id-status-index, event_id-access_time-index
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## Bancos

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 3
- SizeBytes: 181
- Hash/Range Keys: id(HASH)
- GSIs: id_country-index
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## BlockUser

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 0
- SizeBytes: 0
- Hash/Range Keys: userId(HASH)
- GSIs: none
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## ChatMessage

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 1123
- SizeBytes: 399434
- Hash/Range Keys: id(HASH), createdAt(RANGE)
- GSIs: RoomIndex
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## ChatMessageIdempotency

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 81
- SizeBytes: 28191
- Hash/Range Keys: idempotencyKey(HASH)
- GSIs: none
- LSIs: none
- TTL: ENABLED
- PITR: DISABLED

## Chats

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 311
- SizeBytes: 84449
- Hash/Range Keys: id(HASH), updatedAt(RANGE)
- GSIs: roomId-index, event-index, event-updatedAt-index
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## CheckoutTicket

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 30
- SizeBytes: 8059
- Hash/Range Keys: ticket_id(HASH)
- GSIs: qr_code-index, user_id-event_id-index, event_id-status-index, order_id-index, event_id-ticketName-index
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## Cities

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 129681
- SizeBytes: 4074372
- Hash/Range Keys: id(HASH)
- GSIs: id_state-index
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## Client

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 31
- SizeBytes: 12756
- Hash/Range Keys: id(HASH)
- GSIs: PlatformUserIdIndex, EmailIndex, userIndex, PhoneIndex
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## Comments

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 1
- SizeBytes: 110
- Hash/Range Keys: comment_id(HASH)
- GSIs: none
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## Countries

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 214
- SizeBytes: 3784
- Hash/Range Keys: id(HASH)
- GSIs: none
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## DatosBancarios

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 273
- SizeBytes: 162850
- Hash/Range Keys: id(HASH)
- GSIs: UserIdIndex
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## DeviceData

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 70
- SizeBytes: 19842
- Hash/Range Keys: deviceId(HASH)
- GSIs: UserIDIndex, CityStartDateIndex
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## doevents-backoffice-dev-sessions

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 0
- SizeBytes: 0
- Hash/Range Keys: PK(HASH)
- GSIs: SessionsByUser
- LSIs: none
- TTL: ENABLED
- PITR: DISABLED

## doevents-backoffice-dev-users

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 6
- SizeBytes: 1676
- Hash/Range Keys: PK(HASH), SK(RANGE)
- GSIs: StatusIndex, EmailIndex, UserIdIndex
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## Ejemplo

- Status: ACTIVE
- BillingMode: unknown
- Items: 0
- SizeBytes: 0
- Hash/Range Keys: id(HASH)
- GSIs: correo-index
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## EventCalification

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 28
- SizeBytes: 5218
- Hash/Range Keys: id(HASH), createdAt(RANGE)
- GSIs: userIdIndex, eventIdIndex
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## EventGroups

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 0
- SizeBytes: 0
- Hash/Range Keys: eventId(HASH), groupId(RANGE)
- GSIs: GSI-order, GSI-groupNAme
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## EventGuests

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 0
- SizeBytes: 0
- Hash/Range Keys: eventId(HASH), guestId(RANGE)
- GSIs: GSI-userId, GSI-email, GSI-phone, GSI-favorite
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## EventInvitations

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 342
- SizeBytes: 211846
- Hash/Range Keys: PK(HASH), SK(RANGE)
- GSIs: EventIdIndex, UserIdIndex
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## Eventos

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 1271
- SizeBytes: 1043406
- Hash/Range Keys: id(HASH)
- GSIs: fechaFin-index, userIdIndex, CiudadFechaIniIndex, venueId-index, CityStartDateIndex, EstatusFechaIndex, slug-index
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## FavoriteGroups

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 3
- SizeBytes: 799
- Hash/Range Keys: userId(HASH), groupId(RANGE)
- GSIs: GSI-groupName
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## FavoriteUsers

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 88
- SizeBytes: 34557
- Hash/Range Keys: userId(HASH), favoriteId(RANGE)
- GSIs: GSI-email, GSI-followers, GSI-phone, GSI-username
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## FeedCommentLikes

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 13
- SizeBytes: 1118
- Hash/Range Keys: commentId(HASH), userId(RANGE)
- GSIs: none
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## FeedComments

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 45
- SizeBytes: 44498
- Hash/Range Keys: id(HASH)
- GSIs: publicationId-sortKey-index
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## FeedIdempotency

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 0
- SizeBytes: 0
- Hash/Range Keys: id(HASH)
- GSIs: none
- LSIs: none
- TTL: ENABLED
- PITR: DISABLED

## FeedMedia

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 141
- SizeBytes: 55830
- Hash/Range Keys: id(HASH)
- GSIs: none
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## FeedPublicationLikes

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 220
- SizeBytes: 20333
- Hash/Range Keys: publicationId(HASH), userId(RANGE)
- GSIs: userId-createdAt-index
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## FeedPublicationReposts

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 15
- SizeBytes: 1369
- Hash/Range Keys: publicationId(HASH), userId(RANGE)
- GSIs: none
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## FeedPublications

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 94
- SizeBytes: 213945
- Hash/Range Keys: id(HASH)
- GSIs: authorId-createdAt-index, visibility-sortKey-index
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## FeedShares

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 10
- SizeBytes: 1330
- Hash/Range Keys: id(HASH)
- GSIs: none
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## FeedTimeline

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 191
- SizeBytes: 136095
- Hash/Range Keys: id(HASH)
- GSIs: feedScope-sortKey-index
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## Followers

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 46
- SizeBytes: 5791
- Hash/Range Keys: follow_id(HASH)
- GSIs: userIdIndex, followUserIdIndex
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## getUserTickets

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 0
- SizeBytes: 0
- Hash/Range Keys: id(HASH)
- GSIs: event_id-created_at-index
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## imagenes

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 492
- SizeBytes: 113601
- Hash/Range Keys: id(HASH)
- GSIs: eventIdIndex
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## Likes

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 1
- SizeBytes: 71
- Hash/Range Keys: like_id(HASH)
- GSIs: none
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## LogEvents

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 2
- SizeBytes: 282
- Hash/Range Keys: rquid(HASH), timestamp(RANGE)
- GSIs: none
- LSIs: none
- TTL: ENABLED
- PITR: DISABLED

## Media

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 0
- SizeBytes: 0
- Hash/Range Keys: media_id(HASH)
- GSIs: none
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## Notifications

- Status: ACTIVE
- BillingMode: unknown
- Items: 6921
- SizeBytes: 4211964
- Hash/Range Keys: userId(HASH), timestamp(RANGE)
- GSIs: id-timestamp-index, type-userId-index, eventId-timestamp-index
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## NotInterested

- Status: ACTIVE
- BillingMode: unknown
- Items: 6
- SizeBytes: 1622
- Hash/Range Keys: id(HASH), createdAt(RANGE)
- GSIs: none
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## Orders

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 391
- SizeBytes: 2203666
- Hash/Range Keys: order_id(HASH)
- GSIs: statusExpiryIndex, eventIdIndex, user_id-created_at-index, event_id-created_at-index
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## OTPCode

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 72
- SizeBytes: 6656
- Hash/Range Keys: userId(HASH)
- GSIs: none
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## Posts

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 1
- SizeBytes: 105
- Hash/Range Keys: post_id(HASH)
- GSIs: none
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## Preferences

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 19
- SizeBytes: 3288
- Hash/Range Keys: preference_id(HASH)
- GSIs: none
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## ProfileComments

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 17
- SizeBytes: 5173
- Hash/Range Keys: id(HASH), createdAt(RANGE)
- GSIs: userIdIndex
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## Reports

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 2
- SizeBytes: 318
- Hash/Range Keys: report_id(HASH)
- GSIs: none
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## Reposts

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 2
- SizeBytes: 149
- Hash/Range Keys: repost_id(HASH)
- GSIs: none
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## RescheduleEvents

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 19
- SizeBytes: 7036
- Hash/Range Keys: id(HASH)
- GSIs: orderIdIndex, eventIdIndex
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## Reservations

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 2
- SizeBytes: 280
- Hash/Range Keys: reservation_id(HASH)
- GSIs: event_id-status-index, user_id-created_at-index
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## Seats

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 5
- SizeBytes: 710
- Hash/Range Keys: event_id(HASH), seat_id(RANGE)
- GSIs: event_id-section-index, event_id-status-index
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## StaffAccess

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 79
- SizeBytes: 27011
- Hash/Range Keys: userId(HASH), sk(RANGE)
- GSIs: AdminEventIndex
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## States

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 1999
- SizeBytes: 61746
- Hash/Range Keys: id(HASH), id_country(RANGE)
- GSIs: id_country-index
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## Tickets

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 430
- SizeBytes: 650869
- Hash/Range Keys: id(HASH)
- GSIs: eventIdIndex
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## ticketsCancelation

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 24
- SizeBytes: 8859
- Hash/Range Keys: id(HASH)
- GSIs: orderIdIndex, eventIdIndex
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## TicketScans

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 90
- SizeBytes: 57427
- Hash/Range Keys: id(HASH)
- GSIs: EventScanAtIndex, TicketIdStatusIndex, EventStatusIndex
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## TicketsDistribution

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 1099
- SizeBytes: 23008209
- Hash/Range Keys: id(HASH), createDate(RANGE)
- GSIs: ticketIdIndex, eventIdIndex
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## TipoEvento

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 22
- SizeBytes: 1821
- Hash/Range Keys: id(HASH)
- GSIs: none
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## TipoLugar

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 50
- SizeBytes: 2673
- Hash/Range Keys: id(HASH)
- GSIs: none
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## UserChannels

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 9
- SizeBytes: 779
- Hash/Range Keys: channelId(HASH), connectionId(RANGE)
- GSIs: ConnectionIndex
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## userFavoriteEvents

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 57
- SizeBytes: 5249
- Hash/Range Keys: userId(HASH), eventId(RANGE)
- GSIs: eventIdIndex
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## UserPreferences

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 56
- SizeBytes: 6043
- Hash/Range Keys: UserId(HASH)
- GSIs: none
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## UserTokens

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 12
- SizeBytes: 2750
- Hash/Range Keys: userId(HASH), token(RANGE)
- GSIs: token-index
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## Usuarios

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 0
- SizeBytes: 0
- Hash/Range Keys: usuario_id(HASH)
- GSIs: EmailIndex
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## Venue_Category

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 443
- SizeBytes: 244055
- Hash/Range Keys: categoryId(HASH)
- GSIs: venueIdIndex, floorIdIndex
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## Venue_Element

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 224
- SizeBytes: 71278
- Hash/Range Keys: elementId(HASH)
- GSIs: floorIdIndex
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## Venue_Floor

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 206
- SizeBytes: 38019
- Hash/Range Keys: floorId(HASH)
- GSIs: venueIdIndex
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## Venue_Gate

- Status: ACTIVE
- BillingMode: unknown
- Items: 164
- SizeBytes: 48031
- Hash/Range Keys: gateId(HASH)
- GSIs: venueIdIndex
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## Venue_Seat

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 9996
- SizeBytes: 3549714
- Hash/Range Keys: seatId(HASH)
- GSIs: categoryIdIndex
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## Venue_Section

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 6
- SizeBytes: 1254
- Hash/Range Keys: sectionId(HASH)
- GSIs: categoryIdIndex
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## Venues

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 291
- SizeBytes: 215709
- Hash/Range Keys: venue_id(HASH)
- GSIs: city-name-index, ownerUserIdIndex
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED

## WhatsAppWebhookLogs

- Status: ACTIVE
- BillingMode: PAY_PER_REQUEST
- Items: 0
- SizeBytes: 0
- Hash/Range Keys: messageId(HASH), timestamp(RANGE)
- GSIs: none
- LSIs: none
- TTL: DISABLED
- PITR: DISABLED


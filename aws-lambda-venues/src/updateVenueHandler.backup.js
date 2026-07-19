const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { v4: uuidv4 } = require("uuid");

exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event));
    const { venueId } = event.pathParameters;
    const body = JSON.parse(event.body);
    const userId =
      event.requestContext?.authorizer?.claims?.sub || body.updatedBy || body.ownerUserId;

    console.log("userId extracted:", userId);

    if (!venueId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "venueId is required" }),
      };
    }

    // Verificar que el venue existe
    const existing = await dynamodb
      .get({
        TableName: "Venues",
        Key: { venue_id: venueId },
      })
      .promise();

    if (!existing.Item) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Venue not found" }),
      };
    }

    const now = new Date().toISOString();
    const hasSeating = body.hasSeating !== undefined ? body.hasSeating : existing.Item.hasSeating;
    const eventId = body.eventId || existing.Item.eventId;

    // Procesar gates antes del update (asegurar que cada gate tenga gateId)
    if (body.gates && Array.isArray(body.gates)) {
      body.gates = body.gates.map((gate) => ({
        ...gate,
        gateId: gate.gateId || uuidv4(),
      }));
    }

    // Construir expresión de actualización
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    const allowedFields = [
      "name",
      "type",
      "capacity",
      "country",
      "city",
      "address",
      "address2",
      "postalCode",
      "timezone",
      "geo",
      "amenities",
      "images",
      "tags",
      "gates",
      "isTemplate",
      "isCertified",
      "visibility",
      "status",
      "floorplanVersion",
      "hasSeating",
      "eventId",
      "isEventVenue",
      "baseVenueId",
      "latitude",
      "longitude",
      "description",
    ];

    allowedFields.forEach((field) => {
      if (body[field] !== undefined) {
        updateExpressions.push(`#${field} = :${field}`);
        expressionAttributeNames[`#${field}`] = field;
        expressionAttributeValues[`:${field}`] = body[field];
      }
    });

    // Solo agregar updatedAt y updatedBy si hay campos para actualizar
    if (updateExpressions.length > 0) {
      updateExpressions.push("#updatedAt = :updatedAt");
      expressionAttributeNames["#updatedAt"] = "updatedAt";
      expressionAttributeValues[":updatedAt"] = now;

      if (userId) {
        updateExpressions.push("#updatedBy = :updatedBy");
        expressionAttributeNames["#updatedBy"] = "updatedBy";
        expressionAttributeValues[":updatedBy"] = userId;
      }

      console.log("UpdateExpression:", `SET ${updateExpressions.join(", ")}`);
      console.log("ExpressionAttributeValues:", expressionAttributeValues);

      await dynamodb
        .update({
          TableName: "Venues",
          Key: { venue_id: venueId },
          UpdateExpression: `SET ${updateExpressions.join(", ")}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
        })
        .promise();
    } else {
      console.log("⚠️ No hay campos válidos para actualizar en el venue");
    }

    // Procesar pisos (floors) solo si hasSeating es true o si se proveen floors
    const floors = [];
    const shouldProcessFloors = hasSeating || (body.floors && Array.isArray(body.floors) && body.floors.length > 0);
    
    if (shouldProcessFloors && body.floors && Array.isArray(body.floors)) {
      for (const floorData of body.floors) {
        const floorId = floorData.floorId || uuidv4();

        // Crear o actualizar floor
        const floor = {
          floorId,
          venueId,
          name: floorData.name,
          description: floorData.description || "",
          image: floorData.image || "",
          updatedAt: now,
          updatedBy: userId,
        };

        // Si el floor no existe, agregar campos de creación
        if (!floorData.floorId) {
          floor.createdAt = now;
          floor.createdBy = userId;
        }

        await dynamodb
          .put({
            TableName: "Venue_Floor",
            Item: floor,
          })
          .promise();

        // Procesar elementos del piso si existen
        const elements = [];
        if (floorData.elements && Array.isArray(floorData.elements)) {
          for (const elementData of floorData.elements) {
            const elementId = elementData.elementId || uuidv4();

            const element = {
              elementId,
              floorId,
              venueId,
              name: elementData.name,
              type: elementData.type || "other",
              relX: elementData.relX || 0,
              relY: elementData.relY || 0,
              width: elementData.width || 0,
              height: elementData.height || 0,
              geometry: elementData.geometry || "RECTANGLE",
              notes: elementData.notes || "",
              updatedAt: now,
              updatedBy: userId,
            };

            // Si el elemento no existe, agregar campos de creación
            if (!elementData.elementId) {
              element.createdAt = now;
              element.createdBy = userId;
            }

            await dynamodb
              .put({
                TableName: "Venue_Element",
                Item: element,
              })
              .promise();

            elements.push(elementId);
          }
        }

        // Procesar categorías del piso
        const categories = [];
        if (floorData.categories && Array.isArray(floorData.categories)) {
          for (const categoryData of floorData.categories) {
            const categoryId = categoryData.categoryId || uuidv4();

            const category = {
              categoryId,
              floorId,
              venueId,
              eventId,
              name: categoryData.name,
              color: categoryData.color || "#000000",
              level: categoryData.level || 0,
              sortOrder: categoryData.sortOrder || 0,
              gateId: categoryData.gateId || "",
              gateName: categoryData.gateName || "",
              relX: categoryData.relX || 0,
              relY: categoryData.relY || 0,
              width: categoryData.width || 0,
              height: categoryData.height || 0,
              geometry: categoryData.geometry || "RECTANGLE",
              config: categoryData.config || "",
              isAccessibleZone: categoryData.isAccessibleZone || false,
              description: categoryData.description || "",
              rows: categoryData.rows || 0,
              seatsPerRow: categoryData.seatsPerRow || 0,
              hasPrice: categoryData.hasPrice || false,
              currency: categoryData.currency || "COP",
              ticketPrice: categoryData.ticketPrice || 0,
              floorNumber: categoryData.floorNumber || 1,
              totalSeats: categoryData.totalSeats || 0,
              disableSeatsEnabled: categoryData.disableSeatsEnabled || false,
              updatedAt: now,
              updatedBy: userId,
            };

            // Si la categoría no existe, agregar campos de creación
            if (!categoryData.categoryId) {
              category.createDate = now;
              category.createdBy = userId;
            }

            // Solo guardar en Venue_Category si hasSeating es true
            if (hasSeating) {
              console.log(`✅ Guardando categoría en Venue_Category: ${category.name} (${categoryId})`);
              await dynamodb
                .put({
                  TableName: "Venue_Category",
                  Item: category,
                })
                .promise();
            }

            // Procesar asientos directamente en la categoría
            let seatIds = [];
            if (
              hasSeating &&
              categoryData.seats &&
              Array.isArray(categoryData.seats)
            ) {
              console.log(`Procesando ${categoryData.seats.length} asientos para categoría ${category.name}`);
              
              // Batch write para asientos (máximo 25 por batch)
              const batchSize = 25;
              for (let i = 0; i < categoryData.seats.length; i += batchSize) {
                const batch = categoryData.seats.slice(i, i + batchSize);

                const putRequests = batch.map((seatData) => {
                  const seatId = seatData.seatId || uuidv4();
                  seatIds.push(seatId);

                  return {
                    PutRequest: {
                      Item: {
                        seatId,
                        sectionId: seatData.sectionId || "",
                        categoryId,
                        floorId,
                        venueId,
                        rowLabel: seatData.rowLabel || "",
                        colNumber: seatData.colNumber || 0,
                        seatCode: seatData.seatCode || "",
                        seatType: seatData.seatType || "standard",
                        status: seatData.status || "AVAILABLE",
                        isAccessible: seatData.isAccessible || false,
                        notes: seatData.notes || "",
                        updatedAt: now,
                        updatedBy: userId,
                        createdAt: seatData.seatId ? (seatData.createdAt || now) : now,
                        createdBy: seatData.seatId ? (seatData.createdBy || userId) : userId,
                      },
                    },
                  };
                });

                await dynamodb
                  .batchWrite({
                    RequestItems: {
                      Venue_Seat: putRequests,
                    },
                  })
                  .promise();
              }
              
              console.log(`✅ ${seatIds.length} asientos guardados para ${category.name}`);
            }

            categories.push({
              categoryId,
              name: categoryData.name,
              seatCount: seatIds.length,
            });
          }
        }

        floors.push({
          floorId,
          name: floorData.name,
          categoryCount: categories.length,
          elementCount: elements.length,
          categories,
        });
      }
    }

    // Procesar array independiente de categorías si existe
    let ticketUpdateResult = null;
    if (eventId && body.categories && Array.isArray(body.categories)) {
      console.log(`📦 Procesando ${body.categories.length} categorías independientes...`);
      const allTicketCategories = [];

      for (const cat of body.categories) {
        const categoryId = cat.categoryId || cat.id || uuidv4();
        
        // Si hasSeating es true y hay floorId, vincular categoría con floor
        if (hasSeating && cat.floorId) {
          console.log(`💺 Vinculando categoría ${cat.name} con floor ${cat.floorId}`);
          
          const category = {
            categoryId,
            floorId: cat.floorId,
            venueId,
            eventId,
            name: cat.name || cat.categoria,
            color: cat.color || "#000000",
            level: cat.level || 0,
            sortOrder: cat.sortOrder || 0,
            gateId: cat.gateId || "",
            gateName: cat.gateName || "",
            relX: cat.relX || 0,
            relY: cat.relY || 0,
            width: cat.width || 0,
            height: cat.height || 0,
            geometry: cat.geometry || "RECTANGLE",
            config: cat.config || "",
            isAccessibleZone: cat.isAccessibleZone || false,
            description: cat.descripcion || cat.description || "",
            rows: cat.rows || 0,
            seatsPerRow: cat.seatsPerRow || 0,
            hasPrice: cat.hasPrice || false,
            currency: cat.currency || "COP",
            ticketPrice: cat.ticketPrice || 0,
            floorNumber: cat.floorNumber || 1,
            totalSeats: cat.totalSeats || 0,
            disableSeatsEnabled: cat.disableSeatsEnabled || false,
            updatedAt: now,
            updatedBy: userId,
          };

          // Si no existe categoryId, es nueva
          if (!cat.categoryId && !cat.id) {
            category.createDate = now;
            category.createdBy = userId;
          }

          await dynamodb
            .put({
              TableName: "Venue_Category",
              Item: category,
            })
            .promise();
          
          console.log(`✅ Categoría ${cat.name} guardada en Venue_Category`);

          // Procesar seats si existen y hasSeating es true
          if (cat.seats && Array.isArray(cat.seats) && cat.seats.length > 0) {
            console.log(`Procesando ${cat.seats.length} asientos para ${cat.name}...`);
            const batchSize = 25;
            for (let i = 0; i < cat.seats.length; i += batchSize) {
              const batch = cat.seats.slice(i, i + batchSize);
              const putRequests = batch.map((seatData) => {
                const seatId = seatData.seatId || uuidv4();
                return {
                  PutRequest: {
                    Item: {
                      seatId,
                      categoryId,
                      floorId: cat.floorId,
                      venueId,
                      rowLabel: seatData.row || seatData.rowLabel || "",
                      colNumber: seatData.number || seatData.colNumber || 0,
                      seatCode: seatData.seatCode || `${seatData.row || seatData.rowLabel}${seatData.number || seatData.colNumber}`,
                      seatType: seatData.seatType || "standard",
                      status: seatData.status || "AVAILABLE",
                      isAccessible: seatData.isAccessible || false,
                      notes: seatData.notes || "",
                      sectionId: seatData.sectionId || "",
                      updatedAt: now,
                      updatedBy: userId,
                      createdAt: seatData.seatId ? (seatData.createdAt || now) : now,
                      createdBy: seatData.seatId ? (seatData.createdBy || userId) : userId,
                    },
                  },
                };
              });

              await dynamodb
                .batchWrite({
                  RequestItems: {
                    Venue_Seat: putRequests,
                  },
                })
                .promise();
            }
            console.log(`✅ ${cat.seats.length} asientos guardados para ${cat.name}`);
          }
        }
        
        // Agregar a tickets para tabla Tickets (siempre)
        allTicketCategories.push({
          categoria: cat.name || cat.categoria,
          id: categoryId,
          cantidadTickets: cat.cantidadTickets || cat.quantity || cat.totalSeats || 0,
          avaliableCapacity: cat.avaliableCapacity || cat.cantidadTickets || cat.quantity || cat.totalSeats || 0,
          reservedTickets: cat.reservedTickets || 0,
          soldTickets: cat.soldTickets || 0,
          moneda: cat.moneda || cat.currency || "COP",
          costo: cat.costo || cat.cost || 0,
          valor: cat.valor || cat.price || cat.ticketPrice || 0,
          descripcion: cat.descripcion || cat.description || "",
          imgboleta: cat.imgboleta || cat.image || "",
          gateId: cat.gateId || "",
          distributionId: cat.distributionId || uuidv4(),
          distributionCreateDate: cat.distributionCreateDate || now,
        });
      }

      // Actualizar o crear registro en tabla Tickets
      if (allTicketCategories.length > 0) {
        console.log(`🎫 Actualizando tabla Tickets con ${allTicketCategories.length} categorías`);
        
        // Buscar si ya existe un registro de tickets para este evento
        const existingTickets = await dynamodb
          .query({
            TableName: "Tickets",
            IndexName: "eventIdIndex",
            KeyConditionExpression: "eventId = :eventId",
            ExpressionAttributeValues: {
              ":eventId": eventId,
            },
          })
          .promise();

        let ticketId;
        if (existingTickets.Items && existingTickets.Items.length > 0) {
          // Actualizar registro existente
          ticketId = existingTickets.Items[0].id;
          console.log(`📝 Actualizando registro existente de tickets: ${ticketId}`);
          
          await dynamodb
            .update({
              TableName: "Tickets",
              Key: { id: ticketId },
              UpdateExpression: "SET boletas = :boletas, updatedAt = :updatedAt, hasSeating = :hasSeating, venueId = :venueId",
              ExpressionAttributeValues: {
                ":boletas": allTicketCategories,
                ":updatedAt": now,
                ":hasSeating": hasSeating,
                ":venueId": venueId,
              },
            })
            .promise();
          ticketUpdateResult = { ticketId, action: "updated", categoriesCount: allTicketCategories.length };
          console.log(`✅ Tickets actualizados correctamente`);
        } else {
          // Crear nuevo registro
          ticketId = uuidv4().substring(0, 10);
          console.log(`➕ Creando nuevo registro de tickets: ${ticketId}`);
          
          const ticketRecord = {
            id: ticketId,
            eventId: eventId,
            venueId: venueId,
            boletas: allTicketCategories,
            fechaIniVent: body.fechaIniVent || now,
            fechaFinVent: body.fechaFinVent || now,
            horaIniVent: body.horaIniVent || "00:00",
            horaFinVent: body.horaFinVent || "23:59",
            createDate: now,
            hasSeating: hasSeating,
          };

          await dynamodb
            .put({
              TableName: "Tickets",
              Item: ticketRecord,
            })
            .promise();
          ticketUpdateResult = { ticketId, action: "created", categoriesCount: allTicketCategories.length };
          console.log(`✅ Tickets creados correctamente`);
        }
      }
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({
        message: "Venue updated successfully",
        venueId,
        hasSeating,
        eventId,
        floorCount: floors.length,
        floors,
        ticketUpdate: ticketUpdateResult,
      }),
    };
  } catch (error) {
    console.error("Error in updateVenueHandler:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Internal server error",
        message: error.message,
      }),
    };
  }
};

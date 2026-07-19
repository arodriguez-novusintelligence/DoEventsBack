const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { GUESTS_TABLE } = process.env;

class GuestService {
  async getGuestsByEvent(eventId, category = "all") {
    const params = {
      TableName: GUESTS_TABLE,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: {
        ":pk": `EVENT#${eventId}`,
      },
    };

    const result = await dynamodb.query(params).promise();
    let guests = result.Items.filter((item) => item.entityType === "GUEST");

    // Apply category filter
    if (category === "favorites") {
      guests = guests.filter((guest) => guest.isFavorite === true);
    } else if (category === "others") {
      guests = guests.filter((guest) => guest.isFavorite !== true);
    }

    return guests.map(this.formatGuest);
  }

  async createGuest(guestData) {
    const item = {
      PK: `EVENT#${guestData.eventId}`,
      SK: `GUEST#${guestData.id}`,
      entityType: "GUEST",
      ...guestData,
      // Set up GSI keys for efficient queries
      GSI1PK: guestData.phone ? `PHONE#${guestData.phone}` : null,
      GSI1SK: `EVENT#${guestData.eventId}`,
      GSI2PK: guestData.email ? `EMAIL#${guestData.email}` : null,
      GSI2SK: `EVENT#${guestData.eventId}`,
      GSI3PK: guestData.clientId ? `CLIENT#${guestData.clientId}` : null,
      GSI3SK: `EVENT#${guestData.eventId}`,
      GSI4PK: `EVENT#${guestData.eventId}#FAVORITE#${
        guestData.isFavorite || false
      }`,
      GSI4SK: `GUEST#${guestData.id}`,
    };

    // Remove null GSI keys
    Object.keys(item).forEach((key) => {
      if (item[key] === null) delete item[key];
    });

    const params = {
      TableName: GUESTS_TABLE,
      Item: item,
      ConditionExpression:
        "attribute_not_exists(PK) AND attribute_not_exists(SK)",
    };

    await dynamodb.put(params).promise();
    return this.formatGuest(item);
  }

  async updateGuest(eventId, guestId, updateData) {
    // First get the current guest
    const currentGuest = await this.getGuestById(eventId, guestId);
    if (!currentGuest) {
      const error = new Error("Guest not found");
      error.code = "NOT_FOUND";
      throw error;
    }

    const updatedData = {
      ...currentGuest,
      ...updateData,
      updatedAt: new Date().toISOString(),
    };

    const item = {
      PK: `EVENT#${eventId}`,
      SK: `GUEST#${guestId}`,
      entityType: "GUEST",
      ...updatedData,
      // Update GSI keys
      GSI1PK: updatedData.phone ? `PHONE#${updatedData.phone}` : undefined,
      GSI1SK: `EVENT#${eventId}`,
      GSI2PK: updatedData.email ? `EMAIL#${updatedData.email}` : undefined,
      GSI2SK: `EVENT#${eventId}`,
      GSI3PK: updatedData.clientId
        ? `CLIENT#${updatedData.clientId}`
        : undefined,
      GSI3SK: `EVENT#${eventId}`,
      GSI4PK: `EVENT#${eventId}#FAVORITE#${updatedData.isFavorite || false}`,
      GSI4SK: `GUEST#${guestId}`,
    };

    // Remove undefined GSI keys
    Object.keys(item).forEach((key) => {
      if (item[key] === undefined) delete item[key];
    });

    const params = {
      TableName: GUESTS_TABLE,
      Item: item,
    };

    await dynamodb.put(params).promise();
    return this.formatGuest(item);
  }

  async deleteGuest(eventId, guestId) {
    // First get the guest to check if it exists and get groupIds
    const guest = await this.getGuestById(eventId, guestId);
    if (!guest) {
      const error = new Error("Guest not found");
      error.code = "NOT_FOUND";
      throw error;
    }

    // Remove guest from all groups
    if (guest.groupIds && guest.groupIds.length > 0) {
      const groupService = require("./groupService");
      for (const groupId of guest.groupIds) {
        try {
          await groupService.removeGuestFromGroup(eventId, groupId, guestId);
        } catch (error) {
          console.warn(
            `Failed to remove guest ${guestId} from group ${groupId}:`,
            error
          );
        }
      }
    }

    const params = {
      TableName: GUESTS_TABLE,
      Key: {
        PK: `EVENT#${eventId}`,
        SK: `GUEST#${guestId}`,
      },
    };

    await dynamodb.delete(params).promise();
  }

  async updateGuestFavorite(eventId, guestId, isFavorite) {
    return await this.updateGuest(eventId, guestId, { isFavorite });
  }

  async importGuests(eventId, contacts, groupId, isFavorite = false) {
    const results = {
      guests: [],
      total: 0,
      duplicates: 0,
      errors: 0,
      details: {
        duplicates: [],
        errors: [],
      },
    };

    for (const contact of contacts) {
      try {
        // Check if guest already exists by phone
        const existingGuest = await this.findGuestByPhone(
          eventId,
          contact.phone
        );
        if (existingGuest) {
          results.duplicates++;
          results.details.duplicates.push({
            name: contact.name,
            phone: contact.phone,
            reason: "Guest with this phone number already exists",
          });
          continue;
        }

        const guestData = {
          id: require("uuid").v4(),
          eventId,
          name: contact.name,
          phone: contact.phone,
          email: contact.email || null,
          isFavorite,
          tags: ["Imported"],
          groupIds: groupId ? [groupId] : [],
          originType: "IMPORTED",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const guest = await this.createGuest(guestData);
        results.guests.push(guest);
        results.total++;
      } catch (error) {
        console.error("Error importing contact:", contact, error);
        results.errors++;
        results.details.errors.push({
          name: contact.name,
          phone: contact.phone,
          reason: error.message || "Unknown error",
        });
      }
    }

    return results;
  }

  async getGuestById(eventId, guestId) {
    const params = {
      TableName: GUESTS_TABLE,
      Key: {
        PK: `EVENT#${eventId}`,
        SK: `GUEST#${guestId}`,
      },
    };

    const result = await dynamodb.get(params).promise();
    return result.Item && result.Item.entityType === "GUEST"
      ? this.formatGuest(result.Item)
      : null;
  }

  async findGuestByPhone(eventId, phone) {
    const params = {
      TableName: GUESTS_TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :gsi1pk AND GSI1SK = :gsi1sk",
      ExpressionAttributeValues: {
        ":gsi1pk": `PHONE#${phone}`,
        ":gsi1sk": `EVENT#${eventId}`,
      },
    };

    const result = await dynamodb.query(params).promise();
    return result.Items.length > 0 ? this.formatGuest(result.Items[0]) : null;
  }

  async findGuestByEmail(eventId, email) {
    const params = {
      TableName: GUESTS_TABLE,
      IndexName: "GSI2",
      KeyConditionExpression: "GSI2PK = :gsi2pk AND GSI2SK = :gsi2sk",
      ExpressionAttributeValues: {
        ":gsi2pk": `EMAIL#${email}`,
        ":gsi2sk": `EVENT#${eventId}`,
      },
    };

    const result = await dynamodb.query(params).promise();
    return result.Items.length > 0 ? this.formatGuest(result.Items[0]) : null;
  }

  async findGuestByClientId(eventId, clientId) {
    const params = {
      TableName: GUESTS_TABLE,
      IndexName: "GSI3",
      KeyConditionExpression: "GSI3PK = :gsi3pk AND GSI3SK = :gsi3sk",
      ExpressionAttributeValues: {
        ":gsi3pk": `CLIENT#${clientId}`,
        ":gsi3sk": `EVENT#${eventId}`,
      },
    };

    const result = await dynamodb.query(params).promise();
    return result.Items.length > 0 ? this.formatGuest(result.Items[0]) : null;
  }

  formatGuest(item) {
    return {
      id: item.id,
      eventId: item.eventId,
      clientId: item.clientId,
      name: item.name,
      username: item.username,
      profileImageUrl: item.profileImageUrl,
      phone: item.phone,
      email: item.email,
      isFavorite: item.isFavorite || false,
      tags: item.tags || [],
      groupIds: item.groupIds || [],
      originType: item.originType,
      metadata: item.metadata || {},
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}

module.exports = new GuestService();

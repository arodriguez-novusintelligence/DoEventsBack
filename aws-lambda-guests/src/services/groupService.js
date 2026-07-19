const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { GROUPS_TABLE } = process.env;

class GroupService {
  async getGroupsByEvent(eventId, includeGuests = true) {
    const params = {
      TableName: GROUPS_TABLE,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: {
        ":pk": `EVENT#${eventId}`,
      },
    };

    const result = await dynamodb.query(params).promise();
    let groups = result.Items.filter((item) => item.entityType === "GROUP");

    // Sort by order
    groups.sort((a, b) => (a.order || 0) - (b.order || 0));

    if (includeGuests) {
      // Get guests for each group
      const guestService = require("./guestService");
      for (const group of groups) {
        if (group.guestIds && group.guestIds.length > 0) {
          const guests = [];
          for (const guestId of group.guestIds) {
            const guest = await guestService.getGuestById(eventId, guestId);
            if (guest) guests.push(guest);
          }
          group.guests = guests;
        } else {
          group.guests = [];
        }
      }
    }

    return groups.map(this.formatGroup);
  }

  async createGroup(groupData) {
    // Get the next order number
    const existingGroups = await this.getGroupsByEvent(
      groupData.eventId,
      false
    );
    const nextOrder = existingGroups.length;

    const item = {
      PK: `EVENT#${groupData.eventId}`,
      SK: `GROUP#${groupData.id}`,
      entityType: "GROUP",
      ...groupData,
      order: nextOrder,
      // Set up GSI key for ordering
      GSI1PK: `EVENT#${groupData.eventId}#GROUPS`,
      GSI1SK: `ORDER#${nextOrder}`,
    };

    const params = {
      TableName: GROUPS_TABLE,
      Item: item,
      ConditionExpression:
        "attribute_not_exists(PK) AND attribute_not_exists(SK)",
    };

    await dynamodb.put(params).promise();
    return this.formatGroup(item);
  }

  async updateGroup(eventId, groupId, updateData) {
    // First get the current group
    const currentGroup = await this.getGroupById(eventId, groupId);
    if (!currentGroup) {
      const error = new Error("Group not found");
      error.code = "NOT_FOUND";
      throw error;
    }

    const updatedData = {
      ...currentGroup,
      ...updateData,
      updatedAt: new Date().toISOString(),
    };

    const item = {
      PK: `EVENT#${eventId}`,
      SK: `GROUP#${groupId}`,
      entityType: "GROUP",
      ...updatedData,
      // Update GSI key if order changed
      GSI1PK: `EVENT#${eventId}#GROUPS`,
      GSI1SK: `ORDER#${
        updatedData.order !== undefined ? updatedData.order : currentGroup.order
      }`,
    };

    const params = {
      TableName: GROUPS_TABLE,
      Item: item,
    };

    await dynamodb.put(params).promise();
    return this.formatGroup(item);
  }

  async deleteGroup(eventId, groupId) {
    // First get the group to check if it exists and get guestIds
    const group = await this.getGroupById(eventId, groupId);
    if (!group) {
      const error = new Error("Group not found");
      error.code = "NOT_FOUND";
      throw error;
    }

    // Remove group from all guests
    if (group.guestIds && group.guestIds.length > 0) {
      const guestService = require("./guestService");
      for (const guestId of group.guestIds) {
        try {
          const guest = await guestService.getGuestById(eventId, guestId);
          if (guest) {
            const updatedGroupIds = guest.groupIds.filter(
              (id) => id !== groupId
            );
            await guestService.updateGuest(eventId, guestId, {
              groupIds: updatedGroupIds,
            });
          }
        } catch (error) {
          console.warn(
            `Failed to remove group ${groupId} from guest ${guestId}:`,
            error
          );
        }
      }
    }

    const params = {
      TableName: GROUPS_TABLE,
      Key: {
        PK: `EVENT#${eventId}`,
        SK: `GROUP#${groupId}`,
      },
    };

    await dynamodb.delete(params).promise();
  }

  async addGuestsToGroup(eventId, groupId, guestIds) {
    // Get the current group
    const group = await this.getGroupById(eventId, groupId);
    if (!group) {
      const error = new Error("Group not found");
      error.code = "NOT_FOUND";
      throw error;
    }

    const guestService = require("./guestService");
    const addedGuests = [];

    // Add group to each guest (avoiding duplicates)
    for (const guestId of guestIds) {
      const guest = await guestService.getGuestById(eventId, guestId);
      if (guest) {
        const currentGroupIds = new Set(guest.groupIds || []);
        if (!currentGroupIds.has(groupId)) {
          currentGroupIds.add(groupId);
          await guestService.updateGuest(eventId, guestId, {
            groupIds: Array.from(currentGroupIds),
          });
          addedGuests.push(guest);
        }
      }
    }

    // Update group with new guest IDs
    const currentGuestIds = new Set(group.guestIds || []);
    guestIds.forEach((id) => currentGuestIds.add(id));

    const updatedGroup = await this.updateGroup(eventId, groupId, {
      guestIds: Array.from(currentGuestIds),
    });

    return {
      group: updatedGroup,
      guestsAdded: addedGuests.length,
    };
  }

  async removeGuestFromGroup(eventId, groupId, guestId) {
    // Get the current group
    const group = await this.getGroupById(eventId, groupId);
    if (!group) {
      const error = new Error("Group not found");
      error.code = "NOT_FOUND";
      throw error;
    }

    const guestService = require("./guestService");

    // Remove group from guest
    const guest = await guestService.getGuestById(eventId, guestId);
    if (guest) {
      const updatedGroupIds = guest.groupIds.filter((id) => id !== groupId);
      await guestService.updateGuest(eventId, guestId, {
        groupIds: updatedGroupIds,
      });
    }

    // Remove guest from group
    const updatedGuestIds = group.guestIds.filter((id) => id !== guestId);
    const updatedGroup = await this.updateGroup(eventId, groupId, {
      guestIds: updatedGuestIds,
    });

    return {
      group: updatedGroup,
    };
  }

  async reorderGroups(eventId, groupsOrder) {
    const updatedGroups = [];

    for (const groupOrder of groupsOrder) {
      const group = await this.updateGroup(eventId, groupOrder.id, {
        order: groupOrder.order,
      });
      updatedGroups.push(group);
    }

    // Sort by order for response
    updatedGroups.sort((a, b) => a.order - b.order);

    return { groups: updatedGroups };
  }

  async getGroupById(eventId, groupId) {
    const params = {
      TableName: GROUPS_TABLE,
      Key: {
        PK: `EVENT#${eventId}`,
        SK: `GROUP#${groupId}`,
      },
    };

    const result = await dynamodb.get(params).promise();
    return result.Item && result.Item.entityType === "GROUP"
      ? this.formatGroup(result.Item)
      : null;
  }

  formatGroup(item) {
    return {
      id: item.id,
      eventId: item.eventId,
      name: item.name,
      color: item.color,
      order: item.order,
      guestIds: item.guestIds || [],
      guests: item.guests || [],
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}

module.exports = new GroupService();

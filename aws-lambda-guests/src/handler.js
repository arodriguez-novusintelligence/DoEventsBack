const { v4: uuidv4 } = require("uuid");
const AWS = require("aws-sdk");
const guestService = require("./services/guestService");
const groupService = require("./services/groupService");
const {
  validateGuest,
  validateGroup,
  validateImport,
} = require("./validators");
const {
  buildResponse,
  buildErrorResponse,
} = require("./utils/responseBuilder");

const dynamodb = new AWS.DynamoDB.DocumentClient();

module.exports.main = async (event) => {
  try {
    const { httpMethod, pathParameters, queryStringParameters, body } = event;
    const { eventId } = pathParameters || {};
    const path = event.path;

    // Parse body if exists
    let parsedBody = null;
    if (body) {
      try {
        parsedBody = JSON.parse(body);
      } catch (error) {
        return buildErrorResponse(
          400,
          "INVALID_JSON",
          "Invalid JSON in request body"
        );
      }
    }

    // Route to appropriate handler
    if (path.includes("/guests")) {
      return await handleGuestRoutes(
        httpMethod,
        path,
        eventId,
        pathParameters,
        queryStringParameters,
        parsedBody
      );
    } else if (path.includes("/groups")) {
      return await handleGroupRoutes(
        httpMethod,
        path,
        eventId,
        pathParameters,
        parsedBody
      );
    }

    return buildErrorResponse(404, "NOT_FOUND", "Endpoint not found");
  } catch (error) {
    console.error("Main handler error:", error);
    return buildErrorResponse(500, "INTERNAL_ERROR", "Internal server error");
  }
};

async function handleGuestRoutes(
  method,
  path,
  eventId,
  pathParameters,
  queryStringParameters,
  body
) {
  const { guestId } = pathParameters || {};

  switch (method) {
    case "GET":
      if (guestId) {
        // Get single guest - not in API spec, but could be useful
        return buildErrorResponse(404, "NOT_FOUND", "Endpoint not found");
      } else {
        // Get all guests for event
        return await getGuests(eventId, queryStringParameters);
      }

    case "POST":
      if (path.includes("/import")) {
        // Import contacts
        return await importGuests(eventId, body);
      } else if (path.includes("/favorite")) {
        // Add to favorites
        return await addToFavorites(eventId, guestId, body);
      } else {
        // Create guest
        return await createGuest(eventId, body);
      }

    case "PUT":
      // Update guest
      return await updateGuest(eventId, guestId, body);

    case "DELETE":
      if (path.includes("/favorite")) {
        // Remove from favorites
        return await removeFromFavorites(eventId, guestId);
      } else {
        // Delete guest
        return await deleteGuest(eventId, guestId);
      }

    default:
      return buildErrorResponse(
        405,
        "METHOD_NOT_ALLOWED",
        "Method not allowed"
      );
  }
}

async function handleGroupRoutes(method, path, eventId, pathParameters, body) {
  const { groupId, guestId } = pathParameters || {};

  switch (method) {
    case "GET":
      // Get all groups for event
      return await getGroups(eventId, pathParameters);

    case "POST":
      if (path.includes("/guests")) {
        // Add guests to group
        return await addGuestsToGroup(eventId, groupId, body);
      } else {
        // Create group
        return await createGroup(eventId, body);
      }

    case "PUT":
      if (path.includes("/reorder")) {
        // Reorder groups
        return await reorderGroups(eventId, body);
      } else {
        // Update group
        return await updateGroup(eventId, groupId, body);
      }

    case "DELETE":
      if (path.includes("/guests/")) {
        // Remove guest from group
        return await removeGuestFromGroup(eventId, groupId, guestId);
      } else {
        // Delete group
        return await deleteGroup(eventId, groupId);
      }

    default:
      return buildErrorResponse(
        405,
        "METHOD_NOT_ALLOWED",
        "Method not allowed"
      );
  }
}

// Guest handlers
async function getGuests(eventId, queryParams) {
  try {
    const category = queryParams?.category || "all";
    const guests = await guestService.getGuestsByEvent(eventId, category);

    let favorites = 0,
      others = 0;
    const guestList = guests.map((guest) => {
      if (guest.isFavorite) favorites++;
      else others++;
      return guest;
    });

    return buildResponse(200, {
      guests: guestList,
      total: guests.length,
      favorites,
      others,
    });
  } catch (error) {
    console.error("Error getting guests:", error);
    return buildErrorResponse(500, "INTERNAL_ERROR", "Error retrieving guests");
  }
}

async function createGuest(eventId, body) {
  try {
    const validation = validateGuest(body, false);
    if (!validation.isValid) {
      return buildErrorResponse(400, "VALIDATION_ERROR", "Invalid data", {
        details: validation.errors,
      });
    }

    const guestData = {
      ...body,
      id: uuidv4(),
      eventId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const guest = await guestService.createGuest(guestData);
    return buildResponse(201, { guest });
  } catch (error) {
    console.error("Error creating guest:", error);
    if (error.code === "ConditionalCheckFailedException") {
      return buildErrorResponse(409, "DUPLICATE_ENTRY", "Guest already exists");
    }
    return buildErrorResponse(500, "INTERNAL_ERROR", "Error creating guest");
  }
}

async function updateGuest(eventId, guestId, body) {
  try {
    const guest = await guestService.updateGuest(eventId, guestId, body);
    return buildResponse(200, { guest });
  } catch (error) {
    console.error("Error updating guest:", error);
    if (error.code === "NOT_FOUND") {
      return buildErrorResponse(404, "GUEST_NOT_FOUND", "Guest not found");
    }
    return buildErrorResponse(500, "INTERNAL_ERROR", "Error updating guest");
  }
}

async function deleteGuest(eventId, guestId) {
  try {
    await guestService.deleteGuest(eventId, guestId);
    return buildResponse(200, { message: "Guest deleted successfully" });
  } catch (error) {
    console.error("Error deleting guest:", error);
    if (error.code === "NOT_FOUND") {
      return buildErrorResponse(404, "GUEST_NOT_FOUND", "Guest not found");
    }
    return buildErrorResponse(500, "INTERNAL_ERROR", "Error deleting guest");
  }
}

async function addToFavorites(eventId, guestId, body) {
  try {
    const guest = await guestService.updateGuestFavorite(
      eventId,
      guestId,
      true
    );
    return buildResponse(200, { guest });
  } catch (error) {
    console.error("Error adding to favorites:", error);
    if (error.code === "NOT_FOUND") {
      return buildErrorResponse(404, "GUEST_NOT_FOUND", "Guest not found");
    }
    return buildErrorResponse(
      500,
      "INTERNAL_ERROR",
      "Error updating favorite status"
    );
  }
}

async function removeFromFavorites(eventId, guestId) {
  try {
    const guest = await guestService.updateGuestFavorite(
      eventId,
      guestId,
      false
    );
    return buildResponse(200, { guest });
  } catch (error) {
    console.error("Error removing from favorites:", error);
    if (error.code === "NOT_FOUND") {
      return buildErrorResponse(404, "GUEST_NOT_FOUND", "Guest not found");
    }
    return buildErrorResponse(
      500,
      "INTERNAL_ERROR",
      "Error updating favorite status"
    );
  }
}

async function importGuests(eventId, body) {
  try {
    const validation = validateImport(body);
    if (!validation.isValid) {
      return buildErrorResponse(
        400,
        "VALIDATION_ERROR",
        "Invalid import data",
        { details: validation.errors }
      );
    }

    const result = await guestService.importGuests(
      eventId,
      body.contacts,
      body.groupId,
      body.isFavorite
    );
    return buildResponse(200, result);
  } catch (error) {
    console.error("Error importing guests:", error);
    return buildErrorResponse(500, "INTERNAL_ERROR", "Error importing guests");
  }
}

// Group handlers
async function getGroups(eventId, queryParams) {
  try {
    const includeGuests = queryParams?.includeGuests === "true";
    const groups = await groupService.getGroupsByEvent(eventId, includeGuests);
    return buildResponse(200, { groups, total: groups.length });
  } catch (error) {
    console.error("Error getting groups:", error);
    return buildErrorResponse(500, "INTERNAL_ERROR", "Error retrieving groups");
  }
}

async function createGroup(eventId, body) {
  try {
    const validation = validateGroup(body, false);
    if (!validation.isValid) {
      return buildErrorResponse(400, "VALIDATION_ERROR", "Invalid data", {
        details: validation.errors,
      });
    }

    const groupData = {
      ...body,
      id: uuidv4(),
      eventId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const group = await groupService.createGroup(groupData);
    return buildResponse(201, { group });
  } catch (error) {
    console.error("Error creating group:", error);
    return buildErrorResponse(500, "INTERNAL_ERROR", "Error creating group");
  }
}

async function updateGroup(eventId, groupId, body) {
  try {
    const group = await groupService.updateGroup(eventId, groupId, body);
    return buildResponse(200, { group });
  } catch (error) {
    console.error("Error updating group:", error);
    if (error.code === "NOT_FOUND") {
      return buildErrorResponse(404, "GROUP_NOT_FOUND", "Group not found");
    }
    return buildErrorResponse(500, "INTERNAL_ERROR", "Error updating group");
  }
}

async function deleteGroup(eventId, groupId) {
  try {
    await groupService.deleteGroup(eventId, groupId);
    return buildResponse(200, { message: "Group deleted successfully" });
  } catch (error) {
    console.error("Error deleting group:", error);
    if (error.code === "NOT_FOUND") {
      return buildErrorResponse(404, "GROUP_NOT_FOUND", "Group not found");
    }
    return buildErrorResponse(500, "INTERNAL_ERROR", "Error deleting group");
  }
}

async function addGuestsToGroup(eventId, groupId, body) {
  try {
    const result = await groupService.addGuestsToGroup(
      eventId,
      groupId,
      body.guestIds
    );
    return buildResponse(200, result);
  } catch (error) {
    console.error("Error adding guests to group:", error);
    if (error.code === "NOT_FOUND") {
      return buildErrorResponse(404, "GROUP_NOT_FOUND", "Group not found");
    }
    return buildErrorResponse(
      500,
      "INTERNAL_ERROR",
      "Error adding guests to group"
    );
  }
}

async function removeGuestFromGroup(eventId, groupId, guestId) {
  try {
    const result = await groupService.removeGuestFromGroup(
      eventId,
      groupId,
      guestId
    );
    return buildResponse(200, result);
  } catch (error) {
    console.error("Error removing guest from group:", error);
    if (error.code === "NOT_FOUND") {
      return buildErrorResponse(404, "GROUP_NOT_FOUND", "Group not found");
    }
    return buildErrorResponse(
      500,
      "INTERNAL_ERROR",
      "Error removing guest from group"
    );
  }
}

async function reorderGroups(eventId, body) {
  try {
    const result = await groupService.reorderGroups(eventId, body.groups);
    return buildResponse(200, result);
  } catch (error) {
    console.error("Error reordering groups:", error);
    return buildErrorResponse(500, "INTERNAL_ERROR", "Error reordering groups");
  }
}

function validateGuest(data, isUpdate = false) {
  const errors = [];

  // Required fields for creation
  if (!isUpdate) {
    if (
      !data.name ||
      typeof data.name !== "string" ||
      data.name.trim().length < 2
    ) {
      errors.push({
        field: "name",
        message: "Name is required and must be at least 2 characters",
      });
    }

    // At least phone or email is required
    if (!data.phone && !data.email) {
      errors.push({
        field: "contact",
        message: "At least phone or email is required",
      });
    }
  }

  // Phone validation
  if (data.phone) {
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (!phoneRegex.test(data.phone)) {
      errors.push({ field: "phone", message: "Invalid phone number format" });
    }
  }

  // Email validation
  if (data.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      errors.push({ field: "email", message: "Invalid email format" });
    }
  }

  // Username validation
  if (
    data.username &&
    (typeof data.username !== "string" || data.username.trim().length < 2)
  ) {
    errors.push({
      field: "username",
      message: "Username must be at least 2 characters",
    });
  }

  // Tags validation
  if (data.tags && !Array.isArray(data.tags)) {
    errors.push({ field: "tags", message: "Tags must be an array" });
  }

  // Group IDs validation
  if (data.groupIds && !Array.isArray(data.groupIds)) {
    errors.push({ field: "groupIds", message: "Group IDs must be an array" });
  }

  // Origin type validation
  if (
    data.originType &&
    !["REGISTERED", "UNREGISTERED", "IMPORTED"].includes(data.originType)
  ) {
    errors.push({ field: "originType", message: "Invalid origin type" });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

function validateGroup(data, isUpdate = false) {
  const errors = [];

  // Required fields for creation
  if (!isUpdate) {
    if (
      !data.name ||
      typeof data.name !== "string" ||
      data.name.trim().length < 2
    ) {
      errors.push({
        field: "name",
        message: "Name is required and must be at least 2 characters",
      });
    }

    if (!data.color || typeof data.color !== "string") {
      errors.push({ field: "color", message: "Color is required" });
    } else {
      // Validate hex color
      const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
      if (!hexRegex.test(data.color)) {
        errors.push({
          field: "color",
          message: "Color must be a valid hex color (e.g., #FF9AA2)",
        });
      }
    }
  }

  // Name validation for updates
  if (
    data.name &&
    (typeof data.name !== "string" || data.name.trim().length < 2)
  ) {
    errors.push({
      field: "name",
      message: "Name must be at least 2 characters",
    });
  }

  // Color validation for updates
  if (data.color) {
    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (!hexRegex.test(data.color)) {
      errors.push({
        field: "color",
        message: "Color must be a valid hex color (e.g., #FF9AA2)",
      });
    }
  }

  // Guest IDs validation
  if (data.guestIds && !Array.isArray(data.guestIds)) {
    errors.push({ field: "guestIds", message: "Guest IDs must be an array" });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

function validateImport(data) {
  const errors = [];

  if (!data.contacts || !Array.isArray(data.contacts)) {
    errors.push({ field: "contacts", message: "Contacts array is required" });
    return { isValid: false, errors };
  }

  if (data.contacts.length === 0) {
    errors.push({
      field: "contacts",
      message: "At least one contact is required",
    });
  }

  // Validate each contact
  data.contacts.forEach((contact, index) => {
    if (
      !contact.name ||
      typeof contact.name !== "string" ||
      contact.name.trim().length < 1
    ) {
      errors.push({
        field: `contacts[${index}].name`,
        message: "Contact name is required",
      });
    }

    if (!contact.phone || typeof contact.phone !== "string") {
      errors.push({
        field: `contacts[${index}].phone`,
        message: "Contact phone is required",
      });
    } else {
      const phoneRegex = /^\+?[1-9]\d{1,14}$/;
      if (!phoneRegex.test(contact.phone)) {
        errors.push({
          field: `contacts[${index}].phone`,
          message: "Invalid phone number format",
        });
      }
    }

    if (contact.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(contact.email)) {
        errors.push({
          field: `contacts[${index}].email`,
          message: "Invalid email format",
        });
      }
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

function validateReorderGroups(data) {
  const errors = [];

  if (!data.groups || !Array.isArray(data.groups)) {
    errors.push({ field: "groups", message: "Groups array is required" });
    return { isValid: false, errors };
  }

  if (data.groups.length === 0) {
    errors.push({ field: "groups", message: "At least one group is required" });
  }

  // Validate each group order
  data.groups.forEach((group, index) => {
    if (!group.id || typeof group.id !== "string") {
      errors.push({
        field: `groups[${index}].id`,
        message: "Group ID is required",
      });
    }

    if (typeof group.order !== "number" || group.order < 0) {
      errors.push({
        field: `groups[${index}].order`,
        message: "Valid order number is required",
      });
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

module.exports = {
  validateGuest,
  validateGroup,
  validateImport,
  validateReorderGroups,
};

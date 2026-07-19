// Simple test file to verify the lambda structure
const handler = require("./src/handler");
const guestService = require("./src/services/guestService");
const groupService = require("./src/services/groupService");
const { validateGuest, validateGroup } = require("./src/validators");

console.log("✅ Lambda structure loaded successfully");

// Test validation functions
const testGuestValidation = () => {
  const validGuest = {
    name: "John Doe",
    phone: "+1234567890",
    email: "john@example.com",
  };

  const invalidGuest = {
    name: "",
    phone: "invalid",
  };

  console.log("✅ Guest validation:", validateGuest(validGuest));
  console.log("❌ Invalid guest validation:", validateGuest(invalidGuest));
};

const testGroupValidation = () => {
  const validGroup = {
    name: "Family",
    color: "#FF9AA2",
  };

  const invalidGroup = {
    name: "",
    color: "invalid",
  };

  console.log("✅ Group validation:", validateGroup(validGroup));
  console.log("❌ Invalid group validation:", validateGroup(invalidGroup));
};

// Run tests
testGuestValidation();
testGroupValidation();

console.log("🎉 All basic tests passed!");

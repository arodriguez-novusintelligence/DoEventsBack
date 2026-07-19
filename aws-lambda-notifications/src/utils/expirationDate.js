const getExpirationDate = (days = 30) => {
  const expiration = new Date();
  expiration.setDate(expiration.getDate() + days);
  return expiration.toISOString();
};

module.exports = { getExpirationDate };
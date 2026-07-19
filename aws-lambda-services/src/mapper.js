const { resolveProviderImage } = require('./enrichProvider');
const { resolveReadableImageUrl, resolveReadableGallery } = require('./entityMedia');

function mapProvider(item, distanceKm) {
  if (!item) return null;
  const rawImageUrl = resolveProviderImage(item);
  const imageUrl = rawImageUrl ? resolveReadableImageUrl(rawImageUrl) : undefined;
  const gallery = resolveReadableGallery(Array.isArray(item.gallery) ? item.gallery : []);
  return {
    serviceId: item.serviceId,
    userId: item.userId,
    name: item.name,
    role: item.role || item.category,
    category: item.category,
    description: item.description || '',
    rating: Number(item.rating || 0),
    reviewCount: Number(item.reviewCount || 0),
    username: item.username || undefined,
    providerDisplayName: item.providerDisplayName || undefined,
    profileImageUrl: imageUrl || undefined,
    gallery: gallery.length ? gallery : (imageUrl ? [imageUrl] : []),
    sectors: item.sectors || [],
    activities: item.activities || {},
    pricing: item.pricing || {},
    minPrice: item.minPrice != null ? Number(item.minPrice) : undefined,
    currency: item.currency || 'COP',
    latitude: item.latitude != null ? Number(item.latitude) : undefined,
    longitude: item.longitude != null ? Number(item.longitude) : undefined,
    city: item.city || undefined,
    distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : undefined,
    likeCount: item.likeCount != null ? Number(item.likeCount) : undefined,
    status: item.status || 'active',
  };
}

module.exports = { mapProvider };

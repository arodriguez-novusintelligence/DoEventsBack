const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Inicializa Firebase Admin con la clave del servicio dentro de src/firebase
try {
  if (!admin.apps.length) {
    const saPath = path.join(__dirname, 'serviceAccount.json');
    if (fs.existsSync(saPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(saPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.info('✅ Firebase admin initialized from serviceAccount.json');
    } else {
      console.warn('⚠️ serviceAccount.json not found at', saPath);
    }
  }
} catch (err) {
  console.error('❌ Error initializing Firebase admin:', err.message || err);
}

module.exports = admin;

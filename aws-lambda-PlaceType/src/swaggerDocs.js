const fs = require('fs');
const path = require('path');

exports.handler = async () => {
  try {
    const swagger = fs.readFileSync(path.join(__dirname, '../doc/placeType.yml'), 'utf8');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/yaml',
        'Access-Control-Allow-Origin': '*'
      },
      body: swagger
    };
  } catch (err) {
    console.error('ERROR leyendo el placeType.yml', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' })
    };
  }
};
const Logger = require('pizza-logger');
const config = require('./config');

const loggerConfig = {
  factory: {
    url: config.factory.url,
    apiKey: config.factory.apiKey,
  },
  logging: {
    source: config.logging.source,
    url: config.logging.endpointUrl,
    userId: config.logging.accountId,
    apiKey: config.logging.apiKey,
  },
};

const logger = new Logger(loggerConfig);

module.exports = logger;

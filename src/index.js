const app = require('./service.js');
const { sendMetricsPeriodically } = require('./metrics.js');
const logger = require('./logger.js');

process.on('uncaughtException', (err) => {
  logger.unhandledErrorLogger(err);
});

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logger.unhandledErrorLogger(err);
});

const port = process.argv[2] || 3000;
app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});

sendMetricsPeriodically();

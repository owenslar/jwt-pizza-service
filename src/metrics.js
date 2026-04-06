const config = require('./config');
const os = require('os');

let metricsTimer = null;

// Metrics stored in memory
const httpMetrics = {};
const activeUsers = new Map();
const authMetrics = {
  auth_login_success_total: 0,
  auth_login_failure_total: 0,
};
const pizzaMetrics = {};
let pizzaLatencyMetrics = [];
let httpLatencyMetrics = [];
let httpLatencySumTotal = 0;
let httpLatencyCountTotal = 0;
let pizzaLatencySumTotal = 0;
let pizzaLatencyCountTotal = 0;

const ACTIVE_THRESHOLD = 15 * 60 * 1000; // 15 minutes

// Middleware to track requests
function requestTracker(req, res, next) {
  captureHTTPMetrics(req);
  next();
}

function requestLatencyTracker(req, res, next) {
  const start = Date.now();
  let recorded = false;

  function record() {
    if (recorded) return;
    recorded = true;

    const durationMs = Date.now() - start;

    httpLatencyMetrics.push(durationMs);
  }

  res.on('finish', () => record());
  res.on('close', () => record());
  res.on('error', () => record());
  next();
}

function captureHTTPMetrics(req) {
  const method = `${req.method}`;
  httpMetrics[method] = (httpMetrics[method] || 0) + 1;
}

// Metrics for tracking active users
function markUserActive(userId, token, now = Date.now()) {
  activeUsers.set(token, { userId, lastActive: now });
}

function refreshUserActivity(userId, token, now = Date.now()) {
  markUserActive(userId, token, now);
}

function markUserInactiveByToken(token) {
  activeUsers.delete(token);
}

function sweepInactiveUsers(now = Date.now()) {
  for (const [token, session] of activeUsers.entries()) {
    if (now - session.lastActive > ACTIVE_THRESHOLD) {
      activeUsers.delete(token);
    }
  }
}

function getActiveUserCount(now = Date.now()) {
  sweepInactiveUsers(now);
  const uniqueUsers = new Set();
  for (const session of activeUsers.values()) {
    uniqueUsers.add(session.userId);
  }
  return uniqueUsers.size;
}

// Metrics for success and failure auth attempts
function incrementAuthLoginSuccess() {
  authMetrics.auth_login_success_total += 1;
}

function incrementAuthLoginFailure() {
  authMetrics.auth_login_failure_total += 1;
}

// Helpers for system metrics
function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return cpuUsage.toFixed(2) * 100;
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;
  return memoryUsage.toFixed(2);
}

// Pizza metrics
function pizzaPurchase(success, latency, price) {
  pizzaMetrics[success ? 'success' : 'failure'] =
    (pizzaMetrics[success ? 'success' : 'failure'] || 0) + 1;
  pizzaMetrics.totalRevenue =
    (pizzaMetrics.totalRevenue || 0) + (success ? price : 0);

  if (typeof latency === 'number' && Number.isFinite(latency) && latency >= 0) {
    pizzaLatencyMetrics.push(latency);
  }
}

function sendMetricsPeriodically(period = 1000) {
  if (metricsTimer) return metricsTimer;

  metricsTimer = setInterval(() => {
    try {
      const metrics = [];
      Object.keys(httpMetrics).forEach((method) => {
        metrics.push(
          createMetric('requests', httpMetrics[method], '1', 'sum', 'asInt', {
            method,
          }),
        );
      });

      metrics.push(
        createMetric(
          'activeUsers',
          getActiveUserCount(),
          '1',
          'gauge',
          'asInt',
          {},
        ),
      );

      metrics.push(
        createMetric(
          'auth_login_success_total',
          authMetrics.auth_login_success_total,
          '1',
          'sum',
          'asInt',
          {},
        ),
      );

      metrics.push(
        createMetric(
          'auth_login_failure_total',
          authMetrics.auth_login_failure_total,
          '1',
          'sum',
          'asInt',
          {},
        ),
      );

      metrics.push(
        createMetric(
          'cpu_usage_percentage',
          getCpuUsagePercentage(),
          'percent',
          'gauge',
          'asDouble',
          {},
        ),
      );

      metrics.push(
        createMetric(
          'memory_usage_percentage',
          getMemoryUsagePercentage(),
          'percent',
          'gauge',
          'asDouble',
          {},
        ),
      );

      metrics.push(
        createMetric(
          'pizza_purchase_success_total',
          pizzaMetrics.success || 0,
          '1',
          'sum',
          'asInt',
          {},
        ),
      );

      metrics.push(
        createMetric(
          'pizza_purchase_failure_total',
          pizzaMetrics.failure || 0,
          '1',
          'sum',
          'asInt',
          {},
        ),
      );

      metrics.push(
        createMetric(
          'pizza_total_revenue',
          pizzaMetrics.totalRevenue || 0,
          'BTC',
          'sum',
          'asDouble',
          {},
        ),
      );

      const httpLatencyCount = httpLatencyMetrics.length;
      const httpLatencySum = httpLatencyMetrics.reduce((a, b) => a + b, 0);
      const httpLatencyAverage =
        httpLatencyCount > 0 ? httpLatencySum / httpLatencyCount : 0;
      httpLatencyMetrics = [];

      if (httpLatencyCount > 0) {
        httpLatencySumTotal += httpLatencySum;
        httpLatencyCountTotal += httpLatencyCount;

        metrics.push(
          createMetric(
            'http_latency_avg',
            httpLatencyAverage,
            'ms',
            'gauge',
            'asDouble',
            {},
          ),
        );

        metrics.push(
          createMetric(
            'http_latency_sum',
            httpLatencySumTotal,
            'ms',
            'sum',
            'asDouble',
            {},
          ),
        );

        metrics.push(
          createMetric(
            'http_latency_count',
            httpLatencyCountTotal,
            '1',
            'sum',
            'asInt',
            {},
          ),
        );
      }

      const pizzaLatencyCount = pizzaLatencyMetrics.length;
      const pizzaLatencySum = pizzaLatencyMetrics.reduce((a, b) => a + b, 0);
      const pizzaLatencyAverage =
        pizzaLatencyCount > 0 ? pizzaLatencySum / pizzaLatencyCount : 0;
      pizzaLatencyMetrics = [];

      if (pizzaLatencyCount > 0) {
        pizzaLatencySumTotal += pizzaLatencySum;
        pizzaLatencyCountTotal += pizzaLatencyCount;

        metrics.push(
          createMetric(
            'pizza_latency_avg',
            pizzaLatencyAverage,
            'ms',
            'gauge',
            'asDouble',
            {},
          ),
        );

        metrics.push(
          createMetric(
            'pizza_latency_sum',
            pizzaLatencySumTotal,
            'ms',
            'sum',
            'asDouble',
            {},
          ),
        );

        metrics.push(
          createMetric(
            'pizza_latency_count',
            pizzaLatencyCountTotal,
            '1',
            'sum',
            'asInt',
            {},
          ),
        );
      }

      sendMetricToGrafana(metrics);
    } catch (error) {
      console.log('Error sending metrics:', error);
    }
  }, period);

  return metricsTimer;
}

function createMetric(
  metricName,
  metricValue,
  metricUnit,
  metricType,
  valueType,
  attributes,
) {
  attributes = { ...attributes, source: config.metrics.source };

  const metric = {
    name: metricName,
    unit: metricUnit,
    [metricType]: {
      dataPoints: [
        {
          [valueType]: metricValue,
          timeUnixNano: Date.now() * 1000000,
          attributes: [],
        },
      ],
    },
  };

  Object.keys(attributes).forEach((key) => {
    metric[metricType].dataPoints[0].attributes.push({
      key: key,
      value: { stringValue: attributes[key] },
    });
  });

  if (metricType === 'sum') {
    metric[metricType].aggregationTemporality =
      'AGGREGATION_TEMPORALITY_CUMULATIVE';
    metric[metricType].isMonotonic = true;
  }

  return metric;
}

function sendMetricToGrafana(metrics) {
  const body = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics,
          },
        ],
      },
    ],
  };

  fetch(`${config.metrics.endpointUrl}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${config.metrics.accountId}:${config.metrics.apiKey}`,
      'Content-Type': 'application/json',
    },
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP status: ${response.status}`);
      }
    })
    .catch((error) => {
      console.error('Error pushing metrics:', error);
    });
}

module.exports = {
  requestTracker,
  requestLatencyTracker,
  sendMetricsPeriodically,
  refreshUserActivity,
  markUserActive,
  markUserInactiveByToken,
  incrementAuthLoginSuccess,
  incrementAuthLoginFailure,
  pizzaPurchase,
};

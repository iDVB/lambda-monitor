const zlibPromise = require("./util/zlibPromise");
const logz = require("./services/logz");
const loggly = require("./services/loggly");

const requestLogRegex = new RegExp([
  /^REPORT RequestId: ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\t/,
  /Duration: (\d+.\d+) ms\t/,
  /Billed Duration: (\d+) ms \t/,
  /Memory Size: (\d+) MB\t/,
  /Max Memory Used: (\d+) MB\t\n$/
].map(r => r.source).join(''), '');
const requestStartRegex = new RegExp([
  /^START RequestId: [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12} /,
  /Version: (\$LATEST|\d+)\n$/
].map(r => r.source).join(''), '');
const requestEndRegex = new RegExp([
  /^END RequestId: [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\n$/
].map(r => r.source).join(''), '');

module.exports = (event, context, callback, rb) => zlibPromise
  .gunzip(Buffer.from(event.awslogs.data, 'base64'))
  .then(r => r.toString("ascii"))
  .then(JSON.parse)
  .then((resultParsed) => {
    const toLog = [];
    resultParsed.logEvents.forEach((logEvent) => {
      const requestLog = requestLogRegex.exec(logEvent.message);
      if (requestLog) {
        toLog.push({
          message: logEvent.message,
          logGroupName: resultParsed.logGroup,
          logStreamName: resultParsed.logStream,
          timestamp: new Date(logEvent.timestamp).toISOString(),
          requestId: requestLog[1],
          duration: parseFloat(requestLog[2]),
          billedDuration: parseInt(requestLog[3], 10),
          maxMemory: parseInt(requestLog[4], 10),
          memory: parseInt(requestLog[5], 10),
          env: process.env.STAGE
        });
      } else if (!logEvent.message.match(requestEndRegex) && !logEvent.message.match(requestStartRegex)) {
        rb.warning(logEvent, process.env.STAGE);
      }
    });
    return [resultParsed, toLog];
  })
  .then(([resultParsed, toLog]) => Promise.all([
    logz.log(process.env.STAGE, toLog),
    loggly.log(process.env.STAGE, toLog)
  ]).then(() => resultParsed))
  .then(resultParsed => callback(null, resultParsed))
  .catch(callback);
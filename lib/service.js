/**
 * The based service function, interface to be inherited:
 *
 *   - createSocketServer(port, callback)  => service.sock
 *   - createBeansClient()  => service.beans
 *   - createSsdbClient() => service.ssdb
 */

const events = require('events');
const net = require('net');
const inherits = require('util').inherits;
const fivebeans = require('fivebeans');
const ssdb = require('ssdb');

const configs = require('./configs');
const log = require('./log');
const protocol = require('./protocol');
const patches = require('./util').patches;
const fatal = require('./util').fatal;


/**
 * @constructor
 */
function bufferParser() {
  this.unfinished = new Buffer('');
}


/**
 * Parse buffer to string chunks
 *
 * @param {Buffer} buf
 * @return {Array}  // datapoints
 */
bufferParser.prototype.parse = function(buf) {
  // pick up the unfinished buffer last time
  buf = Buffer.concat([this.unfinished, buf]);
  var result = protocol.decode(buf);
  this.unfinished = result[1];
  return result[0];
};


/**
 * @constructor
 */
function Service() {
  events.EventEmitter.call(this);
}
inherits(Service, events.EventEmitter);


/**
 * Sockect server creator
 *
 * @param {Number} port
 * @param {Function} callback  // callback(datapoints)
 */
Service.prototype.createSocketServer = function(port, host, callback) {
  this.sock = net.createServer(function(conn) {

    if (!conn._bellBufferParser) {
      conn._bellBufferParser = new bufferParser();
    }

    var fd = conn._handle.fd;
    log.info('New connection established, fd: %d', fd);

    conn.on('data', function(buf) {
      try {
        var datapoints = conn._bellBufferParser.parse(buf);
      } catch (e) {
        log.warn('Invalid input: %s', buf.slice(0, 45));
        return;
      }
      callback(datapoints);
    });

    conn.on('close', function() {
      delete conn._bellBufferParser;
      log.info('Client disconnected, fd: %d', fd);
    });
  })
  .on('error', function(err) {
    log.error('Socket error: %s', err);
  })
  .listen(port, host, function() {
    log.info('Listening on port: %d..', port);
  });

  return this;
};


Service.prototype.createBeansClient = function() {
  var host = configs.beanstalkd.host;
  var port = configs.beanstalkd.port;

  this.beans = new fivebeans.client(host, port);
  patches.patchBeansClient(this.beans);
  return this;
};


/**
 * @param {String} action // 'use'/'watch'
 */
Service.prototype.connectBeans = function *(action) {
  action = action || 'use';

  var self = this;
  var beans = this.beans;
  var tube = configs.beanstalkd.tube;
  var _action = {use: 'using', watch: 'watching'}[action];

  beans.on('connect', function() {
    beans[action](tube, function(e, _) {
      log.info('Beanstalkd connected, %s tube %s', _action, tube);
      self.emit('beans connected');
    });
  }).connect();

  beans.on('error', function(err) {
    fatal('Beanstalkd connect error: %s', err);
  });

  // yield until beans was connected
  yield function(done) {
    self.on('beans connected', done);
  };

  return this;
};


Service.prototype.createSsdbClient = function() {
  var options = {
    port: configs.ssdb.port,
    host: configs.ssdb.host,
    size: configs.ssdb.size
  };
  this.ssdb = ssdb.createClient(options);
  this.ssdb.promisify();
  return this;
};

exports = module.exports = Service;

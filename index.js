var EventEmitter = require("events").EventEmitter;
var Promise = require("bluebird");

function Connection(options, implOptions, readyCallback) {
  this.readyCallback = readyCallback;
  this.queues = {};
  this.exchanges = {};
  this.eventEmitter = new EventEmitter();
}

function Exchange(connection, name, options) {
  this.name = name;
  this.options = options;
  this.connection = connection;
}

function Queue(connection, name, options) {
  this.connection = connection;
  this.name = name;
  this.options = options;
  this.bindings = [];
  this.subscribers = [];
  this.pending = [];
}

Connection.prototype.connect = function () {
  var self = this;
  setImmediate(function () {
    self.eventEmitter.emit("ready");
    if (self.readyCallback) {
      self.readyCallback();
    }
  });
};

Connection.prototype.exchange = function (name, options, openCallback) {
  var exchange = this.exchanges[name];
  if (!exchange) {
    exchange = new Exchange(this, name, options);
    this.exchanges[name] = exchange;
  }
  if (openCallback) {
    openCallback();
  }
  return exchange;
};

Connection.prototype.queue = function (name, options, callback) {
  var self = this;
  var queue = this.queues[name];
  if (!queue) {
    queue = new Queue(self, name, options);
    this.queues[name] = queue;
  }
  callback(queue);
};

Connection.prototype.disconnect = function () {
  var self = this;
  self.eventEmitter.emit("close");
  this._resetFake();  
}

Connection.prototype.on = function (name, callback) {
  return this.eventEmitter.on(name, callback);
};

Connection.prototype.once = function (name, callback) {
  return this.eventEmitter.once(name, callback);
};

Connection.prototype._resetFake = function () {
  var self = this;
  self.eventEmitter.removeAllListeners();
  var queueList = Object.keys(self.queues).map(function (key) {
    return self.queues[key];
  });
  queueList.forEach(function (queue) {
    queue.destroy();
  });
  self.exchanges = [];
};

Queue.prototype.bind = function (exchangeName, routingPattern, callback) {
  // "foo.*" matches "foo.bar", while "foo.#" matches both "foo.bar" and "foo.bar.baz"
  var pattern = new RegExp("^" + routingPattern.replace(".", "\\.").replace("#", "(\\w|\\.)+").replace("*", "\\w+") + "$");
  var binding = function (routingKey, routingExchangeName) {
    if (routingExchangeName !== exchangeName) {
      return false;
    }
    return pattern.exec(routingKey);
  };
  this.bindings.push(binding);
  if (callback) {
    callback();
  }
};

var tagCounter = 0;

Queue.prototype.subscribe = function (options, callback) {
  if (!callback) {
    callback = options;
    options = {};
  }

  var consumerTag = "tag-" + tagCounter++;
  this.subscribers.push({callback: callback, tag: consumerTag});
  var acknowledge = function () {
  };
  var sendMessage = function (entry) {
    callback(entry.message, {}, {routingKey: entry.routingKey}, {acknowledge: acknowledge});
  };
  while (this.pending.length > 0) {
    var entry = this.pending.shift();
    setImmediate(sendMessage.bind(null, entry));
  }
  var result = Promise.resolve({consumerTag: consumerTag});
  result.addCallback = result.then.bind(result);
  return result;
};

Queue.prototype.unsubscribe = function (consumerTag) {
  this.subscribers = this.subscribers.filter(function (subscriber) {
    return subscriber.tag !== consumerTag;
  });
  var result = Promise.resolve({consumerTag: consumerTag});
  result.addCallback = result.then.bind(result);
  return result;
};

Queue.prototype.destroy = function () {
  delete this.connection.queues[this.name];
  this.subscribers = [];
  this.pending = [];
  this.bindings = [];
};

Queue.prototype.on = function () {
};

Queue.prototype._wantsKey = function (routingKey, exchange) {
  var self = this;
  return self.bindings.some(function (binding) {
    return binding(routingKey, exchange.name);
  });
};

Queue.prototype._publishIfWanted = function (routingKey, exchange, message, options) {
  var self = this;
  if (!self._wantsKey(routingKey, exchange)) {
    return;
  }

  var someOrForEach;
  if (exchange.options.type === "fanout") {
    someOrForEach = this.subscribers.forEach.bind(this.subscribers);
  } else {
    someOrForEach = this.subscribers.some.bind(this.subscribers);
  }
  var acknowledge = function () {
  };
  var sent = someOrForEach(function (subscriber) {
    setImmediate(function () {
      subscriber.callback(message, {}, {routingKey: routingKey}, {acknowledge: acknowledge});
    });
    return true;
  });
  if (!sent) {
    if (options.durable) {
      self.pending.push({routingKey: routingKey, message: message});
    }
  }
};

Exchange.prototype.publish = function (routingKey, message, options) {
  var self = this;
  options = options || {};
  Object.keys(self.connection.queues).forEach(function (name) {
    var queue = self.connection.queues[name];
    queue._publishIfWanted(routingKey, self, message, options);
  });
};

var connection;

module.exports = {
  Connection: Connection,
  createConnection: function (options, implOptions, readyCallback) {
    if (!connection) {
      connection = new Connection(options, implOptions, readyCallback);
      connection.connect();
    }
    return connection;
  },
  resetFake: function () {
    if (connection) {
      connection._resetFake();
    }
  }
};

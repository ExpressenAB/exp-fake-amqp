var assert = require("assert");
var fakeAmqp = require("../index.js");
require("chai").should();

describe("fakeAmqp", function () {
  var connection;

  beforeEach(function () {
    connection = fakeAmqp.createConnection();
  });

  before(function () {
    fakeAmqp.resetFake();
  });

  afterEach(function () {
    fakeAmqp.resetFake();
  });

  it("Can deliver messages directly", function (done) {
    var exchange = connection.exchange("testExchange", {});
    connection.queue("theQueue", {}, function (queue) {
      queue.bind("testExchange", "hey", function () {
        queue.subscribe(function (message) {
          message.should.equal("hello!");
          done();
        });
        exchange.publish("hey", "hello!", {});
      });
    });
  });

  it("Can queue messages for later delivery", function (done) {
    var exchange = connection.exchange("testExchange", {});
    connection.queue("theQueue", {}, function (queue) {
      queue.bind("testExchange", "hey", function () {
        exchange.publish("hey", "hello again!", {durable: true});
        queue.subscribe(function (message) {
          message.should.equal("hello again!");
          done();
        });
      });
    });
  });

  it("Can unsubscribe from queues", function (done) {
    var exchange = connection.exchange("testExchange3", {});

    function subscribeAndUnsubscribe(queue, setupDone) {
      queue.bind("testExchange", "hey", function () {
        var ctag;
        queue.subscribe(function (msg) {
          assert.fail("Shouldn't get a message when not subscribed: " + msg);
        }).addCallback(function (ok) {
          ctag = ok.consumerTag;
          setImmediate(function () {
            // A little later
            queue.unsubscribe(ctag);
            setupDone();
          });
        });
      });
    }

    connection.queue("foo", {}, function (queue) {
      subscribeAndUnsubscribe(queue, function () {
        exchange.publish("hey", "hello un-subscribed!", {});
        done();
      });
    });
  });

  it("Invokes a promise callback on unsubscribe", function (done) {
      connection.queue("foo", {}, function (queue) {
        queue.subscribe(function (msg) {
          //noop
        }).addCallback(function (ok) {
          setImmediate(function () {
            queue.unsubscribe(ok.consumerTag).addCallback(function (ok) {
                done();
            });
          });
        });
      })
  });

  it("Connection emits close on disconnect", function (done) {
    var conn = fakeAmqp.createConnection();
    conn.connect();
    conn.on("close", done);
    conn.disconnect();  
  })

  it("Connection emits ready when using on", function (done) {
    var conn = fakeAmqp.createConnection();
    conn.connect();
    conn.on("ready", done);
  });

  it("Connection emits ready when using once", function (done) {
    var conn = fakeAmqp.createConnection();
    conn.connect();
    conn.once("ready", done);
  });
});

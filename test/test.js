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
});

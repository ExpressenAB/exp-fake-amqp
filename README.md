fake-amqp
=========

Example usage:

```javascript
var fakeAmqp = require("exp-fake-amqp");

connection = fakeAmqp.createConnection();
var exchange = connection.exchange("testExchange", {});
connection.queue("theQueue", {}, function (queue) {
  queue.bind("testExchange", "route", function () {
    queue.subscribe(function (message) {
      console.log(message);
    });
    exchange.publish("route", "hello!", {});
  });
});
```

For further examples see the tests.

### Overriding AMQP
You might want to override `amqp` with `fake-amqp` in tests. This can be done this way:

```javascript
var amqp = require("amqp");
var fakeAmqp = require("exp-fake-amqp");

amqp.Connection = fakeAmqp.Connection;
amqp.createConnection = fakeAmqp.createConnection;
```

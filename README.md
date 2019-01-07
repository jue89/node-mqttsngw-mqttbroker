# MQTT-SN Gateway: MQTTBroker

This module is part of [mqttsngw](https://github.com/jue89/node-mqttsngw). It is responsible for handling and maintaining connections to the MQTT broker.

## Factory

```js
const Broker = require('mqttsngw-mqttbroker');
mqttsngw.attach(Broker(opts));
```

Creates a new MQTTBroker factory and attaches it to an existing instance of *mqttsngw*. ```opts``` has the following fields:
 * ```log```: Optional. An object containing logging callbacks for all log levels (```error```, ```warn```, ```info```, ```debug```). Every callback is called with a human-readable message as the first argument followed by an object containing more information regarding the event: ```{ error: (msg, info) => { ... }, ...}```.
 * ```broker```: Mandatory. Callback function for creation of individual client configuration based on the ```clientId```: ```(clientId) => clientOpts```. ```clientOpts``` is an object:
   * ```url```: Mandatory. URL pointing to the broker.
   * *All other options accepted by the connect method of [MQTT.js](https://github.com/mqttjs/MQTT.js)*


## State Machines

### [MQTTBroker] Main

 * **listening**: Listens for incoming connection requests from the event bus. If a request is received, a new instance of *[MQTTBroker] Client* is created and started.

### [MQTTBroker] Client

Handles connection to the broker.

 * **init**: Preparing the state machine.
 * **connect**: Tries to connect to the broker.
 * **connected**: The connection has been successfully established.


## Events

Several events are consumed and emitted by the *MQTTBroker* module on the event bus.

### Consumed

| Event                          | State Machine          | Description |
| ------------------------------ | ---------------------- | ----------- |
| brokerConnect,*,req            | [MQTTBroker] Main      | Connection request |
| brokerSubscribe,*,req          | [MQTTBroker] Client    | Request subscription to a topic |
| brokerUnsubscribe,*,req        | [MQTTBroker] Client    | Request unsubscribing a topic |
| brokerPublishFromClient,*,req  | [MQTTBroker] Client    | A sensors publishes a message to the broker |
| brokerPublishToClient,*,res    | [MQTTBroker] Client    | Response whether a message has been published to a client |
| brokerDisconnect,*,call        | [MQTTBroker] Client    | Disconnect from the broker |


### Emitted

| Event                          | State Machine          | Description |
| ------------------------------ | ---------------------- | ----------- |
| brokerConnect,*,res            | [MQTTBroker] Client    | Response to a connection request |
| brokerSubscribe,*,res          | [MQTTBroker] Client    | Response to a subscription request |
| brokerUnsubscribe,*,res        | [MQTTBroker] Client    | Response to a unsubscribe request |
| brokerPublishFromClient,*,res  | [MQTTBroker] Client    | Response whether a message has been published to the broker |
| brokerPublishToClient,*,req    | [MQTTBroker] Client    | The broker publishes a message to the client |
| brokerDisconnect,*,notify      | [MQTTBroker] Client    | Informs the client that the connection has been closed |

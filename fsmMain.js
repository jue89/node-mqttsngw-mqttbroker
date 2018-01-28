const FSM = require('edfsm');
module.exports = (bus, log) => {
	const clientFactory = require('./fsmClient.js')(bus, log);
	return FSM({
		fsmName: '[MQTTBroker] Main',
		log: log,
		input: bus,
		output: bus,
		firstState: 'listening'
	}).state('listening', (ctx, i, o, next) => {
		// Listen for broker connect messages
		i(['brokerConnect', '*', 'req'], (data) => {
			data.broker = ctx.broker(data.clientId);
			clientFactory.run(data);
		});
	});
};

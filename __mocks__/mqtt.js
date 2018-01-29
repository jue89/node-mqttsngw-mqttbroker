const EE = require('events');
module.exports.connect = jest.fn(() => {
	const c = new EE();
	c.subscribe = jest.fn();
	module.exports._client = c;
	return c;
});

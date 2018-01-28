const EE = require('events');
module.exports.connect = jest.fn(() => {
	const c = new EE();
	module.exports._client = c;
	return c;
});

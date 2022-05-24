const Sequelize = require('sequelize');
const { sequelize } = require('./sequelize');

// Model for User data
const eventSubscriptions = sequelize.define('eventSubscriptions', {
    groupId:   { type: Sequelize.STRING },
    botId:     { type: Sequelize.STRING },
    eventType: { type: Sequelize.STRING }
},
{
    indexes: [
	{
	    unique: true,
	    fields: [ 'groupId', 'botId', 'eventType' ]
	},
	{
	    unique: false,
	    fields: [ 'botId', 'eventType' ]
	},
	{
	    unique: false,
	    fields: [ 'botId' ]
	}
    ]
});


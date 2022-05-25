const Sequelize = require('sequelize');
const { sequelize } = require('./sequelize');

// Model for User data
const botConfig = sequelize.define('botConfig', {
    token:               { type: Sequelize.STRING }
//    ,groupId:            { type: Sequelize.STRING }
    ,botId:              { type: Sequelize.STRING }
    ,zendesk_domain:     { type: Sequelize.STRING }
    ,zendesk_webhook_id: { type: Sequelize.STRING }
    ,zendesk_trigger_id: { type: Sequelize.STRING }
},
{
    indexes: [
	{
	    unique: true,
	    fields: [ 'botId' ]
	}
//	,{
//	    unique: true,
//	    fields: [ 'groupId', 'botId' ]
//	},
//	{
//	    unique: false,
//	    fields: [ 'groupId', 'zendesk_domain' ]
//	},
//	{
//	    unique: false,
//	    fields: [ 'botId', 'zendesk_domain' ]
//	}
    ]
});

// Model for event subscriptions - which groups will receive notifications of new objects
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

exports.BotConfig          = botConfig;
exports.EventSubscriptions = eventSubscriptions;

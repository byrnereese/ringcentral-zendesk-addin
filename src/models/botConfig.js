const Sequelize = require('sequelize');
const { sequelize } = require('./sequelize');

// Model for User data
exports.BotConfig = sequelize.define('botConfig', {
    token:               { type: Sequelize.STRING }
    ,groupId:            { type: Sequelize.STRING }
    ,botId:              { type: Sequelize.STRING }
    ,zendesk_domain:     { type: Sequelize.STRING }
    ,zendesk_webhook_id: { type: Sequelize.STRING }
    ,zendesk_trigger_id: { type: Sequelize.STRING }
},
{
    indexes: [
	{
	    unique: true,
	    fields: [ 'groupId', 'botId' ]
	},
	{
	    unique: false,
	    fields: [ 'groupId', 'zendesk_domain' ]
	},
	{
	    unique: false,
	    fields: [ 'botId', 'zendesk_domain' ]
	},
	{
	    unique: true,
	    fields: [ 'token' ]
	}
    ]
});

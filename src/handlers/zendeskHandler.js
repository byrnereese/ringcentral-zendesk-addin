const { BotConfig }                 = require('../models/models')
const { EventSubscriptions }        = require('../models/models')
const { getZendeskClient, getZendeskOAuth, loadTicket }
                                    = require('../lib/zendesk')
const Bot                           = require('ringcentral-chatbot-core/dist/models/Bot').default;
const querystring                   = require('querystring');
const { Template }                  = require('adaptivecards-templating');
const setupSubscriptionCardTemplate = require('../cards/setupSubscriptionCard.json');
const ticketCardTemplate            = require('../cards/ticketCard.json');
const { Op }                        = require("sequelize");

const zendeskOAuthHandler = async (req, res) => {
    const { state } = req.query
    const [groupId, botId, userId] = state.split(':')
    console.log(`Requesting installation of bot (id:${botId}) into chat (id:${groupId}) by user (id:${userId})`)
    const bot          = await Bot.findByPk(botId)
    const query        = { groupId, botId }
    const botConfig    = await BotConfig.findOne({ where: query })
    const zendeskOAuth = getZendeskOAuth( botConfig.zendesk_domain )
    const tokenUrl     = `${process.env.RINGCENTRAL_CHATBOT_SERVER}${req.url}`;
    //console.log(`Zendesk domain: ${botConfig.zendesk_domain}`)
    //console.log(`Token URL:      ${tokenUrl}`);
    const tokenResponse = await zendeskOAuth.code.getToken( tokenUrl );
    const token = tokenResponse.data.access_token;
    console.log("Successfully obtained OAuth token: " + token)
    if (botConfig) {
        await botConfig.update({ 'token': token })
    } else {
	console.log("DEBUG: THIS SHOULD NEVER HAPPEN")
        await BotConfig.create({ ...query, 'token': token })
    }
    const cardData = { 'botId': botId,'groupId': groupId };
    let zendesk = getZendeskClient(token, botConfig.zendesk_domain)
    const template = new Template(setupSubscriptionCardTemplate);
    const card = template.expand({ $root: cardData });
    console.log("DEBUG: posting card to group " + groupId)
    bot.sendAdaptiveCard( groupId, card);
    return
}

const zendeskWebhookHandler = async (req, res) => {
    let { botId } = req.params;
    if (typeof botId === "undefined") {
        console.log("Received a webhook but the bot ID is empty. Something is wrong.")
        res.send('<!doctype><html><body>OK</body></html>')
        return
    }
    console.log(`Received webhook for bot ${botId} and ticket ${req.body.ticket_id}`)

    /*
      idea.idea.created_at_fmt = new Date( idea.idea.created_at ).toDateString()
      if (idea.idea.created_by_user) {
      cardData['created_by'] = idea.idea.created_by_user
      } if (idea.idea.created_by_portal_user) {
      cardData['created_by'] = idea.idea.created_by_portal_user
      } else if (idea.idea.created_by_idea_user) {
      cardData['created_by'] = idea.idea.created_by_idea_user
      }
      if (!cardData['created_by']['avatar_url']) {
      cardData['created_by']['avatar_url'] = gravatar.url(cardData['created_by'].email);
      }
      cardData['idea'] = idea.idea
    */
    const bot = await Bot.findByPk(botId)
    const template = new Template(ticketCardTemplate);
    let cardData = {}
    if (bot) {
	console.log(`Looking up subscribers for the event (bot: ${botId})`)
	const subs = await EventSubscriptions.findAll({ where: { 'botId': botId, 'eventType': 'ticket' } })
	let ticket = undefined
	for (let sub of subs) {
	    console.log(`Delivering notification to group: ${sub.groupId}`)
	    const botConfig = await BotConfig.findOne({ where: { 'botId': botId, 'groupId': sub.groupId } })
	    let token = botConfig ? botConfig.token : undefined
	    let zendesk = getZendeskClient(botConfig.zendesk_domain, token)
	    if (!ticket) {
		ticket = await loadTicket( zendesk, req.body.ticket_id )
		console.log("Found ticket: ", ticket)
		ticket.created_at_fmt = new Date( ticket.created_at ).toDateString()
		cardData['zendeskUrl'] = `https://${botConfig.zendesk_domain}.zendesk.com/agent/tickets/${req.body.ticket_id}` 
		cardData['ticket'] = ticket
		cardData['card'] = {
		    "title": "A new ticket was created"
		}
	    }
	    cardData['botId']   = botConfig.botId
	    cardData['groupId'] = botConfig.groupId
	    const card = template.expand({ $root: cardData });
	    console.log(`DEBUG: posting new ticket card to group ${sub.groupId}`)
	    bot.sendAdaptiveCard( sub.groupId, card);
	}
    }
}

exports.zendeskOAuthHandler   = zendeskOAuthHandler;
exports.zendeskWebhookHandler = zendeskWebhookHandler;

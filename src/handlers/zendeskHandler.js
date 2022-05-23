const { BotConfig }                 = require('../models/models')
const { getZendeskClient, getZendeskOAuth, loadTicket }
                                    = require('../lib/zendesk')
const Bot                           = require('ringcentral-chatbot-core/dist/models/Bot').default;
const querystring                   = require('querystring');
const { Template }                  = require('adaptivecards-templating');
const setupSubscriptionCardTemplate = require('../cards/setupSubscriptionCard.json');
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
    let { webhookStr } = req.params;
    console.log('The encoded string is: ' + webhookStr);
    let buff = new Buffer(webhookStr, 'base64');
    let qs = buff.toString('ascii');
    const { groupId, botId } = querystring.parse(qs)
    if (typeof groupId === "undefined" || typeof botId === "undefined") {
        console.log("Received a webhook but the group and bot IDs were empty. Something is wrong.")
        res.send('<!doctype><html><body>OK</body></html>')
        return
    }
    console.log(`Received webhook from Zendesk (group: ${groupId}, bot: ${botId})...`)
    console.log( "Webhook content:", req.body )
    const bot = await Bot.findByPk(botId)
    const botConfig = await BotConfig.findOne({ where: { 'botId': botId, 'groupId': groupId } })
    if (bot) {
    
    }
}

exports.zendeskOAuthHandler   = zendeskOAuthHandler;
exports.zendeskWebhookHandler = zendeskWebhookHandler;

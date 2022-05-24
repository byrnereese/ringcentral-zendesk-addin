const { BotConfig }               = require('../models/models')
const { getZendeskClient, loadTicket, getZendeskUrls } = require('../lib/zendesk');
const { continueSession }         = require('pg/lib/sasl');
const { Template }                = require('adaptivecards-templating');
const gravatar                    = require('gravatar');
const Bot                         = require('ringcentral-chatbot-core/dist/models/Bot');
const helloCardTemplate           = require('../cards/helloCard.json');
const helpCardTemplate            = require('../cards/helpCard.json');
const ticketCardTemplate          = require('../cards/ticketCard.json');

const botHandler = async event => {
    console.log(`Received ${event.type} event`)
    switch (event.type) {
    case 'Message4Bot':
        await handleBotMessage(event)
        break
    case 'Message4Others':
        await handleMessage(event)
        break
    case 'BotJoinGroup': // bot user joined a new group
        await handleBotJoiningGroup(event)
        break
    case 'Delete': // bot has been uninstalled, do cleanup
        await handleBotDelete(event)
        break
    default:
	//console.log('Unknown event type: ' + event.type)
        break
    }
}

const supportedCommands = [
    "hello",
    "goodbye",
    "help"
];

const handleBotDelete = async event => {
    console.log("DEBUG: received BotDelete event: ", event)
    const { type, message } = event
    let botId = message.body.extensionId
    console.log("DEBUG: cleaning up for bot:", botId)

    // TODO - load zendesk client
    // TODO - delete webhook
    // TODO - delete trigger
    
    await BotConfig.destroy({
        where: { 'botId': message.body.extensionId }
    })
}

const handleBotJoiningGroup = async event => {
    const { bot, group } = event
    if (group.type != "Everyone") {
	const template = new Template(helloCardTemplate);
	const cardData = {
	    botId: bot.id,
	    groupId: event.group.id
	};
	const card = template.expand({
            $root: cardData
	});
	await bot.sendAdaptiveCard( group.id, card);
    } else {
	console.log("Skipping Everyone group")
    }
}

const unfurl = async ( botConfig, obj_type, obj_id ) => {
    const promise = new Promise( (resolve, reject) => {
	let token = botConfig ? botConfig.token : undefined
	let zendesk = getZendeskClient(botConfig.zendesk_domain, token)
	const cardData = {
	    'botId': botConfig.botId,
	    'groupId': botConfig.groupId
	};
	switch (obj_type) {
	case 'agent/tickets': {
	    loadTicket( zendesk, obj_id ).then( ticket => {
		console.log("Found ticket: ", ticket)
		ticket.created_at_fmt = new Date( ticket.created_at ).toDateString()
		cardData['zendeskUrl'] = `https://${botConfig.zendesk_domain}.zendesk.com/${obj_type}/${obj_id}` 
		cardData['ticket'] = ticket
		cardData['card'] = {
		    "title": "A link to Zendesk was shared"
		}
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
		const template = new Template(ticketCardTemplate);
		const card = template.expand({ $root: cardData });
		resolve(card)
	    })
	    break
	}
	default: {
	    console.log(`Unknown object type: ${obj_type}`)
	    resolve(undefined)
	    break
	}
	}
    })
    return promise
}

const handleMessage = async event => {
    const { group, bot, text, userId } = event
    const botConfig = await BotConfig.findOne({
        where: { 'botId': bot.id, 'groupId': group.id }
    })
    let urls = getZendeskUrls( text )
    for (url of urls) {
	let domain    = url[1]
	let obj_type  = url[2]
	let obj_id    = url[3]
	const botConfig = await BotConfig.findOne({
	    where: { 'zendesk_domain': domain, 'groupId': group.id }
	})
	if (botConfig) {
    	    unfurl( botConfig, obj_type, obj_id ).then( card => {
		if (card) {
		    console.log(`DEBUG: Zendesk URL found and card created. Posting card...`)
		    bot.sendAdaptiveCard( group.id, card);
		}
	    })
	}
    }
}

const handleBotMessage = async event => {
    const { group, bot, text, userId } = event
    const botConfig = await BotConfig.findOne({
        where: { 'botId': bot.id, 'groupId': group.id }
    })
    console.log( "Message received: ", event.message.text )
    let command = text.split(' ')[0].toLowerCase()
    if (!supportedCommands.includes(command)) {
	console.log(`The command ${command} is not supported. Sending message to ${group.id}`)
        await bot.sendMessage(group.id, { text: `I am sorry, but that is not an instruction I understand.` })
	return;
    }
    
    if (text === "help") {
	const template = new Template(helpCardTemplate);
	const cardData = {
	    'botId': bot.id,
	    'groupId': group.id,
	    'connectedToZendesk': (botConfig && botConfig.token ? true : false)
	};
	const card = template.expand({ $root: cardData });
	await bot.sendAdaptiveCard( group.id, card);
        return
    } else if (text === 'hello') {
        if (botConfig && botConfig.token) {
            await bot.sendMessage(group.id, { text: `It appears you already have an active connection to Zendesk in this team. To reconnect to Zendesk, say "goodbye" to me, then say "hello" again.` })
        } else {
            await handleBotJoiningGroup(event)
        }
	return
    } else if (text === 'goodbye') {
	// this is duplicated, other copy is in interactiveMessageHandler, consolidate
        if (botConfig) {
	    botConfig.destroy().then( () => {
		console.log("DEBUG: sending goodbye message")
		bot.sendMessage(group.id, {
		    text: `You have just unlinked your Zendesk account. Say "hello" to me, and we can start fresh.`
		})
	    })
        } else {
            bot.sendMessage(group.id, {
		text: `It does not appear you have a current connection to Zendesk in this team. Say "hello" to me and we can get started.`
	    })
        }
	return
    }

    // all commands below require that the zendesk_domain field has been set. 
    if (!botConfig || (botConfig && (!botConfig.zendesk_domain || botConfig.zendesk_domain == ""))) {
        await bot.sendMessage(group.id, { text: `The bot has been updated. You will need to reauthenticate. Please type the command "goodbye" and then "hello" to reauthenticate to Zendesk.` })
	return
    }
    
}

exports.botHandler = botHandler;

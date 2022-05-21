const { BotConfig }                 = require('../models/models')
const { getZendeskClient }          = require('../lib/zendesk');
const { Template }                  = require('adaptivecards-templating');

const Bot                           = require('ringcentral-chatbot-core/dist/models/Bot').default;
const authCardTemplate              = require('../adaptiveCards/authCard.json');
const helloCardTemplate             = require('../adaptiveCards/helloCard.json');
//const setupSubscriptionCardTemplate = require('../adaptiveCards/setupSubscriptionCard.json');

const handleHelloAction = (cardData) => {
    const promise = new Promise( (resolve, reject) => {
	const template = new Template(helloCardTemplate);
	const card = template.expand({ $root: cardData });
	resolve( card )
    })
    return promise
}

const handleAuthAction = (config, cardData) => {
    const promise = new Promise( (resolve, reject) => {
	cardData['loginUrl'] = `https://${config.zendesk_domain}.aha.io/oauth/authorize?client_id=${process.env.ZENDESK_CLIENT_ID}&redirect_uri=${process.env.RINGCENTRAL_CHATBOT_SERVER}/aha/oauth&response_type=code&state=${cardData.groupId}:${cardData.botId}:${cardData.userId}`
	const template = new Template(authCardTemplate);
	const card = template.expand({ $root: cardData });
	resolve( card )
    })
    return promise
}

async function updateOrCreate (model, where, newItem) {
    // First try to find the record
   const foundItem = await model.findOne({where});
   if (!foundItem) {
        // Item not found, create a new one
        const item = await model.create(newItem)
        return  {item, created: true};
    }
    // Found an item, update it
    const item = await model.update(newItem, {where});
    return {item, created: false};
}

/*
const handleSetupSubscriptionAction = (config, submitData, cardData) => {
    const promise = new Promise( (resolve, reject) => {
	console.log(`MESSAGING: facilitating subscription process for ${submitData.product}`)
	let hookQs = `groupId=${submitData.groupId}&botId=${submitData.botId}`
	let buff = new Buffer(hookQs)
	let buffe = buff.toString('base64')
        let hookUrl = `${process.env.RINGCENTRAL_CHATBOT_SERVER}/aha/webhook/${buffe}`
	cardData['hookUrl'] = hookUrl
	const template = new Template(subscriptionCardTemplate);
	const card = template.expand({ $root: cardData });
	resolve( card )
    })
    return promise
}
*/

const buildDialog = function( title, size, card ) {
    let dialog = {
	"type": "dialog",
	"dialog": {
	    "title": title,
	    "size": size,
	    "iconUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Instagram_icon.png/2048px-Instagram_icon.png",
	    "card": card
	}
    }
    return dialog
}

const interactiveMessageHandler = async (req,res) => {
    console.log(`=====incomingCardSubmit=====\n${JSON.stringify(req.body, null, 2)}`);
    const submitData = req.body.data;
    const cardId     = req.body.card.id;
    const bot        = await Bot.findByPk(submitData.botId); 
    // TODO - we have the cardId, so let's replace cards as we go through flows
    
    // If I am authing for the first time, I need to stash the aha domain and create
    // a botConfig object
    let cardData = {
        'botId': submitData.botId,
        'groupId': submitData.groupId,
	'userId': req.body.user.id
    }
    //console.log(`cardData=`,cardData)
    let botConfig = await BotConfig.findOne({
        where: { 'botId': submitData.botId, 'groupId': submitData.groupId }
    })
    // if you have gotten this far, this means that the bot is fully setup, and an aha domain has
    // been stored for the bot. That means we can make calls to Aha! So, load the token and proceed.
    switch (submitData.actionType) {
    case 'auth': {
	if (!botConfig) {
	    console.log("DEBUG: botConfig is not set. Initializing...")
            botConfig = await BotConfig.create({
		'botId': submitData.botId,
		'groupId': submitData.groupId,
		'zendesk_domain': submitData.zendesk_domain
		// there is no token yet, so don't store it, just store the domain
	    })
	}
	if (!botConfig.zendesk_domain) {
	    console.log("DEBUG: botConfig is set, but zendesk_domain is not. Initializing...")
	    botConfig.zendesk_domain = submitData.zendesk_domain
	    await botConfig.save()
	}
	handleAuthAction( botConfig, cardData ).then( card => {
	    console.log(`DEBUG: posting auth dialog:`, card)
	    let dialog = buildDialog('Connect to Zendesk','Medium', card)
	    res.setHeader('Content-Type', 'application/json');
	    res.end(JSON.stringify(dialog))
	    //console.log(`DEBUG: sending auth card:`, card)
	    //bot.sendAdaptiveCard( submitData.groupId, card);
	})
	break;
    }
    case 'hello': {
	console.log(`MESSAGING: prompting user to enter Zendesk domain for auth`);
	handleHelloAction( cardData ).then( card => {
	    console.log(`DEBUG: opening hello dialog with card: `, card)
	    let dialog = buildDialog('Connect to Zendesk','Medium', card)
	    res.status(200);
	    res.setHeader('Content-Type', 'application/json');
	    res.end( JSON.stringify(dialog) )
	})
	break;
    }
    case 'disconnect': {
        if (botConfig) {
	    console.log("DEBUG: destroying tokens in database")
	    botConfig.destroy().then( () => {
		bot.sendMessage(submitData.groupId, {
		    text: `You have just unlinked your Zendesk account. Say "hello" to me, and we can start fresh.`
		})
	    })
        } else {
            bot.sendMessage(submitData.groupId, {
		text: `It does not appear you have a current connection to Zendesk in this team. Say "hello" to me and we can get started.`
	    })
        }
	break
    }
    /*
    case 'setup_subscription': {
	handleSetupSubscriptionAction( botConfig, submitData, cardData ).then( card => {
	    console.log("DEBUG: posting card to group "+submitData.groupId+":", card)
	    bot.sendAdaptiveCard( submitData.groupId, card);
	})
	break
	}
    */
    default: {
	console.log(`ERROR: unknown bot action: ${submitData.actionType}`)
    }
    }
}

exports.interactiveMessageHandler = interactiveMessageHandler;

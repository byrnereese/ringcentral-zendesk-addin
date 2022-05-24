const { BotConfig, EventSubscriptions } = require('../models/models')
const { getZendeskClient }              = require('../lib/zendesk');
const { Template }                      = require('adaptivecards-templating');
const Bot                               = require('ringcentral-chatbot-core/dist/models/Bot').default;
const authCardTemplate                  = require('../cards/authCard.json');
const helloCardTemplate                 = require('../cards/helloCard.json');
const subscriptionCardTemplate          = require('../cards/setupSubscriptionCard.json');
const subscriptionExistsCardTemplate    = require('../cards/subscriptionExistsCard.json');
const subscriptionCreatedCardTemplate   = require('../cards/subscribedCard.json');

const buildDialog = function( title, size, card ) {
    let dialog = {
	"type": "dialog",
	"dialog": {
	    "title": title,
	    "size": size,
	    "iconUrl": "https://cdn4.iconfinder.com/data/icons/logos-brands-5/24/zendesk-1024.png",
	    "card": card
	}
    }
    return dialog
}

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
	cardData['loginUrl'] = `https://${config.zendesk_domain}.zendesk.com/oauth/authorizations/new?client_id=${process.env.ZENDESK_CLIENT_ID}&redirect_uri=${process.env.RINGCENTRAL_CHATBOT_SERVER}/zendesk/oauth&response_type=code&state=${cardData.groupId}:${cardData.botId}:${cardData.userId}&scope=read+tickets%3Awrite+webhooks%3Awrite+triggers%3Awrite`
	console.log(`OAuth login URL: ${cardData['loginUrl']}`)
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

const handleCreateSubscriptionAction = (config, submitData, cardData) => {
    const promise = new Promise( (resolve, reject) => {
	const zendesk = getZendeskClient( config.zendesk_domain, config.token )

	console.log(`MESSAGING: creating subscription for new tickets`)
	//let hookQs     = `groupId=${submitData.groupId}&botId=${submitData.botId}`
	//let buff       = new Buffer(hookQs)
	//let buffe      = buff.toString('base64')
        //let webhookUrl = `${process.env.RINGCENTRAL_CHATBOT_SERVER}/zendesk/webhook/${buffe}`
        let webhookUrl = `${process.env.RINGCENTRAL_CHATBOT_SERVER}/zendesk/webhook/${submitData.botId}`
	cardData['webhookUrl'] = webhookUrl

	if (config.zendesk_webhook_id) {
	    console.log('Webhook has already been created, so there is no need to create one.')
	    const template = new Template(subscriptionExistsCardTemplate);
	    const card = template.expand({ $root: cardData });
	    resolve( card )
	} else {
	    console.log('Creating Zendesk webhook for the first time.');
	    zendesk.webhooks.create({
		"webhook":{
		    "name": `Zendesk Add-in subscription for RingCentral bot ${submitData.botId}`,
		    "endpoint": webhookUrl,
		    "http_method":"POST",
		    "request_format":"json",
		    "status":"active",
		    "subscriptions":["conditional_ticket_events"]
		}
	    }).then( webhook => {
		// webhook created, now create trigger
		console.log(`Zendesk webhook created. id: ${webhook.id}`)
		config.zendesk_webhook_id = webhook.id.toString()
		return zendesk.triggers.create({
		    "trigger": {
			"title": "Send webhook to RingCentral bot",
			"actions": [
			    {
				"field": "notification_webhook",
				"value": [ webhook.id,"{ \"ticket_id\": \"{{ticket.id}}\", \"type\": \"ticket\" }" ]
			    }
			],
			"conditions": {
			    "all": [ {"field": "update_type","operator": "is","value": "Create"} ],
			    "any": []
			},
			"description": "This trigger was created by the RingCentral Zendesk Add-in and causes a webhook to be transmitted when a new ticket is created."
		    }
		})
	    }).then( trigger => {
		// trigger created
		console.log(`Zendesk trigger created: ${trigger.id}`)
		config.zendesk_trigger_id = trigger.id.toString()
		let where = {
		    'botId': submitData.botId, 'groupId': submitData.groupId, 'eventType': 'ticket'
		}
		console.log('Saving event subscription:', where)
		return EventSubscriptions.findOne({ "where": where })
	    }).then( subscription => {
		if (!subscription) {
		    subscription = EventSubscriptions.create( where )
		} else {
		    // TODO post differentiated message for a subscription that has already been made
		}
		// for now, everyone will be told a subscription has been created, even if one already exists
		config.save()
		const template = new Template(subscriptionCreatedCardTemplate);
		const card = template.expand({ $root: cardData });
		resolve( card )
	    }).catch( err => {
		// TODO delete webhook
		console.log(`Could not create trigger for webhook: ${err}`);
		if (config.zendesk_webhook_id) {
		    console.log(`Rolling back webhook: ${config.zendesk_webhook_id}`)
		    zendesk.webhooks.delete( config.zendesk_webhook_id, function (err, req, result) {
			console.log(`Garbage collected webhook: ${config.zendesk_webhook_id}`)
		    })
		    config.zendesk_webhook_id = undefined
		}
		if (config.zendesk_trigger_id) {
		    console.log(`Rolling back trigger: ${config.zendesk_trigger_id}`)
		    zendesk.triggers.delete( config.zendesk_trigger_id, function (err, req, result) {
			console.log(`Garbage collected trigger: ${config.zendesk_trigger_id}`)
		    })
		    config.zendesk_trigger_id = undefined
		}
		config.save()
		reject("Failed to create subscription (zendesk webhook and trigger):", err)
	    })
	}
    })
    return promise
}

const interactiveMessageHandler = async (req,res) => {
    console.log(`=====incomingCardSubmit=====\n${JSON.stringify(req.body, null, 2)}`);
    const submitData = req.body.data;
    const cardId     = req.body.card.id;
    const bot        = await Bot.findByPk(submitData.botId); 
    // TODO - we have the cardId, so let's replace cards as we go through flows
    
    // If I am authing for the first time, I need to stash the zendesk domain and create
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
    // if you have gotten this far, this means that the bot is fully setup, and an zendesk domain has
    // been stored for the bot. That means we can make calls to Zendesk. So, load the token and proceed.
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
    case 'subscribe': {
	let card = await handleCreateSubscriptionAction( botConfig, submitData, cardData )
	if (card) {
	    console.log(`DEBUG: subscription created, posting card to group ${submitData.groupId}:`, card)
	    let dialog = buildDialog('Setting up Zendesk','Small', card)
	    res.status(200);
	    res.setHeader('Content-Type', 'application/json');
	    res.end(JSON.stringify(dialog))
	} else {
	    console.log("Returned from handleCreateSubscription with no card. Do nothing.")
	}
	break
    }
    default: {
	console.log(`ERROR: unknown bot action: ${submitData.actionType}`)
    }
    }
}

exports.interactiveMessageHandler = interactiveMessageHandler;

const zendesk         = require('node-zendesk')
const ClientOAuth2    = require('client-oauth2');
//const turnDownService = require('turndown');
//const turnDown        = new turnDownService();

const getZendeskClient = function (domain, token) {
    return zendesk.createClient({
	//"username":  username,
	"token":     token,
	"remoteUri": `https://${domain}.zendesk.com/api/v2`,
	"disableGlobalState": true,
	"oauth": true
	//,"debug": true
    });
}

const getZendeskOAuth = function ( domain ) {
    var zendeskAuth = new ClientOAuth2({
	clientId:         process.env.ZENDESK_CLIENT_ID,
	clientSecret:     process.env.ZENDESK_CLIENT_SECRET,
	redirectUri:      `${process.env.RINGCENTRAL_CHATBOT_SERVER}/zendesk/oauth`,
	accessTokenUri:   `https://${domain}.zendesk.com/oauth/tokens`,
	authorizationUri: `https://${domain}.zendesk.com/oauth/authorizations/new?client_id=${process.env.ZENDESK_CLIENT_ID}&redirect_uri=${process.env.RINGCENTRAL_CHATBOT_SERVER}/bot/oauth&response_type=code`,
	scopes: ['read','tickets:write','webhooks:write','triggers:write']
    });
    return zendeskAuth
}

const loadTicket = ( zendesk, ticketId ) => {
    console.log(`Loading ticket ${ticketId}`)
    const promise = new Promise( (resolve, reject) => {
	zendesk.tickets.show( ticketId.toString(), function (err, req, ticket) {
	    if (err) {
		console.log('ERROR loading ticket:',err)
		reject(`Error loading ticket: ${err.message}`)
	    } else {
		zendesk.users.show( ticket.requester_id, function (err, req, requestor) {
		    if (err) {
			console.log('ERROR loading requestor:',err)
			reject(`Error loading requestor for ticket: ${err.message}`)
		    } else {
			//console.log( ticket )
			ticket['requestor'] = requestor
			resolve( ticket )
		    }
		})
	    } 
        })
    })
    return promise
}

function uniq(a) {
   return Array.from(new Set(a));
}
function getZendeskUrls( text ) {
    const link_pattern = '^https?://([^\\.]*)\\.zendesk.com/(.+)/(\\d+)$'
    const link_re = new RegExp(link_pattern);
    const geturl_re = new RegExp(
	"((ftp|http|https|gopher|mailto|nezws|nntp|telnet|wais|file|prospero|aim|webcal):(([A-Za-z0-9$_.+!*(),;/?:@&~=-])|%[A-Fa-f0-9]{2}){2,}(#([a-zA-Z0-9][a-zA-Z0-9$_.+!*(),;/?:@&~=%-]*))?([A-Za-z0-9$_+!*;/?:~-]))"
	,"g"
    )
    let zendesk_urls = []
    if (urls = text.match( geturl_re, 'gi')) {
	urls = uniq(urls)
	for (url of urls) {
	    if (matches = url.match( link_re )) {
		zendesk_urls.push( matches )
	    }
	}
    }
    return zendesk_urls
}

exports.getZendeskUrls   = getZendeskUrls;
exports.getZendeskClient = getZendeskClient;
exports.getZendeskOAuth  = getZendeskOAuth;
exports.loadTicket       = loadTicket;

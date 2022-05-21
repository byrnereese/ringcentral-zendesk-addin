const zendesk         = require('node-zendesk')
const ClientOAuth2    = require('client-oauth2');
//const turnDownService = require('turndown');
//const turnDown        = new turnDownService();

const getZendeskClient = function (token, domain) {
    return zendesk.createClient({
	username:  'username',
	token:     process.env.ZENDESK_TOKEN,
	remoteUri: 'https://remote.zendesk.com/api/v2',
	disableGlobalState: true,
	debug: true
    });
}

const getZendeskOAuth = function ( domain ) {
    var zendeskAuth = new ClientOAuth2({
	clientId:         process.env.ZENDESK_CLIENT_ID,
	clientSecret:     process.env.ZENDESK_CLIENT_SECRET,
	redirectUri:      `${process.env.RINGCENTRAL_CHATBOT_SERVER}/aha/oauth`,
	accessTokenUri:   `https://${domain}.zendesk.com/oauth/tokens`,
	authorizationUri: `https://${domain}.zendesk.com/oauth/authorizations/new?client_id=${process.env.ZENDESK_SECRET}&redirect_uri=${process.env.RINGCENTRAL_CHATBOT_SERVER}/bot/oauth&response_type=code&scope=read+tickets%3Awrite+webhooks%3Awrite`,
	scopes: ''
    });
    return zendeskAuth
}

const loadTicket = ( aha, ticketId ) => {
    console.log(`WORKER: loading ticket ${ticketId}`)
    const promise = new Promise( (resolve, reject) => {
	/*
	  aha.idea.get(ideaId, function (err, data, response) {
	    if (data.idea && data.idea.description) {
		let desc = turnDown.turndown( data.idea.description.body )
		desc = desc.replace(/\s \s/g,"")
		desc = desc.replace(/\n\n/g,"\n")
		data.idea.description["body_nohtml"] = desc
	    }
            resolve( data )
            })
	 */
    })
    return promise
}

function uniq(a) {
   return Array.from(new Set(a));
}
function getZendeskUrls( text ) {
    const link_pattern = '^https?://([^\\.]*)\\.zendesk.com/(.+)/((\\w+\-)+\\d+)$'
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

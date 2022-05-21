const { extendApp } = require('ringcentral-chatbot-core');
const express       = require('express');
const axios         = require('axios');
let   Queue         = require('bull');
const crypto        = require('crypto');

const { BotConfig }    = require('./models/botConfig');
const { botHandler }   = require('./handlers/botHandler');
const { zdOAuthHandler, zdWebhookHandler } = require('./handlers/zendeskHandler');
const { interactiveMessageHandler } = require('./handlers/interactiveMessageHandler');

let PORT      = process.env.PORT || '5000';

const skills = [];
const botOptions = {
    adminRoute: '/admin', // optional
    botRoute: '/bot', // optional
    models: { // optional
        BotConfig
    }
}

const app = express();
extendApp(app, skills, botHandler, botOptions);
app.listen(process.env.PORT || process.env.RINGCENTRAL_CHATBOT_EXPRESS_PORT);

console.log('Server running...');
console.log(`Bot OAuth URI: ${process.env.RINGCENTRAL_CHATBOT_SERVER}${botOptions.botRoute}/oauth`);

setInterval(() => {
    axios.put(`${process.env.RINGCENTRAL_CHATBOT_SERVER}/admin/maintain`, undefined, {
        auth: {
            username: process.env.RINGCENTRAL_CHATBOT_ADMIN_USERNAME,
            password: process.env.RINGCENTRAL_CHATBOT_ADMIN_PASSWORD
        }
    })
    axios.put(`${process.env.RINGCENTRAL_CHATBOT_SERVER}/ringcentral/refresh-tokens`)
}, 86400000)

app.get('/aha/oauth', async (req, res) => {
    try {
        await zdOAuthHandler(req, res);
    }
    catch (e) {
        console.error(e);
    }
    res.status(200);
    res.send('<!doctype><html><body><script>close()</script></body></html>')
})

app.post('/zendesk/webhook/:webhookStr', async (req, res) => {
    try {
        await zdWebhookHandler(req, res);
    }
    catch (e) {
        console.error(e);
    }
    res.status(200);
    res.send('<!doctype><html><body><script>close()</script></body></html>')
})

app.post('/interactive-messages', async (req, res) => {
    try {
        // Shared secret can be found on RingCentral developer portal, under your app Settings
        const SHARED_SECRET = process.env.IM_SHARED_SECRET;
        if (SHARED_SECRET) {
            const signature = req.get('X-Glip-Signature', 'sha1=');
            const encryptedBody =
                  crypto.createHmac('sha1', SHARED_SECRET).update(JSON.stringify(req.body)).digest('hex');
            if (encryptedBody !== signature) {
                res.status(401).send('Incorrect SHARED_SECRET.');
                return;
            }
            await interactiveMessageHandler(req,res);
        } else {
	    console.log("ERROR: Cannot process webhooks from RingCentral. Please set IM_SHARED_SECRET.")
	}
    } catch (e) {
        console.log(e);
    }
   
    if (!res.headersSent) {
	res.status(200);
	res.json('OK');
    }
});

exports.app = app;

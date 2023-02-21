const { Analytics } = require('@segment/analytics-node')
const crypto = require('crypto');
// TODO: fill with your hash key
function getHash(input) {
    return crypto.createHash('sha256').update(input).digest('hex');
}

// instantiation
// TODO: fill with your Segment key
const analytics = new Analytics({ writeKey: 'xlXnHES4XlHyloBQnzSDGRvq8axDmoi8' })

const appName = 'RingCentral Zendesk Add-In';
const version = '0.0.1';

exports.identify = function identify({ rcAccountId, extensionId }) {
    const identifyTraits = {
        rcAccountId: getHash(rcAccountId),
        version
    };
    analytics.identify({
        userId: getHash(extensionId),
        traits: identifyTraits,
        integrations: {
            All: true,
            Mixpanel: true,
        }
    });
}

exports.group = function group({ extensionId, rcAccountId }) {
    analytics.group({
        userId: getHash(extensionId),
        groupId: getHash(rcAccountId),
        traits: {
            version
        },
        integrations: {
            All: true,
            Mixpanel: true,
        }
    });
}

function track(userId, event, properties = {}) {
    const trackProps = {
        appName: appName,
        version,
        ...properties,
    };
    analytics.track({
        userId,
        event,
        properties: trackProps,
        integrations: {
            All: true,
            Mixpanel: true,
        },
    });
}

exports.trackPage = function page({ extensionId, rcAccountId, category, properties = {} }) {
    analytics.page({
        userId: getHash(extensionId),
        category,
        properties: {
            appName: appName,
            version,
            ...properties,
        },
        integrations: {
            All: true,
            Mixpanel: true,
        },
    });
}

exports.trackZendeskDomainRegistration = function trackZendeskDomainRegistration({ extensionId, rcAccountId }) {
    const properties = {
        rcAccountId: getHash(rcAccountId)
    };
    track(
        getHash(extensionId),
        'Registered Zendesk domain',
        properties
    );
}
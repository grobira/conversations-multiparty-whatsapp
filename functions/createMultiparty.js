const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SENDER, SYNC_SERVICE, SYNC_MAP } = process.env

const INVITE_HSM = "Bom dia, você foi solicitado a participar de uma conversa em grupo. Você aceita participar desta conversa ?"

exports.handler = async function (context, event, callback) {
    const client = context.getTwilioClient()
    const res = response()

    const inviteConversations = await createMultiparty(client, event);
    res.setBody(inviteConversations)
    callback(null, res)
}


const response = () => {
    // Create a custom Twilio Response
    // Set the CORS headers to allow Flex to make an HTTP request to the Twilio Function
    const response = new Twilio.Response()

    const headers = {
        'Access-Control-Allow-Origin': '*', // change this after to the web URL
        'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Credentials': true,
        'Content-Type': 'application/json'
    }
    response.setHeaders(headers)

    return response
}


const createMultiparty = async (client, { ConversationSid, CustomerAddress, MainCustomer }) => {
    await enableMultipart(client, { ConversationSid });
    const inviteConversations = await inviteNewParticipant(client, { CustomerAddress, ConversationSid });
    await createSyncMap(client, { ConversationSid }, [CustomerAddress, MainCustomer])

    return { inviteConversations }
}

const enableMultipart = async (client, { ConversationSid }) => {

    const { attributes } = await client.conversations.v1.conversations(ConversationSid).fetch();
    const attributesJson = JSON.parse(attributes)

    attributesJson.multiparty = true;
    console.log(attributesJson, { attributes: JSON.stringify(attributesJson) })

    const conversationsUpdated = await client.conversations.v1.conversations(ConversationSid).update({ attributes: JSON.stringify(attributesJson) })

    return {}
}

const inviteNewParticipant = async (client, { CustomerAddress, ConversationSid }) => {

    const conversations = await client.conversations.v1.conversations.create({ attributes: JSON.stringify({ invitedTo: ConversationSid }) });
    console.log(conversations.sid, conversations)


    console.log(CustomerAddress, TWILIO_SENDER)
    const addParticipant = await client.conversations.v1.conversations(conversations.sid).participants
        .create({
            'messagingBinding.address': CustomerAddress,
            'messagingBinding.proxyAddress': TWILIO_SENDER
        })


    const messages = await client.conversations.v1.conversations(conversations.sid)
        .messages
        .create({ body: INVITE_HSM });


    const conversationsWebhook = await client.conversations.v1.conversations(conversations.sid).webhooks
        .create({
            'configuration.method': 'GET',
            'configuration.filters': ['onMessageAdded'],
            'configuration.url': 'https://multiparty-services-5312-dev.twil.io/inviteHandler',
            target: 'webhook'
        });

    return conversations
}

const createSyncMap = async (client, { ConversationSid }, participants) => {

    await client.sync.v1.services(SYNC_SERVICE)
        .syncMaps(SYNC_MAP)
        .syncMapItems
        .create({
            key: ConversationSid, data: {
                windows: participants.map(participant => {
                    return {
                        participant,
                        lastMessage: Date.now()
                    }
                })
            }
        })

    return
}


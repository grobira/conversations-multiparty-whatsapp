const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SENDER } = process.env


exports.handler = async function (context, event, callback) {
    const { EventType } = event;
    const client = context.getTwilioClient()
    const res = response()

    switch (EventType) {
        case "onMessageAdded":
            await onMessageAddedWebhookHandler(client, event);
            break;
    }

    callback(null, res)
};

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


const onMessageAddedWebhookHandler = async (client, { ConversationSid, Body, Author }) => {

    const { attributes } = await client.conversations.v1.conversations(ConversationSid).fetch();
    console.log(ConversationSid, Body, Author)

    const inviteConversation = JSON.parse(attributes).invitedTo;

    if (Body == "Não") {
        const messages = await client.conversations.v1.conversations(ConversationSid)
            .messages
            .create({ body: 'Ok, obrigado pela resposta. Tenha um bom dia, já notifiquei o solicitante que você não irá ingressar na conversa.' })

        const rejectMessages = await client.conversations.v1.conversations(inviteConversation)
            .messages
            .create({ body: 'O participante convidado não aceitou o convite para participar desta conversa.' })

        const closedConversation = await client.conversations.v1.conversations(ConversationSid).update({ state: "closed" });

    } else if (Body == "Sim") {
        const messages = await client.conversations.v1.conversations(ConversationSid)
            .messages
            .create({ body: 'Ok, obrigado pela resposta. Iremos te adicionar na conversa em alguns instantes.' });

        const closedConversation = await client.conversations.v1.conversations(ConversationSid).update({ state: "closed" });

        const addParticipant = await client.conversations.v1.conversations(inviteConversation).participants
            .create({
                'messagingBinding.address': Author,
                'messagingBinding.proxyAddress': TWILIO_SENDER
            })
    }
}
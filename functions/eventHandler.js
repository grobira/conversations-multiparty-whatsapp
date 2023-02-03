const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SENDER } = process.env

const EXTEND_WINDOW =
  "Olá, você está participando de uma mensagem com outros participantes e existem mensagem que você ainda não recebeu, você gostaria de continuar nesta conversa?";

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

exports.handler = async function (context, event, callback) {
  const { EventType } = event;
  const client = context.getTwilioClient()

  const res = response()

  switch (EventType) {
    case "onMessageAdd":
      const body = await onMessageAddWebhookHandler(client, event);
      res.setBody(body)
      break;
  }
  callback(null, res)

};


const onMessageAddWebhookHandler = async (client, { ConversationSid, Body, Author }) => {

  const conversation = await client.conversations.v1.conversations(ConversationSid).fetch();

  const multiparty = JSON.parse(conversation.attributes).multiparty
  if (multiparty == true) {
    console.log("Multiparty conversations")

    if (Author.includes("whatsapp")) {
      await updateWindow(client, { ConversationSid, CustomerAddress: Author })
    }

    const extend = await checkWhatsappWindow(client, { ConversationSid })

    if (extend != null && extend.length != 0) {
      await sendHsmToExtendWindow(client, extend)
    }

    const recognizedAuthor = getCustomerName(Author);

    return { body: `${recognizedAuthor} : ${Body}` }

  } else {
    console.log("Default conversations")

    return {}

  }

}

const getCustomerName = (phoneNumber) => {
  // ideally this would fetch customer name
  // For the demo we will just mock names

  if (phoneNumber.includes("XXXXX")) {
    return "Customer A"
  } else if (phoneNumber.includes("XXXX")) {
    return "Customer B"
  }

  return phoneNumber

}

const updateWindow = async (client, { ConversationSid, CustomerAddress }) => {
  const { SYNC_SERVICE, SYNC_MAP } = process.env;

  const mapItem = await client.sync.v1.services(SYNC_SERVICE)
    .syncMaps(SYNC_MAP)
    .syncMapItems(ConversationSid)
    .fetch();

  console.log(mapItem.data);

  const outsideWindow = [];

  const customerWindow = mapItem.data.windows.map(window => {
    if (window.participant.includes(CustomerAddress.slice(-8))) {
      if (!isInsideWindow(window)) {
        outsideWindow.push({ CustomerAddress, lastMessage: window.lastMessage })
      }
      window.lastMessage = Date.now();
    }

    return window
  });

  const messages = outsideWindow.map(async customer => {
    return await sendFailedMessages(client, CustomerAddress, customer.lastMessage);
  })

  await Promise.all(messages)

  console.log(customerWindow, Date.now())

  await client.sync.v1.services(SYNC_SERVICE)
    .syncMaps(SYNC_MAP)
    .syncMapItems(ConversationSid)
    .update({
      data: {
        windows: customerWindow
      }
    }
    )

  return {}
}


const checkWhatsappWindow = async (client, { ConversationSid }) => {

  const { SYNC_SERVICE, SYNC_MAP } = process.env;

  const mapItem = await client.sync.v1.services(SYNC_SERVICE)
    .syncMaps(SYNC_MAP)
    .syncMapItems(ConversationSid)
    .fetch();

  const extendWindow = mapItem.data.windows.filter(window => {
    return !isInsideWindow(window)
  });

  console.log(extendWindow)

  return extendWindow
}

const isInsideWindow = ({ lastMessage, participant }) => {

  const msBetweenDates = Math.abs(lastMessage - Date.now());

  const hoursBetweenDates = msBetweenDates / (60 * 60 * 1000);

  console.log(lastMessage, participant, hoursBetweenDates < 24)

  return hoursBetweenDates < 24
}

const sendHsmToExtendWindow = async (client, extend) => {

  const messages = extend.map(customer => {
    console.log("Sending HSM to ", customer)
    return client.messages
      .create({ from: TWILIO_SENDER, body: EXTEND_WINDOW, to: customer.participant });
  })

  return await Promise.all(messages)

}


const sendFailedMessages = async (client, customerPhone, sinceDate) => {

  const sentMessages = await client.messages
    .list({
      dateSentAfter: new Date(sinceDate),
      from: TWILIO_SENDER,
      to: customerPhone,
      limit: 20
    })

  let failedMesages = sentMessages?.filter(msg => {
    return msg.status == "failed"
  })

  if (failedMesages.length == 0) {
    const fallback = await client.messages
      .list({
        dateSentAfter: new Date(sinceDate),
        from: TWILIO_SENDER,
        to: customerPhone.substring(0, 14) + "9" + customerPhone.substring(14),
        limit: 20
      })

    failedMesages = fallback?.filter(msg => {
      return msg.status == "failed"
    })
  }

  const bodyDate = failedMesages.map(msg => {
    return {
      body: msg.body,
      dateCreated: msg.dateCreated
    }
  })

  bodyDate.sort(function (a, b) {
    return a.dateCreated - b.dateCreated
  });

  const msgPromises = bodyDate.map(async msg => {
    return await client.messages.create({
      body: msg.body,
      to: customerPhone,
      from: TWILIO_SENDER
    })
  })

  return msgPromises
}
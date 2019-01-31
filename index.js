"use strict";
const nodemailer = require("nodemailer");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { WebhookClient } = require("dialogflow-fulfillment");
const properties = require("./config");

admin.initializeApp(functions.config().firebase);
const db = admin.firestore();

// Disable deprecated featuress
db.settings({
  timestampsInSnapshots: true
});
let email = "";
//to send emails when a user books s demo
exports.createUser = functions.firestore
  .document("zorang/{userId}")
  .onCreate((snap, context) => {
    console.log(context.params.userId);
    email = context.params.userId;
    var transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "zorang.tech@gmail.com",
        pass: "***"
      }
    });

    const mailOptions = {
      from: '"Zora" <sales@zorang.com>', // sender address
      to: email, // list of receivers
      subject: "Thanks for visting Zorang Inc.", // Subject line
      html:
        "<h1>THANKS FOR GETTING IN TOUCH</h1><br><h3>We aim to respond to all messages within 1 business day. You will be hearing from us soon!<br>In the meantime perhaps you would like to know more...</h3><br><p><a href=www.zorang.com>www.zorang.com</a></p>" // plain text body
    };
    transporter.sendMail(mailOptions, (err, info) => {
      if (err) console.log(err);
      else console.log(info);
    });
    return null;
  });

//function for sending the chat history through mail
var sendMailWithChatData = (() => {
  var executed = false;
  return function() {
    if (!executed) {
      executed = true;

      setInterval(() => {
        var collRef = db.collection("Users");

        var query = collRef
          .where("lastseen", ">", (Date.now() - 21600000).toString())
          .where("lastseen", "<", Date.now().toString())
          .get()
          .then(snapshot => {
            if (snapshot.empty) {
              console.log("no matching document exists!");
            }

            // do operations with data
            snapshot.forEach(doc => {
              console.log(doc.id, "=>", doc.data());
              console.log("data found");
              let obj = doc.data();

              let props = Object.keys(obj).sort();
              let data = "";
              props.forEach(prop => {
                let who = prop.split("/").slice(-1)[0];
                let time = new Date(parseInt(prop.split("/").slice(-2)[0]));

                data += `<ul><li><span>${time} : <b>${who}</b> => </span>${obj[
                  prop
                ].toString()}</li></ul>`;
              });
              let transporter = nodemailer.createTransport({
                service: "gmail",
                auth: {
                  user: "zorang.tech@gmail.com",
                  pass: "***"
                }
              });
              const mailOptions = {
                from: '"Zora" <sales@zorang.com>',
                to: "anurag.gupta@zorang.com",
                subject: "chat history of a user from Zora!",
                html: `${data}`
              };
              console.log("ready to send email");
              transporter.sendMail(mailOptions, (err, info) => {
                if (err) console.log(err);
                else console.log(info);
              });
            });

            return "success";
          })
          .catch(err => {
            console.log("Error in getting document" + err);
          });
      }, 21600000);
    }
  };
})();

exports.dialogflowFirebaseFulfillment = functions.https.onRequest(
  (request, response) => {
    sendMailWithChatData();
    const agent = new WebhookClient({ request, response });
    function sendResponseAndSaveChat(agent) {
      let parameters = agent.parameters;
      let keys = Object.keys(parameters);
      let parameter = "";
      keys.forEach(element => {
        if (agent.parameters[element]) {
          parameter = agent.parameters[element];
          console.log(parameter);
        }
      });

      //if email save to new collection to trigger email
      if (
        (email => {
          var re = /\S+@\S+\.\S+/;
          return re.test(email);
        })(parameter)
      ) {
        db.collection("zorang")
          .doc(parameter)
          .set({});
      }

      let intentName = agent.intent;
      //replace is used to insert dynamic parameter inplace of parameter
      let responseText = properties.obj[intentName].replace(
        "parameter",
        parameter
      );
      return savechat(agent, responseText);
    }

    let intentMap = new Map();
    intentMap.set(agent.intent, sendResponseAndSaveChat);
    agent.handleRequest(intentMap);
  }
);
//saving chat data
function savechat(agent, responseText) {
  console.log("save chat called!");
  //initialize variables
  let date = new Date();
  let lastseentime = date.setSeconds(date.getSeconds()).toString();

  let userTimestamp = date.setSeconds(date.getSeconds()).toString() + "/User ";

  let botTimestamp =
    date.setSeconds(date.getSeconds() + 1).toString() + "/Bot ";
  let pageURL = agent.session;
  //getting last segment of session id i.e. unique
  let sessionId = pageURL.substr(pageURL.lastIndexOf("/") + 1);
  let queryText = agent.query;
  const collRef = db.collection("Users").doc(sessionId);
  return db
    .runTransaction(t => {
      t.set(
        collRef,
        {
          [userTimestamp]: queryText,
          [botTimestamp]: responseText,
          lastseen: lastseentime
        },
        { merge: true }
      );
      return Promise.resolve("Write complete");
    })
    .then(doc => {
      console.log("sending response!");
      agent.add(responseText);
      return agent;
    })
    .catch(err => {
      console.log(`Error writing to Firestore: ${err}`);
      agent.add(`Failed to write "${queryText}" to the Firestore database.`);
    });
}

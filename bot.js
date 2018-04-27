/**
 * This is a Speech-To-Text-Bot meant to be used with Discord.  It is only meant to
 * interpret voice chat from a voice channel the operator or operators are in and put
 * it in text chat the operator enterred the start command in.
 * 
 * Credit:  Dogshep and Berestun initiated the base code.  Melola helped modify the
 * base code.  Bewchakka, Kalishei, Jokker, Dogshep, and Melola helped with initial
 * multi-interaction testing.  Possibly more to add...
 */

// Imported modules.
const Discord = require('discord.js');
const fs = require('fs');
const path = require('path');
const WatsonSTT = require('watson-developer-cloud');

var config = JSON.parse(fs.readFileSync("./settings.json", "utf-8"));

const bot_controller = config.bot_controller; // Client ID from Discord bot creation site.
const discord_token = config.discord_token; // APP BOT USER Token from Discord bot creation site.
const content_type = config.content_type; // The content type field for the Watson instantiation.
const watson_username = config.watson_username; // Username from IBM Watson.
const watson_password = config.watson_password; // Password from IBM Watson.
const prefix = config.prefix; // The special character at the beginning of a word in chat that
                              // indicates the text is a command for this bot.

//----
// These constants are the member.id's of some of the members of the specified Discord server.
// Not all members are listed.  These member id's are used to determine if a command is given
// by an authorized operator of this Bot.
const member_id_aa = config.member_id_aa;
const member_id_ab = config.member_id_ab;
const member_id_ac = config.member_id_ac;
const member_id_ad = config.member_id_ad;

const client = new Discord.Client();

var voiceChannel = null;
var textChannel = null;
var listenConnection = null;
var listening = false;
var newReceiver = true; // Helps determine whether to create or recreate receiver.
var recordingsPath = "";
var streamQueue = []; // Holds the queued instances of a member talking.
var indexCounter = 0; // Helps keep track of the elements in the array.
var currentIndex = 0;
//var listenStreams = new Map();    // may be useful for multiple users??  
                                    // listenStreams.get(member.id)...  
                                    // listenStreams.set(member.id, <something>)...


client.login(discord_token);

client.on("ready", handleReady.bind(this));

client.on("message", handleMessage.bind(this));

/**
 * This function ndicates in the command program that the Bot is ready to
 * operate.
 * 
 * @return void
 */
function handleReady() {
  console.log("\n                       *** This Bot is ready to play! ***\n");
} // End of function handleReady():void

/**
 * This function handles the text channel message to see if it is a command
 * this Bot recognizes.  If not, the Bot does nothing.  If the text is a command,
 * this Bot deals with it.
 * 
 * @param message Holds the members' text channel chat message.
 * @return void
 */
function handleMessage(message) {
  // Any normal message in chat will not bother the bot.
  if (!message.content.startsWith(prefix))
    return;

  // Only an authorized user, or users if added, can command the bot.  Must
  // use member.id's here, since usernames in Discord can be changed.  If it is
  // wanted to have anyone command the bot, delete this if() statement.
  if (message.member.id != member_id_aa 
      //&& message.member.id != member_id_ab 
      //&& message.member.id != member_id_ac
      //&& message.member.id != member_id_ad
     ) {
    message.reply(" the command has to come from the operator of the bot.  Thank you.");
    return;
  }

  var command = message.content.toLowerCase().slice(1);

  switch (command) {
    case 'help':
      message.reply(" hello!  The commands that you can\n" +
                    "     use that the bot will respond to are:\n\n" +
                    "         --  !help   ->  lists the commands the bot\n" +
                    "                                 responds to...\n\n" + 
                    "         --  !leave  ->  commands the bot to leave\n" +
                    "                                 the voice channel.\n\n" +
                    "         --  !listen ->  commands the bot to listen\n" +
                    "                                 in on the voice channel the\n" +
                    "                                 controller is in.");
      break;

    case 'leave':
      if (!listening) {
        message.reply(" the bot has to be present to be able to leave.");
        break;
      }

      commandLeave();
      break;

    case 'listen':
      textChannel = message.channel;
      commandListen(message);
      break;

    default:
      message.reply(" your command is not recognized!  Type '!help' for a list of commands.");
  }
} // End of the function handleMessage(any):void.

/**
 * This function controls the Bot's enterance to the voice channel that the operator is
 * in.  It also sets the directory to use for the text files that will be created.  This
 * function eventually passes off further Bot operated to the streamToWatson(any, any):void
 * function.
 * 
 * @param message Holds the members' text channel chat message.  At this point, the message
 *                is a command from an authorized operator.
 * @return void
 */
function commandListen(message) {
  let member = message.member; // This member variable becomes the sender of the message.
  
  if (!member)
    return;

  // The operator is not in a voice channel.
  if (!member.voiceChannel) {
    message.reply(" you need to be in a voice channel first.")
    return;
  }

  // The Bot is already in a voice channel.
  if (listening) {
    message.reply(" a voice channel is already being listened to!");
    return;
  }

  listening = true; // The bot is listening in a voice channel.
  voiceChannel = member.voiceChannel; // This variable becomes the voice channel the bot
                                      // operator is in.

  textChannel.send('Listening in on the **' + member.voiceChannel.name + '**!');

  recordingsPath = path.join('.', 'recordings');
  makeDir(recordingsPath);

  // The bot joins the voice channel the operator is in.
  voiceChannel.join().then((connection) => {
    listenConnection = connection;
    // Bot intro...  Warcraft II peasant "Hello".
    listenConnection.playFile('./extra_waves/000-Peasant-Hello.mp3')
      // After the intro has played...
      .on('end', (err) => {
        streamToWatson(connection, member);
      })
      .on('error', (err) => {
        console.log("An error has occurred between lines 168 and 174..." + err);
      });
  });
} // End of the function commandListen(any):void.

/**
 * This function takes care of disconnecting from the Connection and the VoiceChannel,
 * as well as the controlling boolean, that this Bot uses.
 * 
 * @return void
 */
function commandLeave() {
  listening = false;

  if(listenConnection) {
    // Bot farewell...  Warcraft II peasant "Work Done".
    listenConnection.playFile('./extra_waves/000-Peasant-Work-Done.mp3')
    // After the farewell has played...
    .on('end', (err) => {
      if (voiceChannel) {
        textChannel.send("Stopped listening!")
        // After the message is sent to the text channel...
        .then((err) => {
          voiceChannel.leave();
          voiceChannel = null;

          listenConnection.disconnect();
          listenConnection = null;

          // Resets this array to empty.
          streamQueue = [];
        });
      }
    })
    .on('error', (err) => {
      console.log("An error has occurred between lines 190 and 209..." + err);
    });
  }
} // End of the function commandLeave():void.

/**
 * This function creates a directory, unless it is already created, that the
 * text files created will be saved in.
 * 
 * @param dir The path/folder the text files created will be saved in.
 * @return void
 */
function makeDir(dir) {
  try {
    fs.mkdirSync(dir);
  } catch (err) {}
} // End of the function makeDir(any):void.

/**
 * This function handles the member's voice data by streaming the voice directly
 * into the Watson Speech-To-Text AI to produce a text file with the interpretation
 * of what was said by a member.  Then the text file is fed into the Discord text
 * channel.
 * 
 * @param usedConnection The Connection passed by the calling function that is used
 *                       to handle the Bot's actions in the voice channel.
 * @param member The member that is currently talking.
 * @return void
 */
function streamToWatson(usedConnection, member) {
  let receiver = usedConnection.createReceiver();
  let foundElement = false; // Makes sure the array has an element.
  
  // This code only runs when the member is speaking.
  usedConnection.on('speaking', (member, speaking) => {
    if (speaking) {
      // If the Receiver used has already been created but then destroyed, recreate()
      // runs.
      if (!newReceiver)
        receiver.recreate();

      // Creates an instance of the Watson AI.
      var speechToText = new WatsonSTT.SpeechToTextV1 ({
        username: watson_username,
        password: watson_password,
        url: 'https://stream.watsonplatform.net/speech-to-text/api'
      });

      // The path and name of the text file created.
      let capturedDataTextFilePath = 
        path.join(recordingsPath, `${member.id}-${Date.now()}-Discord.txt`);
      
      // Text file.
      let capturedDataTextFile = fs.createWriteStream(capturedDataTextFilePath);

      let functionAtIndex = null; // Holds the element of the array at a specified index.

      // Queues up the individual initiations of conversation.
      streamQueue.push ((thisIndex) => {
        // Voice channel stream.
        let inputStream = receiver.createPCMStream(member);
        // Watson voice recognition interpretter stream.
        let sTTRecStream = speechToText.createRecognizeStream({content_type: content_type});

        // Empty voice channel stream data into the Watson interpretter and then into
        // the text file.
        inputStream.pipe(sTTRecStream).pipe(capturedDataTextFile);
        
        // Once the Watson interpreter is empty, this closes the streams and handles
        // the text file.
        sTTRecStream.on('end', () => {
          newReceiver = false;

          sTTRecStream.end();
          capturedDataTextFile.close();
          receiver.destroy();
          
          // Send the text file data to the Discord text channel, if the data exists.
          fs.readFile(capturedDataTextFilePath, function(err, data) {
            if (err) {
              console.log("An error occurred at line 289...  " + err);
              return err;
            }

            else {
              if (!data || data == "")
                return thisIndex;

              else {
                console.log("           " + member.username + " said: " + data);
                textChannel.send(member.username + " said: " + data);
                return thisIndex;
              }
            }
          });
        })
        .on('error', (err) => {
          console.log("An error occurred within lines 279 and 306...  " + err);
          return thisIndex;
        });
      });
      
      // If the queue array is not empty.
      if (streamQueue.length > 0) {
        // The index of the array cannot be below 0.
        if (indexCounter >= 0) {
          currentIndex = indexCounter;
          indexCounter++;
          
          // Grabs the function returned from the array at the specified index.
          functionAtIndex = streamQueue.find((element, currentIndex) => {
            if (element)
              foundElement = true; // The element exists.
              
            return element;
          });
          
          if (foundElement) {
            // Grabs the index that this element of the queue is located.
            let indexToRemove = functionAtIndex(currentIndex);
            
            indexCounter = indexCounter - 1;
            foundElement = false;
            streamQueue.splice(indexToRemove, 1);
          }
        }
      }
    }
  });
} // End of the function streamToWatson(any, any):void.

// -- The original had 297 lines...
// -- The version before cleaning the comments/commented out code is 1509 lines...
// -- The version after cleaning the comments/commented out code is 451 lines...
// -- The version after cleaning the code is 269 lines...  Still using wit.ai...
// -- The version after using Watson and cleaning the unneeded code is 276 lines...
// -- The version after adding useful comments is 404 lines...
// -- The version after adding a farewell message and modifying the commandLeave()
//      function is 408 lines...
// -- The version after adding a queue system is 454 lines...
// -- The version after deleting recorded userid's and usernames is 338 lines...


/**
 *  Below this mark is all experimental code...  This statement and below can
 *  be deleted when the bot coding is finished.
 */
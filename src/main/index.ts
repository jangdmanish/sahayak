import express from 'express';
import bodyParser from 'body-parser';
import { logger } from '../utils/logger.ts';
import { config } from '../config/config.ts';
import chronoNode from 'chrono-node';
import nodeFetch from 'node-fetch';
import compression from 'compression';
import twilio from 'twilio';
import VoiceResponse, { Record, SayAttributes } from 'twilio/lib/twiml/VoiceResponse.ts';
import { twimlForSay } from '../utils/sayUtil.ts';
import fetch from 'node-fetch';
import llmManager, {getLlamaResources} from '../utils/llmUtil.ts';  
import 

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(compression());

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

const client = twilio(accountSid, authToken);
// Local session memory
const sessions: { [key: string]: any } = {};
const fallbackLanguage : string = 'en-US';

/**Entry point for twilio webhook **/
app.post("/voice_webhook/sahayak", async (req:any, res:any) => {
    const from = req.body.From;
    const language = (req.body.language as string || fallbackLanguage);
    const userSpeech = req.body.SpeechResult || "";
    sessions[from] = req.body.from;
    const twiml = new VoiceResponse();
    
    // use options object; twiml.say accepts (options, message)
    twiml.say(
        { voice: 'alice', language: language } as SayAttributes,
        "Welcome to " + config.business.business_name + ". How may I assist you?"
        );
    
    if (!userSpeech) {
        twiml.say(
        { voice: 'alice', language: language } as SayAttributes,
         "Sorry, I didn't catch that. Can you repeat?"
        );
        twiml.redirect("/voice_webhook/sahayak");
        return res.send(twiml.toString());
    }

    const gather = twiml.gather({
        input: ["speech"],
        speechTimeout: "auto",
        action: "/voice/process"
    });

    gather.say(
        { voice: 'alice', language: language } as SayAttributes,
         "I'm listening.");

    res.type("text/xml");
    res.send(twiml.toString());
});

app.post("/voice/process", async (req:any, res:any) => {
    const twiml = new VoiceResponse();
    const userSpeech = req.body.SpeechResult || "";
    const language = (req.body.language as string || fallbackLanguage);
    const from = req.body.From;
    const nlp = await llamaNLP(userSpeech);
    const session = sessions[from];

    let response = "";

    switch (nlp.intent) {
        case "schedule_appointment":
            session.pending = nlp;
            response = `You want an appointment on ${nlp.date} at ${nlp.time}. Should I confirm it?`;
            break;
        case "reschedule":
            session.pending = nlp;
            response = `You want to reschedule to ${nlp.date} at ${nlp.time}. Confirm?`;
            break;
        case "cancel":
        session.pending = nlp;
            response = "Your are requesting appointment cancellation. Confirm?";
            break;
        case "greeting":
            response = "Hello! How can I help you today?";
            break;
        default:
            response = "I didn't understand. Please repeat.";
            break;
    }

    // If confirmation needed
    if (session.pending) {
        const gather = twiml.gather({
            input: ["speech"],
            speechTimeout: "auto",
            action: "/voice/confirm"
        });

        gather.say(
            { voice: 'alice', language: language } as SayAttributes,
            response);

    } else {
        twiml.say(
        { voice: 'alice', language: language } as SayAttributes,
         response
        );
    }

    res.type("text/xml");
    res.send(twiml.toString());
});

app.post("/voice/confirm", (req:any, res:any) => {
    const twiml = new twilio.twiml.VoiceResponse();
    const from = req.body.From;
    const speech = req.body.SpeechResult || "";
    const session = sessions[from];
    const language = (req.body.language as string || fallbackLanguage);

    if (!session || !session.pending) {
        twiml.say(
        { voice: 'alice', language: language } as SayAttributes,
         "Something went wrong. Let's start over."
        );
        twiml.redirect("/voice_webhook/sahayak");
        return res.send(twiml.toString());
    }

    if (/yes|yeah|confirm|sure|ok/i.test(speech)) {
        const a = session.pending;
        twiml.say(
        { voice: 'alice', language: language } as SayAttributes,
         `Appointment confirmed for ${a.date} at ${a.time}. Thank you!`
        );
        sessions[from] = {};
    } else {
        twiml.say(
        { voice: 'alice', language: language } as SayAttributes,
        "Okay, let's start again. How can I help?"
        );
        twiml.redirect("/voice_webhook/sahayak");
    }

    res.type("text/xml");
    res.send(twiml.toString());
});

/**implement chat with a tool and a required output format in json**/
async function llamaNLP(userMessage:string) {
    const systemPrompt = `
    You are an expert intent extractor which outputs data in JSON format. Extract structured JSON:
    {
    "intent": "schedule_appointment | reschedule | cancel | greeting | fallback",
    "name": "",
    "date": "",
    "time": "",
    "notes": ""
    }
    Return ONLY JSON. No extra text.
    `;

    const response = await fetch("http://localhost:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "llama3",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage }
            ],
            stream: false
        })
    });

    const data = await response.json();

    let content = data.message.content.trim();

    // Fix unclean JSON from local models
    try {
        const cleaned = content.match(/\{[\s\S]*\}/)?.[0];
        let parsed = JSON.parse(cleaned);

        // Add natural date parsing
        if (!parsed.date) {
            let d = chronoNode.parseDate(userMessage);
            if (d) parsed.date = d.toISOString().split("T")[0];
        }
        return parsed;

    } catch (err) {
        return { intent: "fallback" };
    }
}

async function generateVoiceOpenAI(text:string) {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
            "Authorization": `Bearer OPENAI_API_KEY`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "gpt-4o-mini-tts",
            voice: "alloy",
            input: text,
            format: "mp3"
        })
    });

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

app.listen(3000, () => console.log("Voice Llama bot running on port 3000"));


/*TO DO
async function downloadWhatsAppMedia(mediaId) {
    // Step 1: Get media URL
    const mediaRes = await fetch(
        `https://graph.facebook.com/v19.0/${mediaId}`,
        {
            headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
        }
    );

    const { url } = await mediaRes.json();

    // Step 2: Download actual file
    const audioRes = await fetch(url, {
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
    });

    const buffer = await audioRes.buffer();
    return buffer;
}*/

//TO DO
/*async function sendWhatsAppVoice(to, mediaId) {
    await fetch(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            messaging_product: "whatsapp",
            to,
            type: "audio",
            audio: {
                id: mediaId,   // <— the uploaded media
                voice: true    // <— send as voice note
            }
        })
    });
}

//TO DO
/*async function respondWithVoiceAndText(to, text) {
    // 1. Generate TTS audio
    const audioBuffer = await generateVoiceElevenLabs(text);

    // 2. Upload to WhatsApp media
    const mediaId = await uploadWhatsappMedia(audioBuffer);

    // 3. Send audio message (voice note)
    await sendWhatsAppVoice(to, mediaId);

    // (Optional) Also send text
    await sendWhatsApp(to, text);
}*/

/*   Real-Time STT

Options:

    Whisper Realtime / Groq Whisper (local, low-latency)

OpenAI Realtime STT

Converts audio to text instantly

Intent & Dialogue Management

Detects scheduling intents: book, confirm, reschedule, cancel

Manages conversation context

Handles voice confirmations and emotion detection

Real-Time TTS

Generates audio dynamically as bot responds

Low-latency streaming TTS:

    OpenAI Realtime TTS (best for <1s latency)

ElevenLabs streaming API

Local TTS (Coqui, Edge, Piper)

Supports emotion-based voice as we implemented earlier

Audio Playback

Streams generated audio back to call in near real-time

Handles small buffers to avoid delays

Fallback

If the call drops or streaming fails, can fallback to WhatsApp voice notes

Real-time call integration	WebRTC, SIP.js, Twilio Programmable Voice, Agora	For FaceTime-like calls, WebRTC or SIP is easiest
Real-time STT	OpenAI Realtime STT, Whisper Realtime, Groq	Low-latency streaming
NLP / Routing	LLaMA, GPT-4, custom logic	Can run locally or cloud
Real-time TTS	OpenAI Realtime TTS, ElevenLabs streaming	Supports emotions
Audio streaming	Node.js streams, WebRTC AudioTrack	For real-time playback

Real-time call integration	WebRTC, SIP.js, Twilio Programmable Voice, Agora	For FaceTime-like calls, WebRTC or SIP is easiest
Real-time STT	OpenAI Realtime STT, Whisper Realtime, Groq	Low-latency streaming
NLP / Routing	LLaMA, GPT-4, custom logic	Can run locally or cloud
Real-time TTS	OpenAI Realtime TTS, ElevenLabs streaming	Supports emotions
Audio streaming	Node.js streams, WebRTC AudioTrack	For real-time playback */
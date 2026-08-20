const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { fork } = require('child_process');
const localtunnel = require('localtunnel');

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
    console.error("❌ BOT_TOKEN পাওয়া যায়নি! GitHub Secrets চেক করুন।");
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// হোস্টিং ফাইল রাখার ফোল্ডার তৈরি
const HOST_DIR = path.join(__dirname, 'hosted_files');
if (!fs.existsSync(HOST_DIR)) fs.mkdirSync(HOST_DIR);

let runningBotProcess = null;
let webServer = null;
let activeTunnel = null;

console.log("🤖 Telegram Hosting Control Bot is Running...");

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcomeText = 
        `🌐 **Advanced Multi-Hosting Bot**\n\n` +
        `আমাকে ফাইল পাঠান, আমি তা আসল হোস্টিং করে দেব:\n\n` +
        `1️⃣ **ওয়েবসাইট (.html):** আপলোড করলে আমি আপনাকে একটি লাইভ পাবলিক URL (Link) দেব যা পৃথিবীর যেকোনো ব্রাউজার থেকে খোলা যাবে।\n` +
        `2️⃣ **অন্য টেলিগ্রাম বট (.js):** আপলোড করলে আমি সেটি ব্যাকগ্রাউন্ডে রান/হোস্ট করে দেব।`;

    bot.sendMessage(chatId, welcomeText, { parse_mode: 'Markdown' });
});

bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const doc = msg.document;
    const fileName = doc.file_name;
    const ext = path.extname(fileName).toLowerCase();

    if (!['.html', '.js'].includes(ext)) {
        return bot.sendMessage(chatId, "❌ শুধুমাত্র `.html` (ওয়েবসাইট) অথবা `.js` (বট কোড) ফাইল আপলোড করতে পারবেন।");
    }

    bot.sendMessage(chatId, "📥 ফাইল প্রসেস করা হচ্ছে, অনুগ্রহ করে অপেক্ষা করুন...");

    try {
        const fileLink = await bot.getFileLink(doc.file_id);
        const filePath = path.join(HOST_DIR, fileName);

        // ফাইল ডাউনলোড করে লোকাল ফোল্ডারে সেভ করা
        const response = await fetch(fileLink);
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(filePath, Buffer.from(buffer));

        // ১. যদি HTML ওয়েবসাইট হয়
        if (ext === '.html') {
            if (webServer) webServer.close();
            if (activeTunnel) activeTunnel.close();

            // লোকাল এইচটিটিপি সার্ভার তৈরি
            const PORT = 3000;
            webServer = http.createServer((req, res) => {
                fs.readFile(filePath, (err, data) => {
                    if (err) {
                        res.writeHead(500);
                        res.end("Server Error");
                    } else {
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(data);
                    }
                });
            });

            webServer.listen(PORT, async () => {
                try {
                    // LocalTunnel দিয়ে ইন্টারনেট পাবলিক লিংক তৈরি
                    activeTunnel = await localtunnel({ port: PORT });
                    
                    const reply = 
                        `🚀 **Website Hosted Successfully!**\n\n` +
                        `📄 **File:** \`${fileName}\`\n` +
                        `🌐 **Public Live URL:**\n${activeTunnel.url}\n\n` +
                        `*(এই লিংকটি পৃথিবীর যেকোনো জায়গা থেকে ব্রাউজারে খোলা যাবে)*`;

                    bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
                } catch (tunnelErr) {
                    bot.sendMessage(chatId, "❌ পাবলিক লিংক তৈরি করতে সমস্যা হয়েছে।");
                }
            });
        } 
        
        // ২. যদি Node.js / Telegram Bot কোড হয়
        else if (ext === '.js') {
            if (runningBotProcess) {
                runningBotProcess.kill(); // আগের বট বন্ধ করা
            }

            // নতুন কোডটি শিশু প্রসেস (Child Process) হিসেবে রান করা
            runningBotProcess = fork(filePath);

            const reply = 
                `🤖 **Bot Hosted & Running!**\n\n` +
                `📄 **Script Name:** \`${fileName}\`\n` +
                `📌 **Status:** LIVE (Running in Background)`;

            bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
        }

    } catch (err) {
        console.error(err);
        bot.sendMessage(chatId, "⚠️ ফাইল হোস্টিং করতে কোনো ত্রুটি ঘটেছে।");
    }
});

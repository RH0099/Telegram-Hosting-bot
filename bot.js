const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { fork } = require('child_process');
const localtunnel = require('localtunnel');
const unzipper = require('unzipper');

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
    console.error("❌ BOT_TOKEN পাওয়া যায়নি! GitHub Secrets চেক করুন।");
    process.exit(1);
}

// Polling Error হ্যান্ডলার সহ বট ইনিশিয়ালাইজেশন
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.on('polling_error', (error) => {
    if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) {
        console.error('⚠️ Conflict Error: অন্য কোথাও বট চালু আছে। নিশ্চিত করুন একটিমাত্র ইনস্ট্যান্স চলছে।');
    } else {
        console.error('Polling error:', error.message);
    }
});

const HOST_DIR = path.join(__dirname, 'hosted_projects');
if (!fs.existsSync(HOST_DIR)) fs.mkdirSync(HOST_DIR, { recursive: true });

const projects = new Map();
let nextProjectId = 1;
let currentPort = 3000;

// Telegram Markdown Safe Escape
function escapeMarkdown(text) {
    if (!text) return '';
    return String(text).replace(/[_*[\]()~`>#+-=|{}.!]/g, '\\$&');
}

console.log("🤖 Multi-Project Hosting Platform Running...");

// Start Command
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcomeText = 
        `🌐 *Advanced Multi-Project Hosting Bot*\n\n` +
        `আমাকে ফাইল পাঠান, আমি আলাদা আলাদা লিংকে হোস্ট করব:\n\n` +
        `📦 *ZIP ফাইল (.zip):* HTML, CSS, JS প্রজেক্টের জন্য।\n` +
        `📄 *HTML ফাইল (.html):* Inline CSS/JS সহ বা সাধারণ পেজ।\n` +
        `📜 *JS ফাইল (.js):* ব্যাকগ্রাউন্ড বট রান করার জন্য।\n\n` +
        `📌 *কমান্ডসমূহ:*\n` +
        `• /list - অ্যাক্টিভ প্রজেক্ট ও লিংক\n` +
        `• /stop <ID> - প্রজেক্ট বন্ধ করা (যেমন: \`/stop 1\`)\n` +
        `• /stop_all - সব প্রজেক্ট বন্ধ করা`;

    bot.sendMessage(chatId, welcomeText, { parse_mode: 'Markdown' }).catch(console.error);
});

// List Command
bot.onText(/\/list/, (msg) => {
    const chatId = msg.chat.id;
    if (projects.size === 0) {
        return bot.sendMessage(chatId, "🔴 বর্তমানে কোনো অ্যাক্টিভ প্রজেক্ট চালু নেই।");
    }

    let response = `📊 *Active Hosted Projects (${projects.size}):*\n\n`;
    projects.forEach((proj, id) => {
        response += `🆔 *ID:* \`${id}\`\n`;
        response += `📁 *Name:* \`${escapeMarkdown(proj.name)}\`\n`;
        response += `📌 *Type:* ${escapeMarkdown(proj.type)}\n`;
        if (proj.url) {
            response += `🌐 *Link:* ${proj.url}\n`;
        }
        response += `❌ *Stop:* /stop_${id}\n`;
        response += `---------------------------\n`;
    });

    bot.sendMessage(chatId, response, { parse_mode: 'Markdown' }).catch(console.error);
});

// Stop Specific Project Command
bot.onText(/\/stop(?:_)?(\d+)?/, (msg, match) => {
    const chatId = msg.chat.id;
    const projId = parseInt(match[1]);

    if (!projId || !projects.has(projId)) {
        return bot.sendMessage(chatId, "⚠️ সঠিক প্রজেক্ট ID দিন। উদাহরণ: `/stop 1` বা প্রজেক্ট লিস্ট দেখতে `/list` টাইপ করুন।", { parse_mode: 'Markdown' });
    }

    stopProject(projId);
    bot.sendMessage(chatId, `🗑️ *Project ID ${projId} সফলভাবে বন্ধ করা হয়েছে!*`, { parse_mode: 'Markdown' });
});

// Stop All Command
bot.onText(/\/stop_all/, (msg) => {
    const chatId = msg.chat.id;
    if (projects.size === 0) {
        return bot.sendMessage(chatId, "⚠️ বন্ধ করার মতো কোনো প্রজেক্ট চালু নেই।");
    }

    projects.forEach((_, id) => stopProject(id));
    bot.sendMessage(chatId, "🗑️ *সকল প্রজেক্ট সফলভাবে বন্ধ করা হয়েছে!*");
});

function stopProject(id) {
    if (projects.has(id)) {
        const proj = projects.get(id);
        if (proj.tunnel) try { proj.tunnel.close(); } catch(e){}
        if (proj.server) try { proj.server.close(); } catch(e){}
        if (proj.process) try { proj.process.kill(); } catch(e){}

        if (fs.existsSync(proj.dir)) {
            fs.rmSync(proj.dir, { recursive: true, force: true });
        }
        projects.delete(id);
    }
}

// File Receiver
bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const doc = msg.document;
    const fileName = doc.file_name;
    const ext = path.extname(fileName).toLowerCase();

    if (!['.html', '.js', '.zip'].includes(ext)) {
        return bot.sendMessage(chatId, "❌ শুধুমাত্র `.zip`, `.html`, অথবা `.js` ফাইল আপলোড করতে পারবেন।");
    }

    bot.sendMessage(chatId, "📥 প্রসেস করা হচ্ছে, অনুগ্রহ করে অপেক্ষা করুন...");

    try {
        const id = nextProjectId++;
        const port = currentPort++;
        const projectDir = path.join(HOST_DIR, `proj_${id}`);
        fs.mkdirSync(projectDir, { recursive: true });

        const fileLink = await bot.getFileLink(doc.file_id);
        const downloadedFilePath = path.join(projectDir, fileName);

        const response = await fetch(fileLink);
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(downloadedFilePath, Buffer.from(buffer));

        // ১. ZIP ফাইল হোস্টিং
        if (ext === '.zip') {
            const extractPath = path.join(projectDir, 'public');
            fs.createReadStream(downloadedFilePath)
                .pipe(unzipper.Extract({ path: extractPath }))
                .on('close', async () => {
                    let serveDir = extractPath;
                    const items = fs.readdirSync(extractPath);
                    
                    if (items.length === 1 && fs.statSync(path.join(extractPath, items[0])).isDirectory()) {
                        serveDir = path.join(extractPath, items[0]);
                    }

                    startWebHosting(chatId, id, port, serveDir, fileName, 'ZIP Web Project', projectDir);
                });
        }

        // ২. একক HTML ফাইল হোস্টিং
        else if (ext === '.html') {
            startWebHosting(chatId, id, port, projectDir, fileName, 'Single HTML Page', projectDir, fileName);
        }

        // ৩. Node.js Bot হোস্টিং
        else if (ext === '.js') {
            const proc = fork(downloadedFilePath);
            projects.set(id, {
                name: fileName,
                type: 'Node.js Bot Script',
                process: proc,
                dir: projectDir
            });

            const reply = 
                `🤖 *Bot Script Hosted & Running!*\n\n` +
                `🆔 *Project ID:* \`${id}\`\n` +
                `📜 *File Name:* \`${escapeMarkdown(fileName)}\`\n` +
                `📌 *Status:* LIVE\n\n` +
                `❌ *Stop:* /stop_${id}`;

            bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' }).catch(console.error);
        }

    } catch (err) {
        console.error(err);
        bot.sendMessage(chatId, "⚠️ ফাইল হোস্টিং করার সময় ত্রুটি ঘটেছে।");
    }
});

// ওয়েব সার্ভার এবং টানেল স্টার্ট করা
function startWebHosting(chatId, id, port, targetDir, fileName, typeName, projectDir, defaultFile = 'index.html') {
    const server = http.createServer((req, res) => {
        let reqUrl = req.url === '/' ? defaultFile : req.url;
        let filePath = path.join(targetDir, decodeURIComponent(reqUrl));

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const extName = path.extname(filePath).toLowerCase();
            const mimeTypes = {
                '.html': 'text/html',
                '.js': 'text/javascript',
                '.css': 'text/css',
                '.json': 'application/json',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.svg': 'image/svg+xml',
                '.ico': 'image/x-icon'
            };

            const contentType = mimeTypes[extName] || 'application/octet-stream';
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Bypass-Tunnel-Reminder': 'true'
            });
            res.end(fs.readFileSync(filePath));
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end("404 Page Not Found");
        }
    });

    server.listen(port, async () => {
        try {
            const tunnel = await localtunnel({ port: port });
            projects.set(id, {
                name: fileName,
                type: typeName,
                url: tunnel.url,
                server: server,
                tunnel: tunnel,
                dir: projectDir
            });

            const reply = 
                `🚀 *Website Hosted Successfully!*\n\n` +
                `🆔 *Project ID:* \`${id}\`\n` +
                `📦 *Project:* \`${escapeMarkdown(fileName)}\`\n` +
                `🌐 *Public Live Link:*\n${tunnel.url}\n\n` +
                `📋 *All Projects:* /list\n` +
                `❌ *Stop this project:* /stop_${id}`;

            bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' }).catch(console.error);
        } catch (e) {
            bot.sendMessage(chatId, "❌ লাইভ লিংক তৈরি করতে সমস্যা হয়েছে।");
        }
    });
        }

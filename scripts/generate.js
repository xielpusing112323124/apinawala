const fs = require('fs');
const https = require('https');
const path = require('path');

// URLs for the complete blocklist
const LISTS = [
    { name: 'domains', url: 'https://trustpositif.komdigi.go.id/assets/db/domains', file: 'domains.txt' },
    { name: 'ip', url: 'https://trustpositif.komdigi.go.id/assets/db/ipaddress_isp', file: 'ipaddress_isp.txt' },
    { name: 'judi', url: 'https://trustpositif.komdigi.go.id/assets/db/situs_judi', file: 'situs_judi.txt' }
];

const MAX_FILE_SIZE = 45 * 1024 * 1024; // 45MB (Safe limit for GitHub)

// Function to download file
function download(url) {
    return new Promise((resolve, reject) => {
        console.log(`Downloading from ${url}...`);
        const req = https.get(url, { rejectUnauthorized: false }, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`Failed to fetch ${url}: ${res.statusCode}`));
                return;
            }
            const data = [];
            res.on('data', chunk => data.push(chunk));
            res.on('end', () => resolve(Buffer.concat(data).toString()));
        });
        req.on('error', reject);
    });
}

async function processList(item) {
    try {
        console.log(`Processing ${item.name}...`);
        const content = await download(item.url);
        console.log(`[${item.name}] Downloaded length: ${content.length}`);

        let lines = content.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.startsWith('#'));

        // Deduplicate
        lines = [...new Set(lines)];
        lines.sort();

        console.log(`[${item.name}] Total unique entries: ${lines.length}`);

        const outputContent = lines.join('\n');
        fs.writeFileSync(item.file, outputContent);
        console.log(`[${item.name}] Written to ${item.file}`);

        // Check file size and split if needed
        const stats = fs.statSync(item.file);
        if (stats.size > MAX_FILE_SIZE) {
            console.log(`[${item.name}] File size ${stats.size} exceeds limit. Splitting...`);
            splitFile(lines, item.file);
        }
    } catch (error) {
        console.error(`[${item.name}] Error:`, error.message);
        // Don't exit process, try other lists
    }
}

function splitFile(lines, filename) {
    const CHUNK_SIZE = 45 * 1024 * 1024; // 45MB target
    let currentChunk = [];
    let currentSize = 0;
    let part = 1;
    let totalSize = 0;

    const baseName = path.basename(filename, '.txt');

    for (const line of lines) {
        const lineSize = Buffer.byteLength(line + '\n');

        // If adding this line exceeds the chunk size, save current chunk and start new one
        if (currentSize + lineSize > CHUNK_SIZE) {
            const partName = `${baseName}_part${String(part).padStart(3, '0')}.txt`;
            fs.writeFileSync(partName, currentChunk.join('\n'));
            console.log(`Saved ${partName}`);
            part++;
            currentChunk = [];
            currentSize = 0;
        }
        currentChunk.push(line);
        currentSize += lineSize;
        totalSize += lineSize;
    }

    // Save remaining chunk
    if (currentChunk.length > 0) {
        const partName = `${baseName}_part${String(part).padStart(3, '0')}.txt`;
        fs.writeFileSync(partName, currentChunk.join('\n'));
        console.log(`Saved ${partName}`);
    }

    // Remove original large file to save space/avoid git rejection
    fs.unlinkSync(filename);
    console.log(`Removed original large file ${filename} (Total processed: ${totalSize} bytes)`);
}

async function main() {
    console.log("Starting blocklist update...");
    // Process all lists sequentially
    for (const list of LISTS) {
        await processList(list);
    }
    console.log("All lists processed.");
}

main();

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
    const win = new BrowserWindow({
        width: 600,
        height: 600,
        show: false,
        webPreferences: {
            offscreen: true
        }
    });

    const html = `
    <!DOCTYPE html>
    <html>
    <head><style>body { margin:0; overflow:hidden; }</style></head>
    <body>
    <canvas id="c" width="512" height="512"></canvas>
    <script>
        const canvas = document.getElementById('c');
        const ctx = canvas.getContext('2d');

        // Background rounded box
        const r = 80;
        ctx.fillStyle = '#0D0D15';
        ctx.beginPath();
        ctx.roundRect(16, 16, 480, 480, r);
        ctx.fill();

        // Outer border
        ctx.strokeStyle = '#E85D35';
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.roundRect(16, 16, 480, 480, r);
        ctx.stroke();

        // Inner border (parchment)
        ctx.strokeStyle = '#F0E3CE';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(32, 32, 448, 448, r - 12);
        ctx.stroke();

        // Mountain silhouettes (Woodblock ukiyo-e style)
        // Back mountain
        ctx.fillStyle = '#2A4056';
        ctx.beginPath();
        ctx.moveTo(60, 420);
        ctx.lineTo(210, 180);
        ctx.lineTo(360, 420);
        ctx.closePath();
        ctx.fill();

        // Mountain snowcap
        ctx.fillStyle = '#F0E3CE';
        ctx.beginPath();
        ctx.moveTo(210, 180);
        ctx.lineTo(170, 244);
        ctx.lineTo(195, 235);
        ctx.lineTo(210, 250);
        ctx.lineTo(225, 235);
        ctx.lineTo(250, 244);
        ctx.closePath();
        ctx.fill();

        // Front mountain
        ctx.fillStyle = '#003153';
        ctx.beginPath();
        ctx.moveTo(180, 420);
        ctx.lineTo(330, 220);
        ctx.lineTo(460, 420);
        ctx.closePath();
        ctx.fill();

        // Front snowcap
        ctx.fillStyle = '#F0E3CE';
        ctx.beginPath();
        ctx.moveTo(330, 220);
        ctx.lineTo(290, 274);
        ctx.lineTo(315, 268);
        ctx.lineTo(330, 280);
        ctx.lineTo(350, 266);
        ctx.lineTo(370, 274);
        ctx.closePath();
        ctx.fill();

        // Free Rider track curve (looping dynamic track)
        ctx.strokeStyle = '#E85D35';
        ctx.lineWidth = 14;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(50, 360);
        ctx.bezierCurveTo(140, 380, 190, 310, 256, 320);
        ctx.bezierCurveTo(320, 330, 360, 260, 430, 160);
        ctx.stroke();

        // Physics track line white accent
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(50, 360);
        ctx.bezierCurveTo(140, 380, 190, 310, 256, 320);
        ctx.bezierCurveTo(320, 330, 360, 260, 430, 160);
        ctx.stroke();

        // Free Rider flag / star at end of track
        ctx.fillStyle = '#E85D35';
        ctx.beginPath();
        ctx.arc(430, 160, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#F0E3CE';
        ctx.beginPath();
        ctx.arc(430, 160, 8, 0, Math.PI * 2);
        ctx.fill();

        // Hanko / Japanese seal in top-left
        ctx.fillStyle = '#E85D35';
        ctx.beginPath();
        ctx.roundRect(64, 64, 76, 76, 10);
        ctx.fill();
        ctx.fillStyle = '#F0E3CE';
        ctx.font = 'bold 38px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('道', 102, 102); // "Michi" / Path / Track

        // Text banner at bottom
        ctx.fillStyle = '#F0E3CE';
        ctx.font = 'bold 36px serif';
        ctx.letterSpacing = '6px';
        ctx.fillText('TRACK STUDIO', 256, 452);
    </script>
    </body>
    </html>
    `;

    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    // Extract canvas image data
    const pngDataUrl = await win.webContents.executeJavaScript(`
        document.getElementById('c').toDataURL('image/png');
    `);

    // Also get 256x256 for ICO
    const png256DataUrl = await win.webContents.executeJavaScript(`
        (function() {
            const c2 = document.createElement('canvas');
            c2.width = 256;
            c2.height = 256;
            const ctx2 = c2.getContext('2d');
            ctx2.drawImage(document.getElementById('c'), 0, 0, 256, 256);
            return c2.toDataURL('image/png');
        })()
    `);

    const assetsDir = path.join(__dirname, 'assets');
    if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
    }

    const png512Buffer = Buffer.from(pngDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
    const png256Buffer = Buffer.from(png256DataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');

    fs.writeFileSync(path.join(assetsDir, 'icon.png'), png512Buffer);
    console.log('Saved assets/icon.png (512x512)');

    // Build standard multi-resolution ICO (256x256 PNG embedded)
    // ICONDIR: 6 bytes
    // idReserved (2 bytes) = 0
    // idType (2 bytes) = 1
    // idCount (2 bytes) = 1
    // ICONDIRENTRY: 16 bytes
    // bWidth (1), bHeight (1), bColorCount (1), bReserved (1), wPlanes (2), wBitCount (2), dwBytesInRes (4), dwImageOffset (4)
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // type 1 = icon
    header.writeUInt16LE(1, 4); // count 1

    const entry = Buffer.alloc(16);
    entry.writeUInt8(0, 0); // width 256 -> 0
    entry.writeUInt8(0, 1); // height 256 -> 0
    entry.writeUInt8(0, 2); // color count 0
    entry.writeUInt8(0, 3); // reserved 0
    entry.writeUInt16LE(1, 4); // planes 1
    entry.writeUInt16LE(32, 6); // bit count 32
    entry.writeUInt32LE(png256Buffer.length, 8); // bytes in res
    entry.writeUInt32LE(22, 12); // image offset (6 + 16 = 22)

    const icoBuffer = Buffer.concat([header, entry, png256Buffer]);
    fs.writeFileSync(path.join(assetsDir, 'icon.ico'), icoBuffer);
    console.log('Saved assets/icon.ico');

    app.quit();
});
